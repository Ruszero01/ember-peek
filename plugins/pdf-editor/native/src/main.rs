use base64::{engine::general_purpose::STANDARD, Engine};
use pdfium_render::prelude::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

const FILE_LIMIT: usize = 32 * 1024 * 1024;
const HISTORY_LIMIT: usize = 64 * 1024 * 1024;
const PROCESS_LIMIT: usize = 256 * 1024 * 1024;
const IMAGE_LIMIT: usize = 4 * 1024 * 1024;
const PAGE_LIMIT: i32 = 1000;

struct Draft {
    path: PathBuf,
    saved: Vec<u8>,
    bytes: Vec<u8>,
    history: Vec<Vec<u8>>,
    revision: u64,
    editable: bool,
}
impl Draft {
    fn memory(&self) -> usize {
        self.saved.len() + self.bytes.len() + self.history.iter().map(Vec::len).sum::<usize>()
    }
    fn dirty(&self) -> bool {
        self.bytes != self.saved
    }
}
static DRAFTS: OnceLock<Mutex<HashMap<String, Draft>>> = OnceLock::new();
fn drafts() -> &'static Mutex<HashMap<String, Draft>> {
    DRAFTS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}
fn initialize_engine() -> Result<Pdfium, String> {
    let executable = std::env::current_exe().map_err(error)?;
    let packaged = executable
        .parent()
        .and_then(Path::parent)
        .ok_or("Missing package directory")?
        .join("ui/vendor/pdfium.dll");
    let path = if packaged.exists() {
        packaged
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/vendor/pdfium.dll")
    };
    Ok(Pdfium::new(Pdfium::bind_to_library(path).map_err(error)?))
}
fn engine() -> Result<&'static Pdfium, String> {
    static ENGINE: OnceLock<Result<Pdfium, String>> = OnceLock::new();
    ENGINE
        .get_or_init(initialize_engine)
        .as_ref()
        .map_err(Clone::clone)
}
fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(error)?;
    let mut bytes = Vec::new();
    file.take((FILE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > FILE_LIMIT {
        return Err("PDF editing is limited to 32 MiB".into());
    }
    Ok(bytes)
}
fn page_index(value: &Value, count: i32) -> Result<i32, String> {
    let page = value["page"].as_i64().ok_or("Missing page number")?;
    if page < 1 || page > i64::from(count) {
        return Err("Page no longer exists".into());
    }
    Ok(page as i32 - 1)
}
fn check_revision(draft: &Draft, value: &Value) -> Result<(), String> {
    if value["revision"].as_u64() != Some(draft.revision) {
        return Err("Selection is out of date; select the object again".into());
    }
    Ok(())
}
fn metadata(draft: &Draft, document: &PdfDocument, page: i32) -> Result<Value, String> {
    let page = page.clamp(0, document.pages().len() - 1);
    let pdf_page = document.pages().get(page).map_err(error)?;
    Ok(
        json!({"revision": draft.revision, "pages": document.pages().len(), "page": page + 1,
        "width": pdf_page.width().value, "height": pdf_page.height().value, "dirty": draft.dirty(),
        "undo": !draft.history.is_empty(), "editable": draft.editable}),
    )
}
fn render(draft: &Draft, value: &Value, pdfium: &Pdfium) -> Result<Value, String> {
    check_revision(draft, value)?;
    let document = pdfium
        .load_pdf_from_byte_slice(&draft.bytes, None)
        .map_err(error)?;
    let index = page_index(value, document.pages().len())?;
    let page = document.pages().get(index).map_err(error)?;
    let width = value["width"].as_u64().unwrap_or(1200).clamp(256, 1600) as i32;
    let config = PdfRenderConfig::new()
        .set_target_width(width)
        .set_maximum_height(2400);
    let bitmap = page.render_with_config(&config).map_err(error)?;
    let image = bitmap.as_image().map_err(error)?;
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(error)?;
    if output.get_ref().len() > IMAGE_LIMIT {
        return Err("Page image exceeds the transport budget; reduce zoom".into());
    }
    let mut objects = Vec::new();
    let mut unsupported = 0;
    for (id, object) in page.objects().iter().enumerate() {
        let (kind, text) = if let Some(text) = object.as_text_object() {
            if !text.is_visible() {
                unsupported += 1;
                continue;
            }
            ("text", text.text())
        } else if object.as_image_object().is_some() {
            ("image", String::new())
        } else {
            unsupported += 1;
            continue;
        };
        if objects.len() >= 2000 || text.len() > 4096 {
            unsupported += 1;
            continue;
        }
        let Ok(bounds) = object.bounds() else {
            unsupported += 1;
            continue;
        };
        let corners = [
            (bounds.x1(), bounds.y1()),
            (bounds.x2(), bounds.y2()),
            (bounds.x3(), bounds.y3()),
            (bounds.x4(), bounds.y4()),
        ]
        .into_iter()
        .map(|(x, y)| page.points_to_pixels(x, y, &config))
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
        let left = corners.iter().map(|(x, _)| *x).min().unwrap().max(0);
        let right = corners
            .iter()
            .map(|(x, _)| *x)
            .max()
            .unwrap()
            .min(bitmap.width());
        let top = corners.iter().map(|(_, y)| *y).min().unwrap().max(0);
        let bottom = corners
            .iter()
            .map(|(_, y)| *y)
            .max()
            .unwrap()
            .min(bitmap.height());
        if right <= left || bottom <= top {
            continue;
        }
        objects.push(
            json!({"id":id,"kind":kind,"text":text,"bounds":[left,top,right-left,bottom-top]}),
        );
    }
    let mut result = metadata(draft, &document, index)?;
    result["image"] = json!(STANDARD.encode(output.into_inner()));
    result["pixelWidth"] = json!(bitmap.width());
    result["pixelHeight"] = json!(bitmap.height());
    result["objects"] = json!(objects);
    result["unsupported"] = json!(unsupported);
    Ok(result)
}
fn replacement_image(value: &Value) -> Result<image::DynamicImage, String> {
    let encoded = value["image"].as_str().ok_or("Missing replacement image")?;
    if encoded.len() > IMAGE_LIMIT.div_ceil(3) * 4 {
        return Err("Replacement image is limited to 4 MiB".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(error)?;
    if bytes.len() > IMAGE_LIMIT {
        return Err("Replacement image is limited to 4 MiB".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(error)?;
    if !matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg)
    ) {
        return Err("Choose a PNG or JPEG image".into());
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(error)
}
fn edited_bytes(
    draft: &Draft,
    method: &str,
    value: &Value,
    pdfium: &Pdfium,
) -> Result<(Vec<u8>, i32), String> {
    check_revision(draft, value)?;
    if !draft.editable {
        return Err("Signed or restricted PDFs are read-only".into());
    }
    let mut document = pdfium
        .load_pdf_from_byte_slice(&draft.bytes, None)
        .map_err(error)?;
    let index = page_index(value, document.pages().len())?;
    let mut selected = index;
    let mut verify_text = None;
    match method {
        "insertPage" => {
            if document.pages().len() >= PAGE_LIMIT {
                return Err("The page limit has been reached".into());
            }
            let page = document.pages().get(index).map_err(error)?;
            let size = PdfPagePaperSize::from_points(page.width(), page.height());
            drop(page);
            document
                .pages_mut()
                .create_page_at_index(size, index + 1)
                .map_err(error)?;
            selected = index + 1;
        }
        "deletePage" => {
            if document.pages().len() == 1 {
                return Err("Keep at least one page".into());
            }
            document
                .pages()
                .get(index)
                .map_err(error)?
                .delete()
                .map_err(error)?;
            selected = index.min(document.pages().len() - 1);
        }
        "editText" => {
            let id = value["object"].as_u64().ok_or("Missing text object")? as usize;
            let text = value["text"].as_str().ok_or("Missing text")?;
            if text.len() > 4096 || text.chars().any(char::is_control) {
                return Err("Edit a single text fragment of up to 4096 bytes".into());
            }
            let font = value["font"].as_str().unwrap_or("original");
            let loaded_font = match font {
                "original" => None,
                "arial" | "simhei" => {
                    let windows =
                        std::env::var_os("WINDIR").ok_or("Windows fonts are unavailable")?;
                    let path = PathBuf::from(windows)
                        .join("Fonts")
                        .join(if font == "arial" {
                            "arial.ttf"
                        } else {
                            "simhei.ttf"
                        });
                    Some(
                        document
                            .fonts_mut()
                            .load_true_type_from_file(&path, true)
                            .map_err(error)?,
                    )
                }
                _ => return Err("Unknown font".into()),
            };
            let mut page = document.pages().get(index).map_err(error)?;
            page.set_content_regeneration_strategy(PdfPageContentRegenerationStrategy::Manual);
            let mut object = page.objects().get(id).map_err(error)?;
            let old = object.as_text_object_mut().ok_or("Select a text object")?;
            if !old.is_visible() {
                return Err(
                    "Select visible text; OCR layers are not editable text on the page".into(),
                );
            }
            if text.is_empty() {
                drop(object);
                page.objects_mut()
                    .remove_object_at_index(id)
                    .map_err(error)?;
            } else if let Some(font) = loaded_font {
                if old.render_mode() != PdfPageTextRenderMode::FilledUnstroked {
                    return Err("This styled text can only be edited with its original font".into());
                }
                let mut replacement =
                    PdfPageTextObject::new(&document, text, font, old.unscaled_font_size())
                        .map_err(error)?;
                replacement
                    .reset_matrix(old.matrix().map_err(error)?)
                    .map_err(error)?;
                replacement
                    .set_fill_color(old.fill_color().map_err(error)?)
                    .map_err(error)?;
                drop(object);
                page.objects_mut()
                    .remove_object_at_index(id)
                    .map_err(error)?;
                page.objects_mut()
                    .add_text_object(replacement)
                    .map_err(error)?;
                verify_text = Some((page.objects().len() - 1, text.to_string()));
            } else {
                old.set_text(text).map_err(error)?;
                verify_text = Some((id, text.to_string()));
                drop(object);
            }
            page.regenerate_content().map_err(error)?;
        }
        "resizeImage" => {
            let id = value["object"].as_u64().ok_or("Missing image object")? as usize;
            let factor = |axis: &str| -> Result<f32, String> {
                value[axis]
                    .as_f64()
                    .or_else(|| value["scale"].as_f64())
                    .filter(|s| s.is_finite() && (0.05..=20.0).contains(s))
                    .map(|s| s as f32)
                    .ok_or_else(|| "Invalid image scale".into())
            };
            let scale_x = factor("scaleX")?;
            let scale_y = factor("scaleY")?;
            let corner = value["corner"].as_str().ok_or("Missing resize corner")?;
            if !["nw", "ne", "sw", "se"].contains(&corner) {
                return Err("Invalid resize corner".into());
            }
            let mut page = document.pages().get(index).map_err(error)?;
            let mut object = page.objects().get(id).map_err(error)?;
            let old = object
                .as_image_object_mut()
                .ok_or("Select an image object")?;
            let bounds = old.bounds().map_err(error)?;
            let config = PdfRenderConfig::new().set_target_width(100000);
            let corners = [
                (bounds.x1(), bounds.y1()),
                (bounds.x2(), bounds.y2()),
                (bounds.x3(), bounds.y3()),
                (bounds.x4(), bounds.y4()),
            ]
            .into_iter()
            .map(|(x, y)| page.points_to_pixels(x, y, &config))
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
            let x = if corner.contains('w') {
                corners.iter().map(|v| v.0).max()
            } else {
                corners.iter().map(|v| v.0).min()
            }
            .ok_or("Empty image bounds")?;
            let y = if corner.contains('n') {
                corners.iter().map(|v| v.1).max()
            } else {
                corners.iter().map(|v| v.1).min()
            }
            .ok_or("Empty image bounds")?;
            let (ax, ay) = page.pixels_to_points(x, y, &config).map_err(error)?;
            let (bx, by) = page.pixels_to_points(x + 100, y, &config).map_err(error)?;
            let (sx, sy) = if (bx.value - ax.value).abs() >= (by.value - ay.value).abs() {
                (scale_x, scale_y)
            } else {
                (scale_y, scale_x)
            };
            let (ax, ay) = (ax.value, ay.value);
            let matrix = old.matrix().map_err(error)?;
            old.reset_matrix(PdfMatrix::new(
                matrix.a() * sx,
                matrix.b() * sy,
                matrix.c() * sx,
                matrix.d() * sy,
                ax + (matrix.e() - ax) * sx,
                ay + (matrix.f() - ay) * sy,
            ))
            .map_err(error)?;
            drop(object);
            page.regenerate_content().map_err(error)?;
        }
        "replaceImage" => {
            let id = value["object"].as_u64().ok_or("Missing image object")? as usize;
            let image = replacement_image(value)?;
            let mut page = document.pages().get(index).map_err(error)?;
            let mut object = page.objects().get(id).map_err(error)?;
            let old = object
                .as_image_object_mut()
                .ok_or("Select an image object")?;
            let matrix = old.matrix().map_err(error)?;
            old.set_image(&image).map_err(error)?;
            old.reset_matrix(matrix).map_err(error)?;
            drop(object);
            page.regenerate_content().map_err(error)?;
        }
        _ => return Err("Unknown draft operation".into()),
    }
    let bytes = document.save_to_bytes().map_err(error)?;
    if bytes.len() > FILE_LIMIT {
        return Err("Edited PDF exceeds 32 MiB; undo or use a smaller image".into());
    }
    if let Some((id, text)) = verify_text {
        let check = pdfium
            .load_pdf_from_byte_slice(&bytes, None)
            .map_err(error)?;
        let page = check.pages().get(index).map_err(error)?;
        let object = page.objects().get(id).map_err(error)?;
        if object
            .as_text_object()
            .ok_or("Edited text could not be verified")?
            .text()
            .trim_end()
            != text.trim_end()
        {
            return Err("The original font cannot represent this text; choose another font".into());
        }
    }
    Ok((bytes, selected))
}
fn save(draft: &mut Draft) -> Result<(), String> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0x1 | 0x4);
    }
    let mut held = options.open(&draft.path).map_err(error)?;
    if held.metadata().map_err(error)?.permissions().readonly() {
        return Err("The file is read-only; your draft has been kept".into());
    }
    let mut current = Vec::new();
    (&mut held)
        .take((FILE_LIMIT + 1) as u64)
        .read_to_end(&mut current)
        .map_err(error)?;
    if Sha256::digest(&current) != Sha256::digest(&draft.saved)
        || read_file(&draft.path)? != current
    {
        return Err(
            "The PDF was modified externally; saving was refused and your draft has been kept"
                .into(),
        );
    }
    ember_file_store::atomic_write(&draft.path, &draft.bytes).map_err(error)?;
    draft.saved.clone_from(&draft.bytes);
    draft.history.clear();
    draft.revision += 1;
    Ok(())
}
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    if method == "settings" {
        return ember_plugin_sdk::settings_applied(params);
    }
    let session = params["session"].as_str().ok_or("Missing session")?;
    let mut all = drafts()
        .lock()
        .map_err(|_| "PDF editor state is unavailable; reopen the file")?;
    if method == "release" {
        all.remove(session);
        return Ok(Value::Null);
    }
    let pdfium = engine()?;
    if method == "open" {
        if all.contains_key(session) {
            return Err("This PDF is already open".into());
        }
        let path = PathBuf::from(params["path"].as_str().ok_or("Missing file path")?);
        let bytes = read_file(&path)?;
        if all.len() >= 8
            || all.values().map(Draft::memory).sum::<usize>() + bytes.len() * 2 > PROCESS_LIMIT
        {
            return Err("PDF editor memory budget is full; close another document".into());
        }
        let mut draft = Draft {
            path,
            saved: bytes.clone(),
            bytes,
            history: Vec::new(),
            revision: 0,
            editable: false,
        };
        let document = pdfium
            .load_pdf_from_byte_slice(&draft.bytes, None)
            .map_err(error)?;
        if !(1..=PAGE_LIMIT).contains(&document.pages().len()) {
            return Err("PDF editing supports 1–1000 pages".into());
        }
        draft.editable = document.signatures().is_empty()
            && document
                .permissions()
                .can_modify_document_content()
                .map_err(error)?
            && document
                .permissions()
                .can_assemble_document()
                .map_err(error)?;
        let result = metadata(&draft, &document, 0)?;
        drop(document);
        all.insert(session.to_string(), draft);
        return Ok(result);
    }
    let other_memory = all
        .iter()
        .filter(|(id, _)| id.as_str() != session)
        .map(|(_, draft)| draft.memory())
        .sum::<usize>();
    let draft = all.get_mut(session).ok_or(
        "The native editing session was lost; reopen the file. Unsaved changes cannot be recovered",
    )?;
    if params["path"]
        .as_str()
        .is_some_and(|path| Path::new(path) != draft.path)
    {
        return Err("Editing session path mismatch".into());
    }
    let value = &params["value"];
    if method == "page" {
        return render(draft, value, pdfium);
    }
    if method == "state" {
        let document = pdfium
            .load_pdf_from_byte_slice(&draft.bytes, None)
            .map_err(error)?;
        return metadata(draft, &document, 0);
    }
    check_revision(draft, value)?;
    let mut selected = value["page"]
        .as_i64()
        .unwrap_or(1)
        .saturating_sub(1)
        .clamp(0, PAGE_LIMIT as i64) as i32;
    match method {
        "save" => {
            if !draft.editable {
                return Err("This PDF is read-only".into());
            }
            save(draft)?;
        }
        "undo" => {
            if let Some(bytes) = draft.history.pop() {
                draft.bytes = bytes;
                draft.revision += 1;
            }
        }
        "revert" => {
            draft.bytes.clone_from(&draft.saved);
            draft.history.clear();
            draft.revision += 1;
        }
        "editText" | "replaceImage" | "resizeImage" | "insertPage" | "deletePage" => {
            let (bytes, page) = edited_bytes(draft, method, value, pdfium)?;
            if other_memory + draft.memory() + bytes.len() > PROCESS_LIMIT {
                return Err(
                    "PDF editing memory budget is full; save or discard another draft".into(),
                );
            }
            draft
                .history
                .push(std::mem::replace(&mut draft.bytes, bytes));
            while draft.history.len() > 20
                || draft.history.iter().map(Vec::len).sum::<usize>() > HISTORY_LIMIT
            {
                draft.history.remove(0);
            }
            draft.revision += 1;
            selected = page;
        }
        _ => return Err(format!("Unknown PDF editor method: {method}")),
    }
    let document = pdfium
        .load_pdf_from_byte_slice(&draft.bytes, None)
        .map_err(error)?;
    metadata(draft, &document, selected)
}
fn release(params: &Value) -> Result<Value, String> {
    handle("release", params)
}
fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use image::GenericImageView;
    static TEST_LOCK: Mutex<()> = Mutex::new(());
    fn fixture(path: &Path, count: i32) {
        let pdfium = engine().unwrap();
        let mut document = pdfium.create_new_pdf().unwrap();
        let font = document.fonts_mut().helvetica();
        for index in 0..count {
            let mut page = document
                .pages_mut()
                .create_page_at_end(PdfPagePaperSize::from_points(
                    PdfPoints::new(400.0),
                    PdfPoints::new(600.0),
                ))
                .unwrap();
            page.objects_mut()
                .create_text_object(
                    PdfPoints::new(40.0),
                    PdfPoints::new(520.0),
                    format!("Original title {}", index + 1),
                    font,
                    PdfPoints::new(20.0),
                )
                .unwrap();
            if index == 0 {
                let bitmap = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
                    4,
                    4,
                    image::Rgba([255, 0, 0, 255]),
                ));
                let mut object = PdfPageImageObject::new(&document, &bitmap).unwrap();
                object
                    .reset_matrix(PdfMatrix::new(80.0, 0.0, 0.0, 60.0, 40.0, 400.0))
                    .unwrap();
                page.objects_mut().add_image_object(object).unwrap();
            }
            page.regenerate_content().unwrap();
        }
        std::fs::write(path, document.save_to_bytes().unwrap()).unwrap();
    }
    fn request(session: &str, path: &Path, method: &str, value: Value) -> Result<Value, String> {
        handle(
            method,
            &json!({"session":session,"path":path,"value":value}),
        )
    }
    fn text(path: &Path, index: i32) -> String {
        let bytes = std::fs::read(path).unwrap();
        let document = engine()
            .unwrap()
            .load_pdf_from_byte_slice(&bytes, None)
            .unwrap();
        let page = document.pages().get(index).unwrap();
        page.objects()
            .iter()
            .filter_map(|object| object.as_text_object().map(|object| object.text()))
            .collect::<Vec<_>>()
            .join(" ")
    }
    #[test]
    fn edits_the_original_text_and_saves_without_covering_it() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("text.pdf");
        fixture(&path, 4);
        let original = std::fs::read(&path).unwrap();
        let opened = request("text", &path, "open", Value::Null).unwrap();
        assert_eq!(opened["pages"], 4);
        assert_eq!(opened["editable"], true);
        let rendered = request(
            "text",
            &path,
            "page",
            json!({"page":1,"revision":0,"width":800}),
        )
        .unwrap();
        assert_eq!(rendered["objects"].as_array().unwrap().len(), 2);
        assert!(STANDARD
            .decode(rendered["image"].as_str().unwrap())
            .unwrap()
            .starts_with(b"\x89PNG"));
        let changed = request(
            "text",
            &path,
            "editText",
            json!({"page":1,"revision":0,"object":0,"text":"Edited title","font":"original"}),
        )
        .unwrap();
        assert_eq!(changed["dirty"], true);
        assert_eq!(changed["revision"], 1);
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert!(request(
            "text",
            &path,
            "editText",
            json!({"page":1,"revision":0,"object":0,"text":"stale"})
        )
        .is_err());
        let saved = request("text", &path, "save", json!({"page":2,"revision":1})).unwrap();
        assert_eq!(saved["dirty"], false);
        assert_eq!(saved["page"], 2);
        assert_eq!(text(&path, 0).trim(), "Edited title");
        let bytes = std::fs::read(&path).unwrap();
        let document = engine()
            .unwrap()
            .load_pdf_from_byte_slice(&bytes, None)
            .unwrap();
        assert_eq!(document.pages().get(0).unwrap().objects().len(), 2);
        request("text", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn replaces_real_image_pixels_and_preserves_the_object_matrix() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("image.pdf");
        fixture(&path, 1);
        request("image", &path, "open", Value::Null).unwrap();
        let replacement = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            7,
            3,
            image::Rgba([0, 0, 255, 255]),
        ));
        let mut output = Cursor::new(Vec::new());
        replacement
            .write_to(&mut output, image::ImageFormat::Png)
            .unwrap();
        request(
            "image",
            &path,
            "replaceImage",
            json!({"page":1,"revision":0,"object":1,"image":STANDARD.encode(output.into_inner())}),
        )
        .unwrap();
        request("image", &path, "save", json!({"page":1,"revision":1})).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let document = engine()
            .unwrap()
            .load_pdf_from_byte_slice(&bytes, None)
            .unwrap();
        let page = document.pages().get(0).unwrap();
        let object = page.objects().get(1).unwrap();
        let image = object.as_image_object().unwrap();
        let matrix = image.matrix().unwrap();
        assert_eq!(matrix.a(), 80.0);
        assert_eq!(matrix.d(), 60.0);
        assert_eq!(matrix.e(), 40.0);
        assert_eq!(matrix.f(), 400.0);
        let raw = image.get_raw_image().unwrap();
        assert_eq!(raw.dimensions(), (7, 3));
        assert_eq!(raw.get_pixel(2, 1), image::Rgba([0, 0, 255, 255]));
        request("image", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn resizing_changes_the_original_matrix_and_is_transactional_and_undoable() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("resize.pdf");
        fixture(&path, 1);
        let original = std::fs::read(&path).unwrap();
        request("resize", &path, "open", Value::Null).unwrap();
        for value in [
            json!({"object":1,"scale":0,"corner":"se"}),
            json!({"object":1,"scale":21,"corner":"se"}),
            json!({"object":1,"scale":1.5,"corner":"invalid"}),
            json!({"object":0,"scale":1.5,"corner":"se"}),
        ] {
            assert!(request("resize",&path,"resizeImage",json!({"page":1,"revision":0,"object":value["object"],"scale":value["scale"],"corner":value["corner"]})).is_err());
        }
        request(
            "resize",
            &path,
            "resizeImage",
            json!({"page":1,"revision":0,"object":1,"scale":1.5,"corner":"se"}),
        )
        .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), original);
        request("resize", &path, "save", json!({"page":1,"revision":1})).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let document = engine()
            .unwrap()
            .load_pdf_from_byte_slice(&bytes, None)
            .unwrap();
        let page = document.pages().get(0).unwrap();
        assert_eq!(page.objects().len(), 2);
        let object = page.objects().get(1).unwrap();
        let matrix = object.as_image_object().unwrap().matrix().unwrap();
        for (actual, expected) in [
            (matrix.a(), 120.0),
            (matrix.d(), 90.0),
            (matrix.e(), 40.0),
            (matrix.f(), 370.0),
        ] {
            assert!((actual - expected).abs() < 0.01);
        }
        request(
            "resize",
            &path,
            "resizeImage",
            json!({"page":1,"revision":2,"object":1,"scale":0.5,"corner":"nw"}),
        )
        .unwrap();
        let undone = request("resize", &path, "undo", json!({"page":1,"revision":3})).unwrap();
        assert_eq!(undone["dirty"], false);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        request("resize", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn independent_image_axes_and_remounted_draft_state() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("axes.pdf");
        fixture(&path, 1);
        request("axes", &path, "open", Value::Null).unwrap();
        request(
            "axes",
            &path,
            "resizeImage",
            json!({"page":1,"revision":0,"object":1,"scaleX":2,"scaleY":0.5,"corner":"se"}),
        )
        .unwrap();
        let state = request("axes", &path, "state", json!({"revision":0})).unwrap();
        assert_eq!(state["revision"], 1);
        assert_eq!(state["dirty"], true);
        assert!(request("axes", &path, "page", json!({"page":1,"revision":0})).is_err());
        assert!(request(
            "axes",
            &path,
            "page",
            json!({"page":1,"revision":state["revision"]})
        )
        .is_ok());
        request("axes", &path, "save", json!({"page":1,"revision":1})).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let document = engine()
            .unwrap()
            .load_pdf_from_byte_slice(&bytes, None)
            .unwrap();
        let page = document.pages().get(0).unwrap();
        let object = page.objects().get(1).unwrap();
        let matrix = object.as_image_object().unwrap().matrix().unwrap();
        assert!((matrix.a() - 160.0).abs() < 0.01);
        assert!((matrix.d() - 30.0).abs() < 0.01);
        assert!((matrix.e() - 40.0).abs() < 0.01);
        assert!((matrix.f() - 430.0).abs() < 0.01);
        request("axes", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn page_changes_are_undoable_and_never_remove_the_last_page() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("pages.pdf");
        fixture(&path, 2);
        request("pages", &path, "open", Value::Null).unwrap();
        let inserted =
            request("pages", &path, "insertPage", json!({"page":1,"revision":0})).unwrap();
        assert_eq!(inserted["pages"], 3);
        assert_eq!(inserted["page"], 2);
        let deleted =
            request("pages", &path, "deletePage", json!({"page":2,"revision":1})).unwrap();
        assert_eq!(deleted["pages"], 2);
        let undo = request("pages", &path, "undo", json!({"page":2,"revision":2})).unwrap();
        assert_eq!(undo["pages"], 3);
        let restored = request("pages", &path, "undo", json!({"page":2,"revision":3})).unwrap();
        assert_eq!(restored["pages"], 2);
        assert_eq!(restored["dirty"], false);
        request("pages", &path, "deletePage", json!({"page":2,"revision":4})).unwrap();
        assert!(
            request("pages", &path, "deletePage", json!({"page":1,"revision":5}))
                .unwrap_err()
                .contains("at least one")
        );
        let saved = request("pages", &path, "save", json!({"page":2,"revision":5})).unwrap();
        assert_eq!(saved["pages"], 1);
        assert_eq!(saved["page"], 1);
        assert_eq!(text(&path, 0).trim(), "Original title 1");
        request("pages", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn chinese_font_replacement_is_extractable_and_empty_text_removes_the_object() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chinese.pdf");
        fixture(&path, 1);
        request("chinese", &path, "open", Value::Null).unwrap();
        assert!(request(
            "chinese",
            &path,
            "editText",
            json!({"page":1,"revision":0,"object":0,"text":"中文修改","font":"original"})
        )
        .is_err());
        request(
            "chinese",
            &path,
            "editText",
            json!({"page":1,"revision":0,"object":0,"text":"中文修改","font":"simhei"}),
        )
        .unwrap();
        request("chinese", &path, "save", json!({"page":1,"revision":1})).unwrap();
        assert_eq!(text(&path, 0).trim(), "中文修改");
        let page = request("chinese", &path, "page", json!({"page":1,"revision":2})).unwrap();
        assert_eq!(
            page["objects"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|object| object["kind"] == "text")
                .count(),
            1
        );
        let id = page["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|object| object["kind"] == "text")
            .unwrap()["id"]
            .clone();
        request(
            "chinese",
            &path,
            "editText",
            json!({"page":1,"revision":2,"object":id,"text":"","font":"original"}),
        )
        .unwrap();
        request("chinese", &path, "save", json!({"page":1,"revision":3})).unwrap();
        assert!(text(&path, 0).is_empty());
        request("chinese", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn external_changes_and_failed_replacements_keep_the_draft_and_original_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("conflict.pdf");
        fixture(&path, 1);
        let original = std::fs::read(&path).unwrap();
        request("conflict", &path, "open", Value::Null).unwrap();
        request(
            "conflict",
            &path,
            "editText",
            json!({"page":1,"revision":0,"object":0,"text":"Draft title"}),
        )
        .unwrap();
        std::fs::write(&path, b"external change").unwrap();
        assert!(
            request("conflict", &path, "save", json!({"page":1,"revision":1}))
                .unwrap_err()
                .contains("externally")
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"external change");
        assert_eq!(
            request("conflict", &path, "page", json!({"page":1,"revision":1})).unwrap()["dirty"],
            true
        );
        std::fs::write(&path, &original).unwrap();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        assert!(request("conflict", &path, "save", json!({"page":1,"revision":1})).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        drop(held);
        request("conflict", &path, "save", json!({"page":1,"revision":1})).unwrap();
        assert_eq!(text(&path, 0).trim(), "Draft title");
        request("conflict", &path, "release", Value::Null).unwrap();
    }
    #[test]
    fn malformed_operations_are_transactional_and_released_sessions_do_not_reopen_silently() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("invalid.pdf");
        fixture(&path, 1);
        request("invalid", &path, "open", Value::Null).unwrap();
        for (method, value) in [
            (
                "replaceImage",
                json!({"page":1,"revision":0,"object":1,"image":"not base64"}),
            ),
            (
                "editText",
                json!({"page":1,"revision":0,"object":1,"text":"wrong type"}),
            ),
            (
                "editText",
                json!({"page":1,"revision":0,"object":0,"text":"two\nlines"}),
            ),
            ("insertPage", json!({"page":3,"revision":0})),
        ] {
            assert!(request("invalid", &path, method, value).is_err());
            let state = request(
                "invalid",
                &path,
                "page",
                json!({"page":1,"revision":0,"width":256}),
            )
            .unwrap();
            assert_eq!(state["dirty"], false);
            assert_eq!(state["revision"], 0);
        }
        request("invalid", &path, "release", Value::Null).unwrap();
        assert!(
            request("invalid", &path, "page", json!({"page":1,"revision":0}))
                .unwrap_err()
                .contains("session was lost")
        );
    }

    #[test]
    fn a_signature_field_makes_the_document_read_only() {
        let _guard = TEST_LOCK.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("signed.pdf");
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R /AcroForm << /SigFlags 3 /Fields [6 0 R] >> >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << >> /Contents 4 0 R /Annots [6 0 R] >>",
            "<< /Length 4 >>\nstream\nq Q\nendstream",
            "<< >>",
            "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature) /V 7 0 R /Rect [0 0 0 0] /P 3 0 R >>",
            "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 1 2 3] /Contents <00> >>",
        ];
        let mut bytes = String::from("%PDF-1.7\n");
        let mut offsets = Vec::new();
        for (index, object) in objects.iter().enumerate() {
            offsets.push(bytes.len());
            bytes.push_str(&format!("{} 0 obj\n{object}\nendobj\n", index + 1));
        }
        let xref = bytes.len();
        bytes.push_str("xref\n0 8\n0000000000 65535 f \n");
        for offset in offsets {
            bytes.push_str(&format!("{offset:010} 00000 n \n"));
        }
        bytes.push_str(&format!(
            "trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
        ));
        std::fs::write(&path, bytes).unwrap();
        let opened = request("signed", &path, "open", Value::Null).unwrap();
        assert_eq!(opened["editable"], false);
        assert!(request(
            "signed",
            &path,
            "insertPage",
            json!({"revision":0,"page":1})
        )
        .is_err());
        assert!(request("signed", &path, "save", json!({"revision":0,"page":1})).is_err());
        assert!(request(
            "signed",
            &path,
            "page",
            json!({"revision":0,"page":1,"width":256})
        )
        .is_ok());
        request("signed", &path, "release", Value::Null).unwrap();
    }
}
