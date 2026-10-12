mod mesh;
mod saved_blend;
use base64::{engine::general_purpose::STANDARD, Engine};
use mesh::Mesh;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};

const FILE_LIMIT: u64 = 1024 * 1024 * 1024;
const CHUNK: usize = 2 * 1024 * 1024;
struct Output {
    bytes: Vec<u8>,
    kind: &'static str,
    encoding: &'static str,
    decoded_size: usize,
    objects: u32,
    skipped: u32,
    simplified: bool,
    triangles: usize,
    mesh_triangles: usize,
    lines: usize,
    booleans: Vec<mesh::BooleanJob>,
}
struct Session {
    path: PathBuf,
    format: String,
    output: Mutex<Option<Output>>,
}
type Sessions = HashMap<String, Arc<Session>>;
static SESSIONS: OnceLock<Mutex<Sessions>> = OnceLock::new();
fn sessions() -> &'static Mutex<Sessions> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn session_id(params: &Value) -> Result<&str, String> {
    params["session"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Missing session".into())
}
fn bounded_read(path: &std::path::Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > FILE_LIMIT {
        return Err("Model exceeds the 1024 MiB quick preview limit".into());
    }
    let mut bytes = Vec::new();
    file.take(FILE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > FILE_LIMIT {
        return Err("Model exceeds the 1024 MiB quick preview limit".into());
    }
    Ok(bytes)
}
fn thumbnail(bytes: &[u8]) -> Option<Vec<u8>> {
    let limit = bytes.len().min(4 * 1024 * 1024);
    let start = bytes[..limit]
        .windows(3)
        .position(|p| p == [0xff, 0xd8, 0xff])?;
    let end = start
        + 2
        + bytes[start + 2..limit]
            .windows(2)
            .position(|p| p == [0xff, 0xd9])?
        + 2;
    Some(bytes[start..end].to_vec())
}

#[cfg(cineware)]
fn c4d(path: &std::path::Path) -> Result<Mesh, String> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};
    static PARSER: Mutex<()> = Mutex::new(());
    unsafe extern "C" {
        fn ember_c4d_read(
            path: *const u16,
            context: *mut c_void,
            emit: extern "C" fn(*mut c_void, *const f32) -> bool,
            objects: *mut u32,
            skipped: *mut u32,
            simplified: *mut u32,
            line: extern "C" fn(*mut c_void, *const f32) -> bool,
            boolean: extern "C" fn(*mut c_void, u32, u32, u32, u32),
        ) -> i32;
    }
    extern "C" fn emit(context: *mut c_void, xyz: *const f32) -> bool {
        // The bridge supplies exactly twelve stack values for this synchronous callback.
        let values = unsafe { std::slice::from_raw_parts(xyz, 12) };
        let mesh = unsafe { &mut *(context.cast::<Mesh>()) };
        mesh.triangle(
            std::array::from_fn(|i| values[i * 3..i * 3 + 3].try_into().unwrap()),
            values[9..12].try_into().unwrap(),
        )
        .is_ok()
    }
    extern "C" fn line(context: *mut c_void, xyz: *const f32) -> bool {
        let values = unsafe { std::slice::from_raw_parts(xyz, 9) };
        let mesh = unsafe { &mut *(context.cast::<Mesh>()) };
        mesh.line(
            [
                values[0..3].try_into().unwrap(),
                values[3..6].try_into().unwrap(),
            ],
            values[6..9].try_into().unwrap(),
        )
        .is_ok()
    }
    extern "C" fn boolean(
        context: *mut c_void,
        start: u32,
        count: u32,
        cutter_start: u32,
        cutter_count: u32,
    ) {
        let mesh = unsafe { &mut *(context.cast::<Mesh>()) };
        mesh.booleans.push(mesh::BooleanJob {
            start: start as usize,
            count: count as usize,
            cutter_start: cutter_start as usize,
            cutter_count: cutter_count as usize,
        });
    }
    let _guard = PARSER.lock().map_err(|_| "C4D parser unavailable")?;
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut mesh = Mesh::default();
    let mut objects = 0;
    let mut skipped = 0;
    let mut simplified = 0;
    let code = unsafe {
        ember_c4d_read(
            path.as_ptr(),
            (&mut mesh as *mut Mesh).cast(),
            emit,
            &mut objects,
            &mut skipped,
            &mut simplified,
            line,
            boolean,
        )
    };
    if code != 0 {
        return Err(format!("C4D geometry could not be read (code {code})"));
    }
    mesh.objects = objects;
    mesh.skipped = skipped;
    mesh.simplified = simplified != 0;
    Ok(mesh)
}
#[cfg(not(cineware))]
fn c4d(_: &std::path::Path) -> Result<Mesh, String> {
    Err("C4D decoding is available in Windows builds only".into())
}

fn render(session: &Session) -> Result<Output, String> {
    let size = std::fs::metadata(&session.path)
        .map_err(|e| e.to_string())?
        .len();
    if size == 0 || size > FILE_LIMIT {
        return Err("Model must contain data and be at most 1024 MiB".into());
    }
    let mesh = if session.format == "c4d" {
        c4d(&session.path)
    } else {
        saved_blend::read(&bounded_read(&session.path)?)
    };
    match mesh.and_then(|m| Ok((m.bytes()?, m))) {
        Ok((bytes, m)) => {
            let decoded_size = bytes.len();
            let mut encoder =
                flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
            encoder.write_all(&bytes).map_err(|e| e.to_string())?;
            let bytes = encoder.finish().map_err(|e| e.to_string())?;
            Ok(Output {
                bytes,
                kind: "mesh",
                encoding: "gzip",
                decoded_size,
                objects: m.objects,
                skipped: m.skipped,
                simplified: m.simplified,
                mesh_triangles: m.positions.len() / 3,
                lines: m.lines.len(),
                triangles: m.positions.len() / 3
                    - m.booleans.iter().map(|job| job.cutter_count).sum::<usize>(),
                booleans: m.booleans,
            })
        }
        Err(error) if session.format == "c4d" => {
            let mut prefix = Vec::new();
            File::open(&session.path)
                .map_err(|e| e.to_string())?
                .take(4 * 1024 * 1024)
                .read_to_end(&mut prefix)
                .map_err(|e| e.to_string())?;
            let bytes = thumbnail(&prefix).ok_or(error)?;
            Ok(Output {
                decoded_size: bytes.len(),
                bytes,
                kind: "thumbnail",
                encoding: "raw",
                objects: 0,
                skipped: 0,
                simplified: false,
                triangles: 0,
                mesh_triangles: 0,
                lines: 0,
                booleans: Vec::new(),
            })
        }
        Err(error) => Err(error),
    }
}
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    if method == "settings" {
        return ember_plugin_sdk::settings_applied(params);
    }
    let id = session_id(params)?;
    if method == "open" {
        let path = PathBuf::from(params["path"].as_str().ok_or("Missing file path")?);
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > FILE_LIMIT || size == 0 {
            return Err("Model must contain data and be at most 1024 MiB".into());
        }
        let format = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ![
            "c4d", "blend", "glb", "gltf", "obj", "fbx", "stl", "ply", "dae", "3ds", "3mf",
        ]
        .contains(&format.as_str())
        {
            return Err("Unsupported model format".into());
        }
        let mut guard = sessions().lock().map_err(|_| "Session store unavailable")?;
        if guard.len() >= 4 && !guard.contains_key(id) {
            return Err("Too many model sessions".into());
        }
        guard.insert(
            id.to_owned(),
            Arc::new(Session {
                path,
                format: format.clone(),
                output: Mutex::new(None),
            }),
        );
        return Ok(json!({"format":format,"size":size}));
    }
    let session = sessions()
        .lock()
        .map_err(|_| "Session store unavailable")?
        .get(id)
        .cloned()
        .ok_or("Model session was released")?;
    if !["c4d", "blend"].contains(&session.format.as_str()) {
        return Err("This format is decoded in the web view".into());
    }
    let mut output = session
        .output
        .lock()
        .map_err(|_| "Model cache unavailable")?;
    match method {
        "render" => {
            if output.is_none() {
                *output = Some(render(&session)?);
            }
            let m = output.as_ref().unwrap();
            Ok(
                json!({"kind":m.kind,"size":m.bytes.len(),"encoding":m.encoding,"decodedSize":m.decoded_size,"objects":m.objects,"skipped":m.skipped,"triangles":m.triangles,"meshTriangles":m.mesh_triangles,"lines":m.lines,"baseMesh":true,"simplified":m.simplified,"booleans":m.booleans}),
            )
        }
        "bytes" => {
            let m = output.as_ref().ok_or("Model has not been decoded")?;
            let value = &params["value"];
            let offset = value["offset"]
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .ok_or("Invalid offset")?;
            let length = value["length"]
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .ok_or("Invalid length")?;
            let end = offset.checked_add(length).ok_or("Range overflow")?;
            if length == 0 || length > CHUNK || end > m.bytes.len() {
                return Err("Invalid model transfer range".into());
            }
            Ok(json!(STANDARD.encode(&m.bytes[offset..end])))
        }
        _ => Err(format!("Unknown model method: {method}")),
    }
}
fn release(params: &Value) -> Result<Value, String> {
    sessions()
        .lock()
        .map_err(|_| "Session store unavailable")?
        .remove(session_id(params)?);
    Ok(Value::Null)
}
fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transfer_is_bounded_and_release_drops_cache() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preview.c4d");
        std::fs::write(&path, b"QC4DC4D6").unwrap();
        let mut p = json!({"session":"transfer-test","path":path});
        handle("open", &p).unwrap();
        let session = sessions()
            .lock()
            .unwrap()
            .get("transfer-test")
            .unwrap()
            .clone();
        *session.output.lock().unwrap() = Some(Output {
            bytes: vec![1, 2, 3, 4],
            kind: "mesh",
            encoding: "raw",
            decoded_size: 4,
            objects: 1,
            skipped: 0,
            simplified: false,
            triangles: 1,
            mesh_triangles: 1,
            lines: 0,
            booleans: Vec::new(),
        });
        p["value"] = json!({"offset":0,"length":4});
        assert_eq!(handle("bytes", &p).unwrap(), "AQIDBA==");
        p["value"] = json!({"offset":u64::MAX,"length":4});
        assert!(handle("bytes", &p).is_err());
        p["value"] = json!({"offset":0,"length":CHUNK+1});
        assert!(handle("bytes", &p).is_err());
        release(&p).unwrap();
        assert!(handle("bytes", &p).is_err());
    }
    #[test]
    fn large_projects_open_without_reading_the_whole_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.c4d");
        let file = File::create(&path).unwrap();
        file.set_len(100 * 1024 * 1024).unwrap();
        let params = json!({"session":"large-test","path":path});
        assert_eq!(handle("open", &params).unwrap()["size"], 100 * 1024 * 1024);
        release(&params).unwrap();
        file.set_len(FILE_LIMIT + 1).unwrap();
        assert!(handle("open", &params).is_err());
    }
    #[test]
    #[cfg(cineware)]
    fn saved_line_only_c4d_preserves_disconnected_closed_segments_and_color() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/model/saved-lines.c4d");
        let mesh = c4d(&path).unwrap();
        assert!(mesh.positions.is_empty());
        assert_eq!(mesh.lines.len(), 5);
        assert_eq!(mesh.objects, 1);
        assert_eq!(mesh.lines[0], ([25., 50., -10.], [125., 50., -10.]));
        assert_eq!(mesh.lines[2], ([25., 50., 90.], [125., 50., 90.]));
        assert_eq!(mesh.lines[4].1, [25., 50., 90.]);
        assert!((mesh.line_colors[0][1] - 0.7).abs() < 0.001);
        let output = render(&Session {
            path,
            format: "c4d".into(),
            output: Mutex::new(None),
        })
        .unwrap();
        assert_eq!(output.kind, "mesh");
        assert_eq!(output.lines, 5);
        assert_eq!(output.triangles, 0);
        assert_eq!(output.decoded_size, 5 * 72);
    }
    #[test]
    #[cfg(cineware)]
    fn dense_c4d_keeps_interactive_geometry() {
        // Optional local fixture: private engineering assets must not enter the repository.
        let Some(path) = std::env::var_os("EMBER_MODEL_DENSE_C4D_FIXTURE") else {
            return;
        };
        let output = render(&Session {
            path: PathBuf::from(path),
            format: "c4d".into(),
            output: Mutex::new(None),
        })
        .unwrap();
        assert_eq!(output.kind, "mesh");
        assert!(!output.simplified);
        assert!(output.triangles > 500_000);
        assert!(output.triangles > 0 && output.triangles <= mesh::TRIANGLE_LIMIT);
        assert_eq!(output.decoded_size, output.triangles * 108);
        let mut decoded = Vec::new();
        flate2::read::GzDecoder::new(output.bytes.as_slice())
            .read_to_end(&mut decoded)
            .unwrap();
        assert_eq!(decoded.len(), output.decoded_size);
    }
    #[test]
    fn thumbnail_scan_stays_bounded() {
        assert_eq!(
            thumbnail(&[0, 255, 216, 255, 1, 255, 217]),
            Some(vec![255, 216, 255, 1, 255, 217])
        );
        assert!(thumbnail(b"not a thumbnail").is_none());
    }
}
