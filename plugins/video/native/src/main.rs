use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
};

const CHUNK: u64 = 512 * 1024;
const FRAME_LIMIT: usize = 5 * 1024 * 1024;
/// The longest side a playback proxy is allowed to keep. A proxy exists to hand the browser a
/// codec it can decode, not to preserve the source's pixels: a 7680x2160 screen recording asks
/// libx264 for gigabytes of frame buffers, loses the allocation and kills the whole encode, and
/// one that survives costs minutes and leaves a file too large to hand over before the call
/// times out. A preview window is well inside this size, and exporting a frame still reads the
/// original file.
const PROXY_LONGEST_SIDE: u64 = 1920;
/// How many lines of ffmpeg's own complaint are kept for the failure it explains.
const ERROR_LINES: usize = 8;
/// The pieces of a proxy that are finished, keyed by session and piece. A long recording is
/// transcoded a piece at a time so playback can start on the first one; a file shorter than a
/// piece is simply one piece.
static PROXIES: OnceLock<Mutex<HashMap<(String, u32), PathBuf>>> = OnceLock::new();

fn proxies() -> &'static Mutex<HashMap<(String, u32), PathBuf>> {
    PROXIES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Where the pieces of a playback proxy are written. It is one directory for the whole process
/// rather than one per session, because a piece is worth keeping: a session that comes back to a
/// piece it has already had read again reads the file instead of encoding the same seconds twice.
fn proxy_root() -> PathBuf {
    std::env::temp_dir().join("ember-peek-video")
}

/// A piece of a proxy that is being built right now. The encode is a child process rather than a
/// call that blocks until it finishes: a piece of a large recording takes long enough that a
/// blocking call would sit past the call timeout and leave the view with nothing to say.
struct Building {
    child: Child,
    output: PathBuf,
    partial: PathBuf,
    /// The seconds of output the encode was asked for; zero when nobody said how long the piece
    /// should be, which leaves the ratio with nothing to divide by.
    seconds: f64,
    report: Arc<Mutex<Report>>,
}

/// What the reader threads have heard from ffmpeg: how far into the file it has written, and the
/// last few things it said, which is what names a failure.
#[derive(Default)]
struct Report {
    at_ms: u64,
    errors: Vec<String>,
}

static BUILDING: OnceLock<Mutex<HashMap<(String, u32), Building>>> = OnceLock::new();

fn building() -> &'static Mutex<HashMap<(String, u32), Building>> {
    BUILDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// How much of the file an encode has written, as a fraction. Without a duration from the probe
/// there is nothing to divide by, so the ratio stays at zero and the view can only report that
/// something is happening.
fn progress_ratio(at_ms: u64, seconds: f64) -> f64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0.0;
    }
    ((at_ms as f64 / 1000.0) / seconds).clamp(0.0, 1.0)
}

/// How many bytes a finished piece is. The view reads a piece back by the byte, so every answer
/// that says a piece is ready has to carry its size -- including the one that finds the piece
/// already written by an earlier request. Zero means the file could not be read, which is a
/// failure rather than an empty piece.
fn piece_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|data| data.len()).unwrap_or(0)
}

/// Ends an encode that is no longer wanted, and drops what it had written so far.
fn stop(job: Building) {
    let mut child = job.child;
    let _ = child.kill();
    let _ = child.wait();
    let _ = std::fs::remove_file(&job.partial);
}

/// Prepares a helper process -- ffmpeg, ffprobe -- for a run: a hidden console window, and a
/// working directory that is not the package this process was started from.
///
/// The working directory is the point of this. The host starts this process in the package
/// directory, and an update replaces that whole directory, which Windows refuses to rename while
/// some process has it as its working directory. A helper that inherited it would hold the update
/// off for as long as it ran; one left behind by a process the host killed -- the way an update and
/// a quit both end this process -- never lets go at all, so the update then fails every time it is
/// retried. Nothing else changes: every path a helper is given is absolute, so where it sits does
/// not matter to its work.
fn helper(command: &mut Command) {
    command.stdin(Stdio::null()).current_dir(helper_dir());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
}

/// Where a helper process is told to sit: the system temp directory, which is outside the package
/// and always exists.
fn helper_dir() -> PathBuf {
    std::env::temp_dir()
}

fn works(path: &Path) -> bool {
    let mut command = Command::new(path);
    helper(&mut command);
    command
        .arg("-version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn candidates(name: &str, setting: &str) -> Vec<PathBuf> {
    let executable = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    };
    let mut values = Vec::new();
    if let Ok(value) = std::env::var(setting) {
        values.push(PathBuf::from(value));
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            values.push(parent.join(&executable));
        }
    }
    #[cfg(windows)]
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        values.push(
            Path::new(&program_files)
                .join("ffmpeg")
                .join("bin")
                .join(&executable),
        );
    }
    values.push(PathBuf::from(executable));
    values
}

fn tool(name: &str, setting: &str) -> Option<PathBuf> {
    candidates(name, setting)
        .into_iter()
        .find(|path| works(path))
}

fn ffmpeg_tool() -> Option<PathBuf> {
    static FFMPEG: OnceLock<Option<PathBuf>> = OnceLock::new();
    FFMPEG
        .get_or_init(|| tool("ffmpeg", "EMBER_FFMPEG"))
        .clone()
}

fn probe_tool() -> Option<PathBuf> {
    static FFPROBE: OnceLock<Option<PathBuf>> = OnceLock::new();
    FFPROBE
        .get_or_init(|| {
            if let Some(ffmpeg) = ffmpeg_tool() {
                if let Some(parent) = ffmpeg.parent() {
                    let sibling = parent.join(if cfg!(windows) {
                        "ffprobe.exe"
                    } else {
                        "ffprobe"
                    });
                    if works(&sibling) {
                        return Some(sibling);
                    }
                }
            }
            tool("ffprobe", "EMBER_FFPROBE")
        })
        .clone()
}

fn probe(path: &Path) -> Option<Value> {
    let executable = probe_tool()?;
    let mut command = Command::new(executable);
    helper(&mut command);
    let output = command
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=format_name,duration:stream=codec_name,codec_type,width,height,duration",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn stream<'a>(probe: &'a Value, kind: &str) -> Option<&'a Value> {
    probe["streams"]
        .as_array()?
        .iter()
        .find(|stream| stream["codec_type"] == kind)
}

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}

/// How long the file is, asked of the container first and of the video stream second. An encode
/// that knows this can say how far along it is; a file that answers neither reports zero.
fn probe_duration(info: &Value) -> f64 {
    text(&info["format"], "duration")
        .parse::<f64>()
        .ok()
        .filter(|seconds| *seconds > 0.0)
        .or_else(|| {
            stream(info, "video").and_then(|value| text(value, "duration").parse::<f64>().ok())
        })
        .unwrap_or(0.0)
}

fn metadata(path: &Path) -> Value {
    let ffmpeg_available = ffmpeg_tool().is_some();
    let Some(info) = probe(path) else {
        return json!({"ffmpegAvailable":ffmpeg_available,"needsProxy":false});
    };
    let video = stream(&info, "video");
    let audio = stream(&info, "audio");
    let video_codec = video.map(|value| text(value, "codec_name")).unwrap_or("");
    let audio_codec = audio.map(|value| text(value, "codec_name")).unwrap_or("");
    let format = text(&info["format"], "format_name");
    let duration = probe_duration(&info);
    let native_video = matches!(video_codec, "h264" | "av1" | "vp8" | "vp9");
    let native_audio =
        audio.is_none() || matches!(audio_codec, "aac" | "mp3" | "opus" | "vorbis" | "flac");
    let native_container = format.contains("mov")
        || format.contains("mp4")
        || format.contains("webm")
        || format.contains("matroska")
        || format.contains("ogg");
    json!({
        "duration": duration,
        "width": video.and_then(|value| value["width"].as_u64()).unwrap_or(0),
        "height": video.and_then(|value| value["height"].as_u64()).unwrap_or(0),
        "videoCodec": video_codec,
        "audioCodec": audio_codec,
        "format": format,
        "ffmpegAvailable": ffmpeg_available,
        "needsProxy": !(native_video && native_audio && native_container),
    })
}

fn session(params: &Value) -> Result<&str, String> {
    params["session"].as_str().ok_or("Missing session".into())
}

fn source(params: &Value) -> Result<&Path, String> {
    params["path"]
        .as_str()
        .map(Path::new)
        .ok_or("Missing file path".into())
}

fn safe_session(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .take(96)
        .collect()
}

/// The box a proxy is scaled into, or `None` when the probe could not report a size. Both of
/// the box's sides are already the source's own below the cap, so a video smaller than
/// `PROXY_LONGEST_SIDE` is passed through at its own size instead of being blown up.
fn proxy_box(width: u64, height: u64) -> Option<(u64, u64)> {
    if width == 0 || height == 0 {
        return None;
    }
    Some((
        width.min(PROXY_LONGEST_SIDE),
        height.min(PROXY_LONGEST_SIDE),
    ))
}

/// The scale filter a proxy is encoded through. `force_original_aspect_ratio=decrease` fits the
/// source inside the box without distorting it, and `force_divisible_by=2` keeps both sides even
/// for `yuv420p`. Without a probed size the box would be meaningless, so the source's own size
/// stands and only the even-dimension guard is kept.
fn proxy_scale(info: &Value) -> String {
    let video = stream(info, "video");
    let side = |key: &str| video.and_then(|value| value[key].as_u64()).unwrap_or(0);
    match proxy_box(side("width"), side("height")) {
        Some((width, height)) => format!(
            "scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2"
        ),
        None => "scale=trunc(iw/2)*2:trunc(ih/2)*2".to_owned(),
    }
}

/// Whether this piece can be handed over as it is instead of being encoded. A stream copy can
/// only begin at a keyframe, so it is accurate only when the piece is the whole file; a piece cut
/// out of the middle would begin at the keyframe before the mark and play the wrong frames for the
/// length of one GOP. h264 is the one video the browser decodes from any container this plugin
/// opens, which is why it is the one worth copying.
fn copies_video(codec: &str, force: bool, whole_file: bool) -> bool {
    codec == "h264" && !force && whole_file
}

fn prepare_playback(params: &Value) -> Result<Value, String> {
    let input = source(params)?;
    let session = session(params)?;
    let value = &params["value"];
    let force = value["force"].as_bool().unwrap_or(false);
    // How a file is cut into pieces is the view's decision; this side encodes the piece it was
    // asked for. A request that names no length takes everything from the start.
    let index = value["index"].as_u64().unwrap_or(0) as u32;
    let from = value["from"].as_f64().unwrap_or(0.0).max(0.0);
    let length = value["seconds"].as_f64().unwrap_or(0.0).max(0.0);
    // A piece that is already written is the answer already. The view asks again whenever its own
    // window has let a piece go, and encoding what is still on disk would spend the machine on
    // nothing. A forced request is the one case that has to be redone, because it exists to
    // replace a piece that was written but could not be played.
    if !force
        && proxies()
            .lock()
            .unwrap()
            .contains_key(&(session.to_owned(), index))
    {
        return Ok(json!({"started":true}));
    }
    let ffmpeg = ffmpeg_tool().ok_or("未找到 FFmpeg，无法为此编码生成临时播放代理")?;
    let info = probe(input).unwrap_or(Value::Null);
    let video_codec = stream(&info, "video")
        .map(|value| text(value, "codec_name"))
        .unwrap_or("");
    let audio_codec = stream(&info, "audio")
        .map(|value| text(value, "codec_name"))
        .unwrap_or("");
    let root = proxy_root();
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let stem = safe_session(session);
    let output = root.join(format!("{stem}.{index}.mp4"));
    let partial = root.join(format!("{stem}.{index}.part.mp4"));
    // A piece this session asked for earlier is ended first: the two would write the same partial
    // file.
    if let Some(previous) = building()
        .lock()
        .unwrap()
        .remove(&(session.to_owned(), index))
    {
        stop(previous);
    }
    let _ = std::fs::remove_file(&partial);
    let mut command = Command::new(ffmpeg);
    helper(&mut command);
    command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-progress",
            "pipe:1",
            "-nostats",
            "-fflags",
            "+genpts",
        ])
        // Seeking before the input is the cheap way to begin a piece, and with transcoding ffmpeg
        // decodes forward to the requested frame, so a piece starts exactly where it was asked to
        // and carries a timeline of its own beginning at zero.
        .args(["-ss", &from.to_string(), "-i"])
        .arg(input);
    if length > 0.0 {
        command.args(["-t", &length.to_string()]);
    }
    command.args(["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]);
    if copies_video(video_codec, force, length <= 0.0) {
        command.args(["-c:v", "copy"]);
    } else {
        command
            .args([
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-vf",
            ])
            .arg(proxy_scale(&info))
            .args(["-pix_fmt", "yuv420p"]);
    }
    if audio_codec == "aac" {
        command.args(["-c:a", "copy"]);
    } else {
        command.args(["-c:a", "aac", "-b:a", "160k"]);
    }
    command
        .args(["-movflags", "+faststart"])
        .arg(&partial)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 FFmpeg：{error}"))?;
    // Both pipes carry the encode's account of itself -- where it got to on stdout, what went
    // wrong on stderr -- and each is read on its own thread, so neither fills up and leaves
    // ffmpeg waiting while the view is asking for progress.
    let report = Arc::new(Mutex::new(Report::default()));
    if let Some(stdout) = child.stdout.take() {
        let report = Arc::clone(&report);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Some(value) = line.strip_prefix("out_time_us=") else {
                    continue;
                };
                if let Ok(micros) = value.trim().parse::<u64>() {
                    report.lock().unwrap().at_ms = micros / 1000;
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let report = Arc::clone(&report);
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut report = report.lock().unwrap();
                report.errors.push(line);
                if report.errors.len() > ERROR_LINES {
                    report.errors.remove(0);
                }
            }
        });
    }
    building().lock().unwrap().insert(
        (session.to_owned(), index),
        Building {
            child,
            output,
            partial,
            seconds: length,
            report,
        },
    );
    Ok(json!({"started":true}))
}

/// Where this session's proxy stands: still encoding with a ratio to show, finished and ready to
/// read, failed with ffmpeg's own words, or never started. The view polls this, because a poll is
/// short enough to stay inside the call timeout where waiting for a whole encode is not.
fn playback_status(params: &Value) -> Result<Value, String> {
    let value = &params["value"];
    let index = value["index"].as_u64().unwrap_or(0) as u32;
    let session = session(params)?.to_owned();
    let key = (session, index);
    let mut jobs = building().lock().unwrap();
    let ended = jobs
        .get_mut(&key)
        .map(|job| job.child.try_wait())
        .transpose()
        .map_err(|error| error.to_string())?
        .flatten();
    let Some(status) = ended else {
        let Some(job) = jobs.get(&key) else {
            let ready = proxies().lock().unwrap().get(&key).cloned();
            return Ok(match ready {
                Some(path) => json!({"state":"done","size":piece_size(&path)}),
                None => json!({"state":"none"}),
            });
        };
        let at_ms = job.report.lock().unwrap().at_ms;
        return Ok(json!({"state":"running","ratio":progress_ratio(at_ms, job.seconds)}));
    };
    let Some(job) = jobs.remove(&key) else {
        return Ok(json!({"state":"none"}));
    };
    if !status.success() {
        let _ = std::fs::remove_file(&job.partial);
        let said = job.report.lock().unwrap().errors.join("; ");
        return Ok(json!({
            "state": "failed",
            "error": if said.is_empty() { "FFmpeg 没有说明失败原因".to_owned() } else { said },
        }));
    }
    let _ = std::fs::remove_file(&job.output);
    std::fs::rename(&job.partial, &job.output).map_err(|error| error.to_string())?;
    let size = piece_size(&job.output);
    if size == 0 {
        return Err("生成的播放代理是空文件".into());
    }
    proxies().lock().unwrap().insert(key, job.output);
    Ok(json!({"state":"done","size":size}))
}

fn read_playback(params: &Value) -> Result<Value, String> {
    let session = session(params)?;
    let value = &params["value"];
    let index = value["index"].as_u64().unwrap_or(0) as u32;
    let offset = value["offset"].as_u64().ok_or("Missing proxy offset")?;
    let length = value["length"].as_u64().ok_or("Missing proxy length")?;
    if length == 0 || length > CHUNK {
        return Err("Read at most 512 KiB from the playback proxy".into());
    }
    let path = proxies()
        .lock()
        .unwrap()
        .get(&(session.to_owned(), index))
        .cloned()
        .ok_or("这一段播放代理还没有生成完")?;
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| error.to_string())?;
    let mut bytes = Vec::with_capacity(length as usize);
    file.take(length)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(Value::String(STANDARD.encode(bytes)))
}

fn frame_name(path: &Path, time: f64, index: usize) -> String {
    let millis = (time.max(0.0) * 1000.0).round() as u64;
    let hours = millis / 3_600_000;
    let minutes = (millis / 60_000) % 60;
    let seconds = (millis / 1000) % 60;
    let fraction = millis % 1000;
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let suffix = if index == 0 {
        String::new()
    } else {
        format!("-{index}")
    };
    format!("{stem}-frame-{hours:02}-{minutes:02}-{seconds:02}-{fraction:03}{suffix}.png")
}

/// Where an exported frame goes: the folder chosen in this plugin settings, or the source
/// video directory when nothing is chosen. A configured folder that has since gone away is
/// reported instead of falling back, so a frame never lands somewhere the user is not looking.
fn frame_dir(source: &Path, params: &Value) -> Result<PathBuf, String> {
    let chosen = params["value"]["dir"].as_str().unwrap_or("").trim();
    if chosen.is_empty() {
        return source
            .parent()
            .map(Path::to_path_buf)
            .ok_or("Source video has no parent directory".into());
    }
    let folder = PathBuf::from(chosen);
    if !folder.is_absolute() {
        return Err(format!("导出位置必须是绝对路径：{chosen}"));
    }
    if !folder.is_dir() {
        return Err(format!("导出位置不存在：{chosen}"));
    }
    Ok(folder)
}

fn frame_target(path: &Path, time: f64, folder: &Path) -> Result<PathBuf, String> {
    for index in 0..10_000 {
        let candidate = folder.join(frame_name(path, time, index));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Too many exported frames with the same timestamp".into())
}

fn export_frame(params: &Value) -> Result<Value, String> {
    let input = source(params)?;
    let time = params["value"]["time"]
        .as_f64()
        .filter(|value| value.is_finite() && *value >= 0.0)
        .ok_or("Invalid frame time")?;
    let folder = frame_dir(input, params)?;
    let target = frame_target(input, time, &folder)?;
    let ffmpeg = ffmpeg_tool().ok_or("未找到 FFmpeg")?;
    let timestamp = format!("{time:.6}");
    let mut command = Command::new(ffmpeg);
    helper(&mut command);
    let result = command
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args(["-ss", &timestamp, "-map", "0:v:0", "-frames:v", "1"])
        .arg(&target)
        .output()
        .map_err(|error| error.to_string())?;
    if !result.status.success() {
        return Err(format!(
            "导出当前帧失败：{}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(json!({"path":target}))
}

fn save_frame(params: &Value) -> Result<Value, String> {
    let time = params["value"]["time"].as_f64().unwrap_or(0.0);
    let encoded = params["value"]["data"].as_str().ok_or("Missing PNG data")?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())?;
    if bytes.len() > FRAME_LIMIT || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid or oversized PNG frame".into());
    }
    let input = source(params)?;
    let target = frame_target(input, time, &frame_dir(input, params)?)?;
    std::fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(json!({"path":target}))
}

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "open" => Ok(metadata(source(params)?)),
        "settings" => ember_plugin_sdk::settings_applied(params),
        "preparePlayback" => prepare_playback(params),
        "playbackStatus" => playback_status(params),
        "readPlayback" => read_playback(params),
        "exportFrame" => export_frame(params),
        "saveFrame" => save_frame(params),
        _ => Err(format!("Unknown video method: {method}")),
    }
}

fn release(params: &Value) -> Result<Value, String> {
    let Some(session) = params["session"].as_str() else {
        return Ok(Value::Null);
    };
    // A session owns every piece of its proxy. An encode that is still running has to be ended
    // here too: nothing else would stop it once the view that asked for it is gone, and a
    // half-written piece left behind is one nobody will read.
    let mut jobs = building().lock().unwrap();
    let ending: Vec<_> = jobs
        .keys()
        .filter(|(owner, _)| owner.as_str() == session)
        .cloned()
        .collect();
    for key in ending {
        if let Some(job) = jobs.remove(&key) {
            stop(job);
        }
    }
    drop(jobs);
    let mut files = proxies().lock().unwrap();
    let held: Vec<_> = files
        .keys()
        .filter(|(owner, _)| owner.as_str() == session)
        .cloned()
        .collect();
    for key in held {
        if let Some(path) = files.remove(&key) {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(Value::Null)
}

fn main() {
    // The host stops this process by killing it -- on a package update, on quit -- and a killed
    // process gets no chance to tidy up, so the pieces the last one wrote are still in the proxy
    // directory. This process owns that directory now, so it starts by clearing it.
    clear_leftovers(&proxy_root());
    ember_plugin_sdk::serve_with_release(handle, release);
    // A process the host lets end by itself -- it closes the input instead of killing -- ends its
    // encoders and gives its own temp files back here rather than leaving them for the next one.
    sweep();
}

/// Deletes whatever an earlier process left in the proxy directory.
///
/// A piece is only readable through the process that wrote it -- the view asks for it and gets
/// bytes back over IPC -- so when this process starts, those files serve nobody: the process that
/// wrote them was replaced by this one. The host stops the old one without a `release` when a
/// package is updated or the app quits, so its own cleanup never ran, and what it left would sit
/// in the system temp directory until Windows decides to clear it. This process owns the whole
/// directory at this point, before it has written a piece of its own; a file another live process
/// still has open cannot be deleted on Windows, and the attempt is dropped.
fn clear_leftovers(root: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = std::fs::remove_file(entry.path());
    }
}

/// Ends every encode still running and deletes every piece this process wrote.
fn sweep() {
    let mut jobs = building().lock().unwrap();
    for (_, job) in jobs.drain() {
        stop(job);
    }
    drop(jobs);
    let mut files = proxies().lock().unwrap();
    for (_, path) in files.drain() {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_frame_names_include_the_exact_playback_time() {
        let name = frame_name(Path::new("camera.mov"), 3723.045, 0);
        assert_eq!(name, "camera-frame-01-02-03-045.png");
        assert_eq!(
            frame_name(Path::new("camera.mov"), 0.0, 2),
            "camera-frame-00-00-00-000-2.png"
        );
    }

    /// The frame lands in the folder the user chose, and a name that is already taken
    /// pushes the export aside instead of overwriting the file that is there.
    #[test]
    fn an_exported_frame_lands_in_the_chosen_folder() {
        let root = std::env::temp_dir().join("ember-peek-video-frame-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let video = root.join("camera.mov");
        let params = json!({"value": {"dir": root.display().to_string()}});
        assert_eq!(frame_dir(&video, &params).unwrap(), root);
        let target = frame_target(&video, 1.5, &root).unwrap();
        assert_eq!(target, root.join("camera-frame-00-00-01-500.png"));
        std::fs::write(&target, b"existing").unwrap();
        assert_eq!(
            frame_target(&video, 1.5, &root).unwrap(),
            root.join("camera-frame-00-00-01-500-1.png")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Without a choice the frame stays beside the video, and a folder that cannot be used
    /// is reported rather than written to somewhere the user did not ask for.
    #[test]
    fn the_export_folder_defaults_to_the_source_directory_and_is_checked() {
        let video = std::env::temp_dir().join("clips").join("camera.mov");
        assert_eq!(
            frame_dir(&video, &json!({})).unwrap(),
            video.parent().unwrap()
        );
        assert!(frame_dir(&video, &json!({"value": {"dir": "frames"}})).is_err());
        let missing = std::env::temp_dir().join("ember-peek-missing-folder");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(frame_dir(
            &video,
            &json!({"value": {"dir": missing.display().to_string()}})
        )
        .is_err());
    }

    /// A proxy is built for the browser, not for the archive: it is capped, it keeps the
    /// source's shape, and a source smaller than the cap is passed through untouched.
    #[test]
    fn a_proxy_is_capped_but_never_enlarged() {
        assert_eq!(proxy_box(7680, 2160), Some((1920, 1920)));
        assert_eq!(proxy_box(3840, 2160), Some((1920, 1920)));
        assert_eq!(proxy_box(1080, 1920), Some((1080, 1920)));
        assert_eq!(proxy_box(640, 480), Some((640, 480)));
        assert_eq!(proxy_box(0, 1080), None);
        let probe = |width: u64, height: u64| json!({"streams": [{"codec_type": "video", "width": width, "height": height}]});
        assert!(proxy_scale(&probe(7680, 2160)).contains("scale=1920:1920"));
        assert!(proxy_scale(&probe(640, 480)).contains("scale=640:480"));
        assert!(proxy_scale(&json!({"streams": []})).contains("trunc(iw/2)"));
    }

    /// A proxy says how much of the file it has written, and a file whose length nobody knows
    /// reports no ratio rather than a made-up one.
    #[test]
    fn a_proxy_reports_how_far_along_it_is() {
        assert_eq!(progress_ratio(0, 240.0), 0.0);
        assert_eq!(progress_ratio(60_000, 240.0), 0.25);
        assert_eq!(progress_ratio(240_000, 240.0), 1.0);
        assert_eq!(progress_ratio(300_000, 240.0), 1.0, "the end is the end");
        assert_eq!(progress_ratio(60_000, 0.0), 0.0);
    }

    /// Only a request for the whole file may be answered with a stream copy: a piece of a long
    /// file has to begin exactly where the view asked, and a copy can only begin at a keyframe.
    #[test]
    fn only_the_whole_file_is_copied_instead_of_encoded() {
        assert!(copies_video("h264", false, true));
        assert!(
            !copies_video("h264", false, false),
            "a piece needs an exact start"
        );
        assert!(!copies_video("h264", true, true), "a forced retry encodes");
        assert!(!copies_video("mpeg4", false, true));
        assert!(!copies_video("", false, true));
    }

    /// A process that ends by itself ends its encodes and gives its temp files back: no session
    /// is left to ask for them.
    #[test]
    fn a_stopped_process_deletes_the_pieces_it_wrote() {
        let root = std::env::temp_dir().join("ember-peek-video-sweep-test");
        std::fs::create_dir_all(&root).unwrap();
        let piece = root.join("s1.0.mp4");
        std::fs::write(&piece, b"piece").unwrap();
        proxies()
            .lock()
            .unwrap()
            .insert(("s1".to_owned(), 0), piece.clone());
        sweep();
        assert!(!piece.exists());
        assert!(proxies().lock().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// The host kills this process rather than letting it end, so the pieces it wrote outlive it
    /// and are left for the next process to clear -- a finished piece and a half-written one
    /// alike. Nothing in the directory belongs to anyone else by then: a piece is readable only
    /// through the process that wrote it.
    #[test]
    fn a_started_process_clears_what_an_earlier_one_left() {
        let root = std::env::temp_dir().join("ember-peek-video-leftover-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("s1.0.mp4"), b"piece").unwrap();
        std::fs::write(root.join("s1.1.part.mp4"), b"half").unwrap();
        clear_leftovers(&root);
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
        // A directory that was never created is not a failure either.
        let missing = std::env::temp_dir().join("ember-peek-video-not-here");
        let _ = std::fs::remove_dir_all(&missing);
        clear_leftovers(&missing);
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Windows refuses to rename a directory that some process has as its working directory, and
    /// an update replaces exactly this one: the package the plugin was installed into. What a child
    /// inherited is nowhere in its arguments, so the only way to see it is to ask a child.
    #[cfg(windows)]
    #[test]
    fn a_helper_process_does_not_sit_in_the_package() {
        // `cmd /c cd` prints the working directory it was started with.
        let mut command = Command::new("cmd");
        helper(&mut command);
        let output = command.args(["/c", "cd"]).output().unwrap();
        assert!(output.status.success());
        let cwd = std::fs::canonicalize(String::from_utf8_lossy(&output.stdout).trim()).unwrap();
        let intended = std::fs::canonicalize(helper_dir()).unwrap();
        assert_eq!(
            cwd, intended,
            "the helper was not given the intended directory"
        );
        let package = std::fs::canonicalize(std::env::current_exe().unwrap()).unwrap();
        let package = package.parent().unwrap();
        assert!(
            !intended.starts_with(package),
            "{} is inside {}",
            intended.display(),
            package.display()
        );
    }
}
