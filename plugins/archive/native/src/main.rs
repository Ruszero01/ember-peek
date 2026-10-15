//! Archive preview: list what an archive holds and hand one entry's bytes to the view.
//!
//! Nothing is ever unpacked. The listing comes from the container's own directory, and an
//! entry's bytes are decoded on demand, in bounded chunks, straight into the response. A
//! session lives for as long as the host keeps the file open and is dropped on `release`.
mod cab;
mod entry;
mod format;
mod rar;
mod sevenz;
mod source;
mod stream;
mod tarfile;
mod zipfile;

use base64::{engine::general_purpose::STANDARD, Engine};
use entry::Entry;
use serde_json::{json, Value};
use source::Source;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};

/// Entries an `open` response carries without the view asking for a second page.
const OPEN_PAGE: usize = 1_000;
/// Entries one page request may ask for.
const PAGE_LIMIT: usize = 2_000;
/// Bytes one entry request may ask for. Base64 turns this into about 5.3 MB on the wire,
/// which stays inside the host's 8 MiB message budget with room for the reply envelope.
const CHUNK_LIMIT: usize = 4 * 1024 * 1024;

struct Session {
    source: Box<dyn Source>,
}

type Sessions = HashMap<String, Arc<Session>>;
static SESSIONS: OnceLock<Mutex<Sessions>> = OnceLock::new();
fn sessions() -> &'static Mutex<Sessions> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "settings" => ember_plugin_sdk::settings_applied(params),
        "open" => open(params),
        "page" => page(params),
        "read-entry" => read_entry(params),
        _ => Err(format!("Unknown archive method: {method}")),
    }
}

fn release(params: &Value) -> Result<Value, String> {
    if let Some(session) = params["session"].as_str() {
        sessions().lock().unwrap().remove(session);
    }
    Ok(Value::Null)
}

fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
}

fn session_of(params: &Value) -> Result<Arc<Session>, String> {
    let session = params["session"]
        .as_str()
        .ok_or("Missing archive session")?;
    sessions()
        .lock()
        .unwrap()
        .get(session)
        .cloned()
        .ok_or_else(|| "archive-session-expired".to_string())
}

/// What a custom method was called with. The host carries the plugin's own payload beside the
/// session under `value`, so a custom method reads its arguments there — only the lifecycle
/// methods see `path` and `settings` at the top level.
fn payload(params: &Value) -> &Value {
    params.get("value").unwrap_or(&Value::Null)
}

/// What a directory adds up to.
struct Totals {
    files: usize,
    folders: usize,
    bytes: u64,
    packed: u64,
}

/// Totals for a listing.
///
/// Folders are the paths the reader will actually see in the tree, which is not the same as
/// the directory entries the container wrote: a zip built by a tool that only stores file
/// names carries no folder entries at all, and reporting zero folders there would contradict
/// the list the same reader is looking at. Explicit folder entries and the parent paths of
/// every file are therefore merged.
fn totals_of(entries: &[Entry]) -> Totals {
    let mut folders: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let mut files = 0usize;
    let mut bytes = 0u64;
    let mut packed = 0u64;
    for entry in entries {
        if entry.dir {
            folders.insert(entry.name.as_str());
            continue;
        }
        files += 1;
        bytes = bytes.saturating_add(entry.size);
        packed = packed.saturating_add(entry.packed);
        let mut path = entry.name.as_str();
        while let Some((parent, _)) = path.rsplit_once('/') {
            folders.insert(parent);
            path = parent;
        }
    }
    Totals {
        files,
        folders: folders.len(),
        bytes,
        packed,
    }
}

/// Read the container's directory and describe it. The first page of entries rides along so
/// the common archive needs only this one round trip.
fn open(params: &Value) -> Result<Value, String> {
    let path = PathBuf::from(params["path"].as_str().ok_or("Missing file path")?);
    let session = params["session"]
        .as_str()
        .ok_or("Missing session id")?
        .to_string();
    // The header also decides the format, because a renamed archive is normal in the wild.
    let prefix = ember_plugin_sdk::read_prefix(&path, 64 * 1024)
        .map_err(|error| format!("This file could not be read: {error}"))?;
    let format = format::detect(&path, &prefix)
        .ok_or_else(|| "This file is not an archive the preview recognises".to_string())?;
    let source =
        source::open(&path, &prefix, format).map_err(|error| explain_open(&path, format, error))?;
    let entries = source.entries();
    let totals = totals_of(entries);
    let summary = json!({
        "format": format.id(),
        "codec": format.codec(),
        "count": entries.len(),
        "files": totals.files,
        "folders": totals.folders,
        "bytes": totals.bytes,
        "packed": totals.packed,
        "archiveBytes": std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0),
        "encrypted": entries.iter().any(|entry| entry.encrypted),
        "truncated": source.truncated(),
        "entries": entries.iter().take(OPEN_PAGE).map(Entry::json).collect::<Vec<Value>>(),
    });
    sessions()
        .lock()
        .unwrap()
        .insert(session, Arc::new(Session { source }));
    Ok(summary)
}

/// A failure while opening is the one error the host itself shows — the plugin's view never
/// mounts, so nothing turns a token into a sentence in the reader's language. It is written
/// out plainly here, naming the format the file was recognised as.
fn explain_open(path: &std::path::Path, format: format::Format, error: String) -> String {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("This file");
    let label = format.label();
    if let Some(detail) = error.strip_prefix("archive-corrupt:") {
        format!("{name} could not be read as a {label} archive: {detail}")
    } else if let Some(method) = error.strip_prefix("unsupported-method:") {
        format!("{name} uses compression this preview cannot decode: {method}")
    } else if error == source::TOKEN_PASSWORD {
        format!("{name} is password protected")
    } else if error == source::TOKEN_MULTIPART {
        format!("{name} is one volume of a multi-volume archive")
    } else if let Some(detail) = error.strip_prefix("io:") {
        format!("{name} could not be read: {detail}")
    } else {
        error
    }
}

/// A slice of the directory, for archives with more entries than one response should carry.
fn page(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let entries = session.source.entries();
    let arguments = payload(params);
    let offset = arguments["offset"].as_u64().unwrap_or(0) as usize;
    let limit = arguments["limit"]
        .as_u64()
        .unwrap_or(PAGE_LIMIT as u64)
        .min(PAGE_LIMIT as u64) as usize;
    let slice = entries.get(offset..).unwrap_or(&[]);
    let slice = &slice[..slice.len().min(limit)];
    Ok(json!({
        "total": entries.len(),
        "entries": slice.iter().map(Entry::json).collect::<Vec<Value>>(),
    }))
}

/// Bytes of one entry. A short answer means the entry ended; the view stops asking then.
fn read_entry(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let arguments = payload(params);
    let index = arguments["index"].as_u64().ok_or("Missing entry index")? as usize;
    let offset = arguments["offset"].as_u64().unwrap_or(0);
    let length = arguments["length"]
        .as_u64()
        .unwrap_or(CHUNK_LIMIT as u64)
        .min(CHUNK_LIMIT as u64) as usize;
    if length == 0 {
        return Err(source::TOKEN_EMPTY.to_string());
    }
    let entry = session
        .source
        .entries()
        .get(index)
        .cloned()
        .ok_or_else(|| source::TOKEN_MISSING.to_string())?;
    if entry.dir {
        return Err(source::TOKEN_DIRECTORY.to_string());
    }
    if entry.encrypted {
        return Err(source::TOKEN_PASSWORD.to_string());
    }
    let data = session.source.read(&entry, offset, length)?;
    let eof = data.len() < length;
    Ok(json!({
        "data": STANDARD.encode(&data),
        "size": entry.size,
        "eof": eof,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn sample(directory: &std::path::Path) -> PathBuf {
        let path = directory.join("sample.zip");
        let file = std::fs::File::create(&path).unwrap();
        let mut writer = zip::write::ZipWriter::new(file);
        let options: zip::write::SimpleFileOptions = Default::default();
        writer.add_directory("docs/", options).unwrap();
        writer.start_file("docs/hello.txt", options).unwrap();
        writer.write_all(b"hello archive").unwrap();
        writer.finish().unwrap();
        path
    }

    #[test]
    fn opening_a_session_describes_the_archive_and_pages_its_directory() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        let opened = handle(
            "open",
            &json!({"session": "s-open", "path": path, "settings": {}}),
        )
        .unwrap();
        assert_eq!(opened["format"], "zip");
        assert_eq!(opened["count"], 2);
        assert_eq!(opened["files"], 1);
        assert_eq!(opened["folders"], 1);
        assert_eq!(opened["bytes"], 13);
        assert_eq!(opened["entries"][1]["name"], "docs/hello.txt");
        assert!(opened["entries"][1].get("read_index").is_none());

        let second = handle(
            "page",
            &json!({"session": "s-open", "value": {"offset": 1, "limit": 1}}),
        )
        .unwrap();
        assert_eq!(second["total"], 2);
        assert_eq!(second["entries"].as_array().unwrap().len(), 1);
        assert_eq!(second["entries"][0]["name"], "docs/hello.txt");
    }

    #[test]
    fn folders_are_counted_as_the_reader_will_see_them() {
        // A container that lists only file names still shows folders in the tree, so the
        // summary has to agree with the list rather than with the directory entries.
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("flat.zip");
        let file = std::fs::File::create(&path).unwrap();
        let mut writer = zip::write::ZipWriter::new(file);
        let options: zip::write::SimpleFileOptions = Default::default();
        writer.start_file("a/b/one.txt", options).unwrap();
        writer.write_all(b"1").unwrap();
        writer.start_file("a/two.txt", options).unwrap();
        writer.write_all(b"2").unwrap();
        writer.start_file("three.txt", options).unwrap();
        writer.write_all(b"3").unwrap();
        writer.finish().unwrap();

        let opened = handle("open", &json!({"session": "s-folders", "path": path})).unwrap();
        assert_eq!(opened["count"], 3, "only what the container listed");
        assert_eq!(opened["files"], 3);
        assert_eq!(opened["folders"], 2, "a and a/b");
        assert_eq!(opened["bytes"], 3);
    }

    #[test]
    fn a_custom_method_reads_its_arguments_where_the_host_puts_them() {
        // The session rides at the top level and the plugin's own payload under `value`;
        // reading the top level for an argument is the mistake this pins shut.
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        handle("open", &json!({"session": "s-shape", "path": path})).unwrap();
        let misplaced = handle(
            "read-entry",
            &json!({"session": "s-shape", "index": 1, "offset": 0, "length": 4}),
        )
        .unwrap_err();
        assert_eq!(misplaced, "Missing entry index");
        let placed = handle(
            "read-entry",
            &json!({"session": "s-shape", "value": {"index": 1, "offset": 0, "length": 4}}),
        )
        .unwrap();
        assert_eq!(placed["data"], "aGVsbA==");
        let page = handle(
            "page",
            &json!({"session": "s-shape", "value": {"offset": 1}}),
        )
        .unwrap();
        assert_eq!(page["entries"][0]["name"], "docs/hello.txt");
    }

    #[test]
    fn an_entry_is_read_in_ranges_and_reports_the_end_of_the_payload() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        handle("open", &json!({"session": "s-read", "path": path})).unwrap();
        let chunk = handle(
            "read-entry",
            &json!({"session": "s-read", "value": {"index": 1, "offset": 0, "length": 5}}),
        )
        .unwrap();
        let decode = |value: &Value| STANDARD.decode(value["data"].as_str().unwrap()).unwrap();
        assert_eq!(decode(&chunk), b"hello");
        assert_eq!(chunk["size"], 13);
        assert_eq!(chunk["eof"], false);
        let tail = handle(
            "read-entry",
            &json!({"session": "s-read", "value": {"index": 1, "offset": 11, "length": 64}}),
        )
        .unwrap();
        assert_eq!(decode(&tail), b"ve");
        assert_eq!(tail["eof"], true);
    }

    #[test]
    fn a_directory_entry_or_an_unknown_method_is_reported_rather_than_answered() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        handle("open", &json!({"session": "s-errors", "path": path})).unwrap();
        let error = handle(
            "read-entry",
            &json!({"session": "s-errors", "value": {"index": 0, "offset": 0, "length": 8}}),
        )
        .unwrap_err();
        assert_eq!(error, source::TOKEN_DIRECTORY);
        let error = handle(
            "read-entry",
            &json!({"session": "s-errors", "value": {"index": 99, "offset": 0, "length": 8}}),
        )
        .unwrap_err();
        assert_eq!(error, source::TOKEN_MISSING);
        let error = handle(
            "read-entry",
            &json!({"session": "s-errors", "value": {"index": 1, "offset": 0, "length": 0}}),
        )
        .unwrap_err();
        assert_eq!(error, source::TOKEN_EMPTY);
        let error = handle(
            "read-entry",
            &json!({"session": "gone", "value": {"index": 1, "offset": 0, "length": 8}}),
        )
        .unwrap_err();
        assert_eq!(error, "archive-session-expired");
        assert!(handle("nonsense", &json!({})).is_err());
    }

    #[test]
    fn releasing_a_session_forgets_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        handle("open", &json!({"session": "s-release", "path": path})).unwrap();
        release(&json!({"session": "s-release"})).unwrap();
        let error = handle("page", &json!({"session": "s-release"})).unwrap_err();
        assert_eq!(error, "archive-session-expired");
    }

    #[test]
    fn a_file_that_is_not_an_archive_fails_with_a_readable_sentence() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.zip");
        std::fs::write(&path, b"just some text").unwrap();
        let error = handle("open", &json!({"session": "s-bad", "path": path})).unwrap_err();
        // The host shows this one, so it names the file and the format it was taken for.
        assert!(
            error.starts_with("notes.zip could not be read as a ZIP archive"),
            "{error}"
        );
        let missing = handle(
            "open",
            &json!({"session": "s-none", "path": directory.path().join("nope.zip")}),
        );
        let error = missing.unwrap_err();
        assert!(error.contains("could not be read"), "{error}");
    }
}
