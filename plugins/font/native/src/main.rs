//! Font preview, native half.
//!
//! The browser draws the font, so this half answers the two questions a font engine cannot: what
//! this file is, and which characters it encodes. Everything it hands back is small — a fact
//! list, a page of code points, one glyph's metrics — and the bytes themselves go to the browser
//! from disk, either as the file it opened or as one face written out of a collection. Nothing
//! here rasterizes, and nothing here keeps a copy of the font for the interface.

mod container;
mod facts;
#[cfg(test)]
mod fixture;
mod glyphs;

use container::FontFile;
use glyphs::Coverage;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::Instant,
};

/// Faces whose character list is kept in memory: the one being shown and the one just left.
const COVERAGE_KEPT: usize = 2;
/// Extracted faces kept on disk. A face is the size of a font, so this is what bounds a
/// collection's demand on the temporary directory.
const EXTRACTED_KEPT: usize = 3;
/// What the host will hand a browser as one resource.
const EXTRACT_LIMIT: usize = 64 * 1024 * 1024;
/// Code points one answer carries. Large enough that an ordinary font is one request, small
/// enough that a CJK font's forty thousand characters arrive in a handful of them.
const COVERAGE_PAGE: usize = 8192;
/// Glyph ids one answer carries.
const UNENCODED_PAGE: usize = 4096;
/// Glyph names one answer carries.
const NAMES_LIMIT: usize = 512;
/// Characters one coverage question may ask about: a line of typing, not a character set.
const COVERS_LIMIT: usize = 256;

/// One open font, as long as the host keeps it open.
struct Session {
    font: FontFile,
    /// Where a face of a container the browser cannot read is written for it.
    directory: PathBuf,
    coverage: Mutex<Vec<(usize, Arc<Coverage>)>>,
    extracted: Mutex<Vec<Extracted>>,
}

/// A face written out for the browser, and when it was last asked for.
struct Extracted {
    index: usize,
    path: PathBuf,
    at: Instant,
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
        "details" => details(params),
        "coverage" => coverage(params),
        "covers" => covers(params),
        "rank" => rank(params),
        "unencoded" => unencoded(params),
        "names" => names(params),
        "glyph" => glyph(params),
        "face" => face(params),
        _ => Err(format!("Unknown font method: {method}")),
    }
}

fn release(params: &Value) -> Result<Value, String> {
    if let Some(id) = params["session"].as_str() {
        let removed = sessions().lock().unwrap().remove(id);
        if let Some(session) = removed {
            let _ = std::fs::remove_dir_all(&session.directory);
        }
    }
    Ok(Value::Null)
}

fn main() {
    // A previous process was killed rather than asked to stop when the host replaced this plugin
    // or the application quit, so its extracted faces are still on disk and nobody can want
    // them: a face is only readable through the session that wrote it.
    let _ = std::fs::remove_dir_all(root());
    ember_plugin_sdk::serve_with_release(handle, release);
}

fn open(params: &Value) -> Result<Value, String> {
    let path = params["path"].as_str().ok_or("Missing font path")?;
    let id = params["session"].as_str().ok_or("Missing font session")?;
    let bytes = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    let font = match FontFile::open(path) {
        Ok(font) => font,
        // Another plugin can own this extension honestly; only a font file is this plugin's.
        Err(error) if error == "font-unknown" => return Ok(ember_plugin_sdk::not_applicable()),
        // A font this plugin cannot read is still this plugin's file to explain.
        Err(error) => return Ok(json!({ "error": error, "bytes": bytes })),
    };
    let count = font.face_count();
    if count == 0 {
        return Ok(json!({ "error": "font-broken:no-faces", "bytes": bytes }));
    }
    let faces: Vec<Value> = (0..count)
        .map(|index| {
            let mut summary =
                facts::summary(&font, index).unwrap_or_else(|_| json!({ "index": index }));
            // How this face reaches the browser is a property of the container, and for a
            // collection it differs per face.
            summary["render"] = json!(font.rendering(index));
            summary
        })
        .collect();
    let session = Arc::new(Session {
        coverage: Mutex::new(Vec::new()),
        extracted: Mutex::new(Vec::new()),
        directory: root().join(format!("{}-{}", std::process::id(), label(id))),
        font,
    });
    if let Some(previous) = sessions()
        .lock()
        .unwrap()
        .insert(id.to_string(), session.clone())
    {
        let _ = std::fs::remove_dir_all(&previous.directory);
    }
    Ok(json!({
        "container": session.font.container(),
        "bytes": bytes,
        "faces": faces,
    }))
}

fn details(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    session.font.face(index)?;
    let mut facts = facts::details(&session.font, index)?;
    // The counts belong to the character list, which is built on demand; when it is already
    // built the facts can carry them instead of making the interface ask twice.
    if let Some((_, coverage)) = session
        .coverage
        .lock()
        .unwrap()
        .iter()
        .find(|(at, _)| *at == index)
    {
        facts["covered"] = json!(coverage.total());
        facts["unencoded"] = json!(coverage.unencoded_total());
    }
    Ok(facts)
}

fn coverage(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let offset = number(params, "offset");
    let count = number(params, "count").clamp(1, COVERAGE_PAGE);
    let face = session.font.face(index)?;
    let coverage = coverage_of(&session, &face, index);
    Ok(coverage.chunk(offset, count))
}

fn unencoded(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let offset = number(params, "offset");
    let count = number(params, "count").clamp(1, UNENCODED_PAGE);
    let face = session.font.face(index)?;
    let coverage = coverage_of(&session, &face, index);
    Ok(coverage.unencoded_chunk(offset, count))
}

/// Whether a handful of characters are in the font, for the specimen's reading of what was typed.
/// This is deliberately not a list: knowing that three typed characters are missing must not cost
/// an enumeration of the whole character set.
fn covers(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let face = session.font.face(index)?;
    let points: Vec<u32> = payload(params)["points"]
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_u64())
                .take(COVERS_LIMIT)
                .map(|value| value.min(0x10ffff) as u32)
                .collect()
        })
        .unwrap_or_default();
    let covered: Vec<bool> = points
        .iter()
        .map(|point| Coverage::has(&face, *point))
        .collect();
    Ok(json!({ "covered": covered }))
}

/// Where a character sits in the character list, and whether it is in it. The interface asks this
/// to jump somewhere — a block, a match — without holding the list it would be jumping in.
fn rank(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let point = number(params, "codepoint").min(0x10ffff) as u32;
    let face = session.font.face(index)?;
    let coverage = coverage_of(&session, &face, index);
    let (at, covered) = coverage.rank(point);
    Ok(json!({ "index": at, "total": coverage.total(), "covered": covered }))
}

/// Glyph names for the ids the case is showing. The answer is positional: the caller keeps its
/// ids, and a name it does not get back is a glyph this font does not name.
fn names(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let face = session.font.face(index)?;
    let glyphs: Vec<u16> = payload(params)["glyphs"]
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_u64())
                .take(NAMES_LIMIT)
                .map(|value| value.min(u16::MAX as u64) as u16)
                .collect()
        })
        .unwrap_or_default();
    Ok(glyphs::names(&face, &glyphs))
}

/// What one character is in this face.
fn glyph(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    let point = number(params, "codepoint").min(0x10ffff) as u32;
    let face = session.font.face(index)?;
    let coverage = coverage_of(&session, &face, index);
    Ok(glyphs::glyph(&face, &coverage, point))
}

/// One face written out for the browser, which cannot read a collection or a suitcase itself.
fn face(params: &Value) -> Result<Value, String> {
    let session = session_of(params)?;
    let index = face_index(params);
    if index >= session.font.face_count() {
        return Err(format!("font-face-index:{index}"));
    }
    let path = extracted(&session, index)?;
    let bytes = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    Ok(json!({ "path": path.to_string_lossy(), "bytes": bytes }))
}

/// The character list of one face, built on first use and kept while it is the current one.
fn coverage_of(session: &Arc<Session>, face: &ttf_parser::Face, index: usize) -> Arc<Coverage> {
    let mut kept = session.coverage.lock().unwrap();
    if let Some((_, coverage)) = kept.iter().find(|(at, _)| *at == index) {
        return coverage.clone();
    }
    let coverage = Arc::new(Coverage::of(face));
    if kept.len() >= COVERAGE_KEPT {
        kept.remove(0);
    }
    kept.push((index, coverage.clone()));
    coverage
}

/// A face written into the session's own temporary directory, with the extension the host turns
/// into a media type for the browser.
///
/// Faces are kept until they have to make room, because switching back and forth between the
/// styles of one collection is what a reader does, and writing a face out is a copy of the whole
/// font. What is kept is what was asked for most recently.
fn extracted(session: &Arc<Session>, index: usize) -> Result<PathBuf, String> {
    {
        let mut kept = session.extracted.lock().unwrap();
        if let Some(kept) = kept.iter_mut().find(|kept| kept.index == index) {
            kept.at = Instant::now();
            return Ok(kept.path.clone());
        }
    }
    let bytes = session.font.extract(index)?;
    if bytes.len() > EXTRACT_LIMIT {
        return Err(format!("font-too-large:{}", EXTRACT_LIMIT / 1024 / 1024));
    }
    let extension = if session.font.flavor(index) == Some(0x4f54_544f) {
        "otf"
    } else {
        "ttf"
    };
    std::fs::create_dir_all(&session.directory).map_err(|error| error.to_string())?;
    let path = session.directory.join(format!("face-{index}.{extension}"));
    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    let mut kept = session.extracted.lock().unwrap();
    kept.push(Extracted {
        index,
        path: path.clone(),
        at: Instant::now(),
    });
    while kept.len() > EXTRACTED_KEPT {
        let oldest = kept
            .iter()
            .enumerate()
            .min_by_key(|(_, kept)| kept.at)
            .map(|(at, _)| at)
            .unwrap_or(0);
        let dropped = kept.remove(oldest);
        let _ = std::fs::remove_file(dropped.path);
    }
    Ok(path)
}

fn session_of(params: &Value) -> Result<Arc<Session>, String> {
    let id = params["session"]
        .as_str()
        .ok_or("font-session-expired")?
        .to_string();
    sessions()
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| "font-session-expired".to_string())
}

/// The face a custom method is about. Only the lifecycle methods carry the path, so everything
/// else reads its arguments from `value`.
fn face_index(params: &Value) -> usize {
    payload(params)["face"].as_u64().unwrap_or(0) as usize
}

fn number(params: &Value, key: &str) -> usize {
    payload(params)[key].as_u64().unwrap_or(0) as usize
}

fn payload(params: &Value) -> &Value {
    params.get("value").unwrap_or(&Value::Null)
}

/// A directory name for one session: the identifier the host chose is not a file name, and two
/// sessions must not share one.
fn label(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .take(64)
        .collect()
}

fn root() -> PathBuf {
    std::env::temp_dir().join("ember-peek-font")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(method: &str, params: Value) -> Result<Value, String> {
        handle(method, &params)
    }

    #[test]
    fn a_font_opens_with_one_line_per_face() {
        let path = fixture::write("open.ttf", &fixture::sfnt());
        let opened = call(
            "open",
            json!({ "session": "open-test", "path": path, "settings": {} }),
        )
        .unwrap();
        assert_eq!(opened["container"], "sfnt");
        assert_eq!(opened["faces"][0]["render"], "direct");
        assert_eq!(opened["faces"][0]["family"], "Fixture Sans");
        assert!(
            opened["faces"][0].get("covered").is_none(),
            "counts wait for the list"
        );
        assert!(session_of(&json!({ "session": "open-test" })).is_ok());
        release(&json!({ "session": "open-test" })).unwrap();
        assert!(session_of(&json!({ "session": "open-test" })).is_err());
    }

    #[test]
    fn something_that_is_not_a_font_is_declined_rather_than_explained() {
        let path = fixture::write("decline-archive.ttf", b"PK\x03\x04 not a font at all");
        let opened = call(
            "open",
            json!({ "session": "decline-test", "path": path, "settings": {} }),
        )
        .unwrap();
        assert_eq!(opened["applicable"], false);
    }

    #[test]
    fn a_font_this_plugin_cannot_read_is_explained_by_the_view() {
        let mut woff = fixture::woff();
        woff[16..20].copy_from_slice(&0xffff_ffffu32.to_be_bytes());
        let path = fixture::write("open-huge.woff", &woff);
        let opened = call(
            "open",
            json!({ "session": "explain-test", "path": path, "settings": {} }),
        )
        .unwrap();
        assert!(opened["error"]
            .as_str()
            .unwrap()
            .starts_with("font-too-large"));
        assert_eq!(opened["bytes"], woff.len());
    }

    #[test]
    fn characters_arrive_in_pages_and_say_what_they_add_up_to() {
        let path = fixture::write("pages.ttf", &fixture::sfnt());
        call(
            "open",
            json!({ "session": "pages-test", "path": path, "settings": {} }),
        )
        .unwrap();
        let page = call(
            "coverage",
            json!({ "session": "pages-test", "value": { "face": 0, "offset": 0, "count": 2 } }),
        )
        .unwrap();
        assert_eq!(page["total"], fixture::COVERED.len());
        assert_eq!(page["unencoded"], 2);
        let details = call(
            "details",
            json!({ "session": "pages-test", "value": { "face": 0 } }),
        )
        .unwrap();
        assert_eq!(details["covered"], fixture::COVERED.len());
        assert_eq!(details["unencoded"], 2);
        assert_eq!(details["outline"], "truetype");
        release(&json!({ "session": "pages-test" })).unwrap();
    }

    #[test]
    fn one_face_of_a_collection_is_written_out_and_then_cleaned_up() {
        let path = fixture::write("faces.ttc", &fixture::collection());
        let opened = call(
            "open",
            json!({ "session": "extract-test", "path": path, "settings": {} }),
        )
        .unwrap();
        assert_eq!(opened["faces"][0]["render"], "extract");
        assert_eq!(opened["faces"].as_array().unwrap().len(), 2);
        let face = call(
            "face",
            json!({ "session": "extract-test", "value": { "face": 1 } }),
        )
        .unwrap();
        let written = PathBuf::from(face["path"].as_str().unwrap());
        assert!(written.is_file());
        // What was written is the second face, not the file it came out of.
        let bytes = std::fs::read(&written).unwrap();
        let parsed = ttf_parser::Face::parse(&bytes, 0).unwrap();
        assert_eq!(parsed.units_per_em(), 1001);
        assert_eq!(parsed.number_of_glyphs(), fixture::COVERED.len() as u16 + 2);
        let directory = written.parent().unwrap().to_path_buf();
        // Asking again is served from the copy rather than written twice.
        let again = call(
            "face",
            json!({ "session": "extract-test", "value": { "face": 1 } }),
        )
        .unwrap();
        assert_eq!(again["path"], face["path"]);
        release(&json!({ "session": "extract-test" })).unwrap();
        assert!(
            !directory.exists(),
            "a released session leaves nothing behind"
        );
    }

    #[test]
    fn a_glyph_answer_carries_what_the_inspector_shows() {
        let path = fixture::write("inspector.ttf", &fixture::sfnt());
        call(
            "open",
            json!({ "session": "glyph-test", "path": path, "settings": {} }),
        )
        .unwrap();
        let answer = call(
            "glyph",
            json!({ "session": "glyph-test", "value": { "face": 0, "codepoint": 0x4e00 } }),
        )
        .unwrap();
        assert_eq!(answer["glyph"], 5);
        assert_eq!(answer["advance"], 450);
        let names = call(
            "names",
            json!({ "session": "glyph-test", "value": { "face": 0, "glyphs": [5] } }),
        )
        .unwrap();
        assert_eq!(names["names"], json!([Value::Null]));
        release(&json!({ "session": "glyph-test" })).unwrap();
    }

    #[test]
    fn an_unknown_session_is_reported_rather_than_guessed_at() {
        assert_eq!(
            call("coverage", json!({ "session": "missing", "value": {} })).unwrap_err(),
            "font-session-expired"
        );
    }
}
