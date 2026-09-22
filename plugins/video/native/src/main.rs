use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
};

const CHUNK: u64 = 512 * 1024;
const FRAME_LIMIT: usize = 5 * 1024 * 1024;
static PROXIES: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();

fn proxies() -> &'static Mutex<HashMap<String, PathBuf>> {
    PROXIES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn hidden(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.stdin(Stdio::null());
    command.creation_flags(0x08000000);
}
#[cfg(not(windows))]
fn hidden(command: &mut Command) {
    command.stdin(Stdio::null());
}

fn works(path: &Path) -> bool {
    let mut command = Command::new(path);
    hidden(&mut command);
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
    hidden(&mut command);
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
    let duration = text(&info["format"], "duration")
        .parse::<f64>()
        .ok()
        .or_else(|| video.and_then(|value| text(value, "duration").parse::<f64>().ok()))
        .unwrap_or(0.0);
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

fn prepare_playback(params: &Value) -> Result<Value, String> {
    let input = source(params)?;
    let session = session(params)?;
    let force = params["value"]["force"].as_bool().unwrap_or(false);
    let ffmpeg = ffmpeg_tool().ok_or("未找到 FFmpeg，无法为此编码生成临时播放代理")?;
    let info = probe(input).unwrap_or(Value::Null);
    let video_codec = stream(&info, "video")
        .map(|value| text(value, "codec_name"))
        .unwrap_or("");
    let audio_codec = stream(&info, "audio")
        .map(|value| text(value, "codec_name"))
        .unwrap_or("");
    let root = std::env::temp_dir().join("ember-peek-video");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let output = root.join(format!("{}.mp4", safe_session(session)));
    let partial = root.join(format!("{}.part.mp4", safe_session(session)));
    let _ = std::fs::remove_file(&partial);
    let mut command = Command::new(ffmpeg);
    hidden(&mut command);
    command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-fflags",
            "+genpts",
            "-i",
        ])
        .arg(input)
        .args(["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]);
    if video_codec == "h264" && !force {
        command.args(["-c:v", "copy"]);
    } else {
        command.args([
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-pix_fmt",
            "yuv420p",
        ]);
    }
    if audio_codec == "aac" {
        command.args(["-c:a", "copy"]);
    } else {
        command.args(["-c:a", "aac", "-b:a", "160k"]);
    }
    let result = command
        .args(["-movflags", "+faststart"])
        .arg(&partial)
        .output()
        .map_err(|error| format!("无法启动 FFmpeg：{error}"))?;
    if !result.status.success() {
        let _ = std::fs::remove_file(&partial);
        let error = String::from_utf8_lossy(&result.stderr);
        return Err(format!("生成临时播放代理失败：{}", error.trim()));
    }
    let _ = std::fs::remove_file(&output);
    std::fs::rename(&partial, &output).map_err(|error| error.to_string())?;
    let size = std::fs::metadata(&output)
        .map_err(|error| error.to_string())?
        .len();
    proxies().lock().unwrap().insert(session.to_owned(), output);
    Ok(json!({"size":size}))
}

fn read_playback(params: &Value) -> Result<Value, String> {
    let session = session(params)?;
    let value = &params["value"];
    let offset = value["offset"].as_u64().ok_or("Missing proxy offset")?;
    let length = value["length"].as_u64().ok_or("Missing proxy length")?;
    if length == 0 || length > CHUNK {
        return Err("Read at most 512 KiB from the playback proxy".into());
    }
    let path = proxies()
        .lock()
        .unwrap()
        .get(session)
        .cloned()
        .ok_or("Playback proxy is unavailable")?;
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

fn frame_target(path: &Path, time: f64) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or("Source video has no parent directory")?;
    for index in 0..10_000 {
        let candidate = parent.join(frame_name(path, time, index));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Too many exported frames with the same timestamp".into())
}

fn planned_frame(params: &Value) -> Result<Value, String> {
    let time = params["value"]["time"].as_f64().unwrap_or(0.0);
    let target = frame_target(source(params)?, time)?;
    Ok(json!({
        "fileName": target.file_name().and_then(|value| value.to_str()).unwrap_or("frame.png")
    }))
}

fn export_frame(params: &Value) -> Result<Value, String> {
    let input = source(params)?;
    let time = params["value"]["time"]
        .as_f64()
        .filter(|value| value.is_finite() && *value >= 0.0)
        .ok_or("Invalid frame time")?;
    let target = frame_target(input, time)?;
    let ffmpeg = ffmpeg_tool().ok_or("未找到 FFmpeg")?;
    let timestamp = format!("{time:.6}");
    let mut command = Command::new(ffmpeg);
    hidden(&mut command);
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
    Ok(json!({
        "path":target,
        "fileName":target.file_name().and_then(|value| value.to_str()).unwrap_or("frame.png")
    }))
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
    let target = frame_target(source(params)?, time)?;
    std::fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(json!({
        "path":target,
        "fileName":target.file_name().and_then(|value| value.to_str()).unwrap_or("frame.png")
    }))
}

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "open" => Ok(metadata(source(params)?)),
        "settings" => ember_plugin_sdk::settings_applied(params),
        "preparePlayback" => prepare_playback(params),
        "readPlayback" => read_playback(params),
        "plannedFrame" => planned_frame(params),
        "exportFrame" => export_frame(params),
        "saveFrame" => save_frame(params),
        _ => Err(format!("Unknown video method: {method}")),
    }
}

fn release(params: &Value) -> Result<Value, String> {
    if let Some(session) = params["session"].as_str() {
        if let Some(path) = proxies().lock().unwrap().remove(session) {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(Value::Null)
}

fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
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
}
