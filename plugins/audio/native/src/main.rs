use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    fs::File,
    io::ErrorKind,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL},
    errors::Error,
    formats::{FormatOptions, FormatReader, SeekMode, SeekTo},
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
    units::{Time, TimeBase},
};

const MAX_BYTES: usize = 2 * 1024 * 1024;
const MAX_PACKET_SAMPLES: usize = 1024 * 1024;
const MAX_PACKETS: usize = 8192;
type Sessions = HashMap<String, Arc<Mutex<Playback>>>;
static SESSIONS: OnceLock<Mutex<Sessions>> = OnceLock::new();
fn sessions() -> &'static Mutex<Sessions> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct Playback {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track: u32,
    time_base: TimeBase,
    rate: u32,
    channels: usize,
    duration: Option<f64>,
    samples: VecDeque<f32>,
    position: f64,
    discard_before: Option<f64>,
    ended: bool,
}

fn seconds(base: TimeBase, ts: u64) -> f64 {
    let time = base.calc_time(ts);
    time.seconds as f64 + time.frac
}

fn valid_time(value: &Value) -> Result<f64, String> {
    value
        .as_f64()
        .filter(|time| time.is_finite() && *time >= 0.0 && *time <= 7.0 * 24.0 * 3600.0)
        .ok_or_else(|| "Invalid audio seek time".into())
}

impl Playback {
    fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|s| s.to_str()) {
            hint.with_extension(extension);
        }
        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                MediaSourceStream::new(Box::new(file), Default::default()),
                &FormatOptions {
                    enable_gapless: true,
                    ..Default::default()
                },
                &MetadataOptions {
                    limit_metadata_bytes: symphonia::core::meta::Limit::Maximum(256 * 1024),
                    limit_visual_bytes: symphonia::core::meta::Limit::Maximum(0),
                },
            )
            .map_err(|e| e.to_string())?;
        let format = probed.format;
        let track = format
            .default_track()
            .filter(|track| track.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or("No supported audio track")?;
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("Unsupported audio encoding: {e}"))?;
        let rate = track.codec_params.sample_rate.unwrap_or(0);
        let channels = track.codec_params.channels.map_or(0, |c| c.count());
        let base = track
            .codec_params
            .time_base
            .unwrap_or_else(|| TimeBase::new(1, rate.max(1)));
        let duration = track.codec_params.n_frames.map(|n| seconds(base, n));
        Ok(Self {
            track: track.id,
            time_base: base,
            format,
            decoder,
            rate,
            channels,
            duration,
            samples: VecDeque::new(),
            position: 0.0,
            discard_before: None,
            ended: false,
        })
    }

    fn seek(&mut self, time: f64) -> Result<(), String> {
        self.format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time: Time::from(time),
                    track_id: Some(self.track),
                },
            )
            .map_err(|e| e.to_string())?;
        self.decoder.reset();
        self.samples.clear();
        self.position = time;
        self.discard_before = Some(time);
        self.ended = false;
        Ok(())
    }

    fn packet(&mut self, peaks: Option<&mut Peaks>) -> Result<(), String> {
        let packet = match self.format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(e)) if e.kind() == ErrorKind::UnexpectedEof => {
                self.ended = true;
                return Ok(());
            }
            Err(e) => return Err(e.to_string()),
        };
        if packet.track_id() != self.track {
            return Ok(());
        }
        let audio = self
            .decoder
            .decode(&packet)
            .map_err(|e| format!("Audio decode failed: {e}"))?;
        let spec = *audio.spec();
        let channels = spec.channels.count();
        if !(1..=8).contains(&channels)
            || !(8000..=192000).contains(&spec.rate)
            || audio.capacity().saturating_mul(channels) > MAX_PACKET_SAMPLES
        {
            return Err("Audio stream exceeds preview limits (8 channels, 192 kHz)".into());
        }
        if self.rate != 0
            && self.channels != 0
            && (self.rate != spec.rate || self.channels != channels)
        {
            return Err("Changing audio sample format is unsupported".into());
        }
        self.rate = spec.rate;
        self.channels = channels;
        let mut buffer = SampleBuffer::<f32>::new(audio.capacity() as u64, spec);
        buffer.copy_interleaved_ref(audio);
        let start = seconds(self.time_base, packet.ts());
        let skip = self
            .discard_before
            .map_or(0, |target| {
                ((target - start).max(0.0) * self.rate as f64).round() as usize
            })
            .saturating_mul(channels)
            .min(buffer.samples().len());
        if skip < buffer.samples().len() {
            if self.discard_before.take().is_some() {
                self.position = start + (skip / channels) as f64 / self.rate as f64;
            }
            if let Some(peaks) = peaks {
                for frame in buffer.samples()[skip..].chunks_exact(channels) {
                    let low = frame.iter().copied().fold(0.0f32, f32::min);
                    let high = frame.iter().copied().fold(0.0f32, f32::max);
                    peaks.push(low, high);
                }
            } else {
                self.samples
                    .extend(buffer.samples()[skip..].iter().copied());
            }
        }
        Ok(())
    }

    fn read(&mut self) -> Result<Value, String> {
        // Bound both decoded bytes and parsing work, including malformed streams with no audio.
        let mut output = Vec::new();
        let mut packets = 0;
        loop {
            let frames =
                (self.rate.max(8000) as usize * 2).min(MAX_BYTES / 4 / self.channels.max(1));
            let target = frames * self.channels.max(1);
            let count = (target.saturating_sub(output.len() / 4)).min(self.samples.len());
            for sample in self.samples.drain(..count) {
                output.extend_from_slice(
                    &if sample.is_finite() {
                        sample.clamp(-1.0, 1.0)
                    } else {
                        0.0
                    }
                    .to_le_bytes(),
                );
            }
            if output.len() / 4 >= target || self.ended {
                break;
            }
            packets += 1;
            if packets > MAX_PACKETS {
                return Err("Audio packet limit exceeded".into());
            }
            self.packet(None)?;
        }
        let start = self.position;
        let frames = output.len() / 4 / self.channels.max(1);
        self.position += frames as f64 / self.rate.max(1) as f64;
        Ok(
            json!({"pcm":STANDARD.encode(output),"sampleRate":self.rate,"channels":self.channels,"start":start,"duration":self.duration,"ended":self.ended && self.samples.is_empty()}),
        )
    }
}

fn playback(params: &Value) -> Result<Arc<Mutex<Playback>>, String> {
    let id = params["session"].as_str().ok_or("Missing audio session")?;
    let mut map = sessions().lock().unwrap();
    if let Some(existing) = map.get(id) {
        return Ok(existing.clone());
    }
    let path = params["path"].as_str().ok_or("Missing audio file")?;
    let entry = Arc::new(Mutex::new(Playback::open(Path::new(path))?));
    map.insert(id.to_owned(), entry.clone());
    Ok(entry)
}

const PEAK_LIMIT: usize = 2048;

struct Peaks {
    bins: Vec<[f32; 2]>,
    step: u64,
    pending: [f32; 2],
    count: u64,
    frames: u64,
}
impl Peaks {
    fn new(step: u64) -> Self {
        Self {
            bins: Vec::new(),
            step: step.max(1),
            pending: [0.0, 0.0],
            count: 0,
            frames: 0,
        }
    }
    fn push(&mut self, low: f32, high: f32) {
        let low = if low.is_finite() {
            low.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        let high = if high.is_finite() {
            high.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        self.pending[0] = self.pending[0].min(low);
        self.pending[1] = self.pending[1].max(high);
        self.frames += 1;
        self.count += 1;
        if self.count >= self.step {
            self.bins.push(self.pending);
            self.pending = [0.0, 0.0];
            self.count = 0;
            if self.bins.len() >= PEAK_LIMIT {
                self.bins = self
                    .bins
                    .chunks_exact(2)
                    .map(|pair| [pair[0][0].min(pair[1][0]), pair[0][1].max(pair[1][1])])
                    .collect();
                self.step = self.step.saturating_mul(2);
            }
        }
    }
    fn snapshot(&self) -> Vec<[f32; 2]> {
        let mut peaks = self.bins.clone();
        if self.count > 0 {
            peaks.push(self.pending);
        }
        peaks
    }
}
struct Waveform {
    playback: Playback,
    peaks: Peaks,
}
static WAVEFORMS: OnceLock<Mutex<HashMap<String, Arc<Mutex<Waveform>>>>> = OnceLock::new();
fn waveforms() -> &'static Mutex<HashMap<String, Arc<Mutex<Waveform>>>> {
    WAVEFORMS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn waveform_read(params: &Value) -> Result<Value, String> {
    let id = params["session"]
        .as_str()
        .ok_or("Missing waveform session")?;
    let state = {
        let mut map = waveforms().lock().unwrap();
        if let Some(state) = map.get(id) {
            state.clone()
        } else {
            let path = params["path"].as_str().ok_or("Missing audio file")?;
            let playback = Playback::open(Path::new(path))?;
            let frames = playback.duration.unwrap_or(0.0) * playback.rate as f64;
            let step = if frames > 0.0 {
                (frames / (PEAK_LIMIT - 1) as f64).ceil() as u64
            } else {
                1024
            };
            let state = Arc::new(Mutex::new(Waveform {
                playback,
                peaks: Peaks::new(step),
            }));
            map.insert(id.to_owned(), state.clone());
            state
        }
    };
    let mut waveform = state.lock().unwrap();
    let deadline = Instant::now() + Duration::from_millis(16);
    // A separate decoder never moves the playback cursor. Each call yields promptly so
    // waveform analysis does not monopolize the IPC worker or delay first playback.
    for _ in 0..128 {
        if waveform.playback.ended {
            break;
        }
        let Waveform { playback, peaks } = &mut *waveform;
        playback.packet(Some(peaks))?;
        if Instant::now() >= deadline {
            break;
        }
    }
    let rate = waveform.playback.rate.max(1);
    Ok(
        json!({ "peaks":waveform.peaks.snapshot(), "samplesPerPeak":waveform.peaks.step,
        "sampleRate":rate, "decodedDuration":waveform.peaks.frames as f64 / rate as f64,
        "duration":waveform.playback.duration, "done":waveform.playback.ended }),
    )
}

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        // Do not scan, decode or copy the file before the browser's fast streaming path.
        "open" => Ok(
            json!({"format":Path::new(params["path"].as_str().ok_or("Missing audio file")?).extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_uppercase()}),
        ),
        "settings" => ember_plugin_sdk::settings_applied(params),
        "waveform-read" => waveform_read(params),
        "audio-read" => {
            let playback = playback(params)?;
            let mut playback = playback.lock().unwrap();
            if let Some(time) = params["value"].get("seek") {
                playback.seek(valid_time(time)?)?;
            }
            playback.read()
        }
        _ => Err(format!("Unknown audio method: {method}")),
    }
}
fn release(params: &Value) -> Result<Value, String> {
    if let Some(id) = params["session"].as_str() {
        sessions().lock().unwrap().remove(id);
        waveforms().lock().unwrap().remove(id);
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
    fn waveform_packet_aggregates_real_extrema_without_the_pcm_playback_queue() {
        let path =
            std::env::temp_dir().join(format!("ember-audio-peaks-{}.wav", std::process::id()));
        std::fs::write(&path, wave(8000)).unwrap();
        let mut player = Playback::open(&path).unwrap();
        let mut peaks = Peaks::new(1);
        player.packet(Some(&mut peaks)).unwrap();
        assert!(player.samples.is_empty());
        assert!(peaks.frames >= 100);
        let snapshot = peaks.snapshot();
        assert_eq!(snapshot[99][0], 0.0);
        assert!((snapshot[99][1] - 9900.0 / 32768.0).abs() < 0.00001);
        drop(player);
        std::fs::remove_file(path).unwrap();
    }
    fn wave(frames: u32) -> Vec<u8> {
        let size = frames * 2;
        let mut bytes = b"RIFF".to_vec();
        bytes.extend((size + 36).to_le_bytes());
        bytes.extend(b"WAVEfmt ");
        bytes.extend(16u32.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(8000u32.to_le_bytes());
        bytes.extend(16000u32.to_le_bytes());
        bytes.extend(2u16.to_le_bytes());
        bytes.extend(16u16.to_le_bytes());
        bytes.extend(b"data");
        bytes.extend(size.to_le_bytes());
        for frame in 0..frames {
            bytes.extend(((frame % 100) as i16 * 100).to_le_bytes());
        }
        bytes
    }
    #[test]
    fn long_audio_reads_are_bounded_and_seek_starts_at_requested_sample() {
        let path = std::env::temp_dir().join(format!("ember-audio-{}.wav", std::process::id()));
        std::fs::write(&path, wave(80000)).unwrap();
        let mut player = Playback::open(&path).unwrap();
        let first = player.read().unwrap();
        assert_eq!(first["sampleRate"], 8000);
        assert_eq!(first["channels"], 1);
        assert_eq!(first["duration"], 10.0);
        let bytes = STANDARD.decode(first["pcm"].as_str().unwrap()).unwrap();
        assert_eq!(bytes.len(), 8000 * 2 * 4);
        assert_eq!(first["ended"], false);
        let second = player.read().unwrap();
        assert_eq!(second["start"], 2.0);
        player.seek(7.0).unwrap();
        let sought = player.read().unwrap();
        assert!((sought["start"].as_f64().unwrap() - 7.0).abs() < 0.001);
        let last = player.read().unwrap();
        assert_eq!(last["ended"], true);
        assert_eq!(
            STANDARD
                .decode(last["pcm"].as_str().unwrap())
                .unwrap()
                .len(),
            8000 * 4
        );
        drop(player);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn bundled_codec_fixtures_decode_without_external_helpers() {
        for name in [
            "pcm.wav",
            "pcm.aiff",
            "audio.flac",
            "audio.mp3",
            "audio.mp2",
            "vorbis.ogg",
            "aac.m4a",
            "alac.m4a",
            "pcm.caf",
            "adpcm.wav",
        ] {
            let path = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests")
                .join("fixtures")
                .join(name);
            let mut player = Playback::open(&path).unwrap_or_else(|e| panic!("{name}: {e}"));
            let chunk = player.read().unwrap_or_else(|e| panic!("{name}: {e}"));
            let bytes = STANDARD.decode(chunk["pcm"].as_str().unwrap()).unwrap();
            assert!(!bytes.is_empty(), "{name}");
            assert!(bytes.len() <= MAX_BYTES, "{name}");
            assert!(
                bytes
                    .chunks_exact(4)
                    .any(|sample| f32::from_le_bytes(sample.try_into().unwrap()).abs() > 0.01),
                "{name}"
            );
            assert_eq!(chunk["sampleRate"], 44100, "{name}");
        }
    }

    #[test]
    fn waveform_compaction_preserves_extremes_with_bounded_storage() {
        let mut peaks = Peaks::new(1);
        for i in 0..100_000 {
            peaks.push(
                if i == 3 { -0.9 } else { -0.1 },
                if i == 70000 { 0.8 } else { 0.1 },
            );
        }
        let values = peaks.snapshot();
        assert!(values.len() <= PEAK_LIMIT);
        assert_eq!(peaks.frames, 100_000);
        assert!(values.iter().any(|peak| peak[0] == -0.9));
        assert!(values.iter().any(|peak| peak[1] == 0.8));
    }
    #[test]
    fn waveform_analysis_does_not_move_the_playback_cursor() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pcm.wav");
        let params = json!({"session":"waveform-test", "path":path.to_str().unwrap(),"value":{}});
        let first = handle("audio-read", &params).unwrap();
        let before = playback(&params).unwrap().lock().unwrap().position;
        let wave = waveform_read(&params).unwrap();
        assert!(!wave["peaks"].as_array().unwrap().is_empty());
        assert!(wave["peaks"].as_array().unwrap().len() <= PEAK_LIMIT);
        assert_eq!(playback(&params).unwrap().lock().unwrap().position, before);
        assert!(first["ended"].as_bool().unwrap());
        release(&params).unwrap();
        assert!(!waveforms().lock().unwrap().contains_key("waveform-test"));
    }

    #[test]
    fn malformed_seek_values_are_rejected() {
        for value in [json!(-1), json!("1"), Value::Null, json!(1e20)] {
            assert!(valid_time(&value).is_err());
        }
        assert_eq!(valid_time(&json!(1.25)).unwrap(), 1.25);
    }
    #[test]
    fn browser_open_does_not_read_or_decode_the_source() {
        assert_eq!(
            handle("open", &json!({"path":"missing.FLAC"})).unwrap()["format"],
            "FLAC"
        );
    }
}
