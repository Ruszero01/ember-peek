//! The image plugin's native half: what the file is, and how big it is.
//!
//! The size is read from the header alone — no decode, no pixels — because the view needs it
//! during its preparation, before the host shows the window. That is the one fact that has to be
//! known early, so it is read the cheap way instead of loading the picture twice.
use serde_json::{json, Value};
use std::io::Read;

/// How much of the file is read looking for a header. Enough for a JPEG whose frame header
/// follows a large EXIF block, and small enough to be free next to reading the picture itself.
const HEADER_LIMIT: u64 = 256 * 1024;

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    if method == "settings" {
        return ember_plugin_sdk::settings_applied(params);
    }
    if method != "open" {
        return Err(format!("Unknown image method: {method}"));
    }
    if !params["source"].is_null() {
        return Ok(Value::Null);
    }
    let path = params["path"].as_str().ok_or("Missing file path")?;
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size > 128 * 1024 * 1024 {
        return Err("图片超过当前 128 MiB 加载上限".into());
    }
    let extension = std::path::Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        _ => return Err("图片插件不支持此格式".into()),
    };
    let mut result = json!({"mime":mime,"size":size});
    // A format whose size cannot be read is not an error: the picture still shows, it just opens
    // in the window the user's own last one had.
    if let Some((width, height)) = dimensions(&extension, path) {
        result["dimensions"] = json!({"width":width,"height":height});
    }
    Ok(result)
}

/// The picture's size in pixels, from its header. `None` when the format carries none in the
/// part that was read, which is the answer for a drawing with no intrinsic size.
fn dimensions(extension: &str, path: &str) -> Option<(f64, f64)> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut head = Vec::new();
    file.by_ref()
        .take(HEADER_LIMIT)
        .read_to_end(&mut head)
        .ok()?;
    let size = match extension {
        "png" => png(&head),
        "jpg" | "jpeg" => jpeg(&head),
        "gif" => gif(&head),
        "webp" => webp(&head),
        "bmp" => bmp(&head),
        "avif" => avif(&head),
        "svg" => svg(&head),
        _ => None,
    };
    size.filter(|(width, height)| *width > 0.0 && *height > 0.0)
}

fn u16be(bytes: &[u8]) -> Option<u16> {
    Some(u16::from_be_bytes(bytes.get(..2)?.try_into().ok()?))
}
fn u32be(bytes: &[u8]) -> Option<u32> {
    Some(u32::from_be_bytes(bytes.get(..4)?.try_into().ok()?))
}
fn u16le(bytes: &[u8]) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(..2)?.try_into().ok()?))
}
fn u32le(bytes: &[u8]) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(..4)?.try_into().ok()?))
}

/// PNG: the IHDR chunk sits at a fixed offset once the signature is there.
fn png(bytes: &[u8]) -> Option<(f64, f64)> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    if bytes.get(..8)? != SIGNATURE || bytes.get(12..16)? != b"IHDR" {
        return None;
    }
    Some((
        u32be(bytes.get(16..)?)? as f64,
        u32be(bytes.get(20..)?)? as f64,
    ))
}

/// JPEG: walk the marker segments to the frame header, which is where the size lives. Every
/// other segment is skipped by its own length, which is what makes this work on a file whose
/// frame header sits behind a thumbnail.
fn jpeg(bytes: &[u8]) -> Option<(f64, f64)> {
    if bytes.get(..2)? != [0xff, 0xd8] {
        return None;
    }
    let mut at = 2;
    while at + 4 <= bytes.len() {
        if bytes[at] != 0xff {
            at += 1;
            continue;
        }
        let marker = bytes[at + 1];
        // Padding and stand-alone markers carry no length of their own.
        if marker == 0xff {
            at += 1;
            continue;
        }
        if marker == 0x01 || (0xd0..=0xd9).contains(&marker) {
            at += 2;
            continue;
        }
        let length = u16be(bytes.get(at + 2..)?)? as usize;
        // SOF0..SOF15, minus the markers in that range that are not frame headers.
        if (0xc0..=0xcf).contains(&marker) && marker != 0xc4 && marker != 0xc8 && marker != 0xcc {
            let frame = bytes.get(at + 4..)?;
            return Some((
                u16be(frame.get(3..)?)? as f64,
                u16be(frame.get(1..)?)? as f64,
            ));
        }
        if length < 2 {
            return None;
        }
        at += 2 + length;
    }
    None
}

/// GIF: the logical screen descriptor is at a fixed offset.
fn gif(bytes: &[u8]) -> Option<(f64, f64)> {
    if !matches!(bytes.get(..6)?, b"GIF87a" | b"GIF89a") {
        return None;
    }
    Some((
        u16le(bytes.get(6..)?)? as f64,
        u16le(bytes.get(8..)?)? as f64,
    ))
}

/// BMP: the DIB header that follows the file header, in either of its two sizes.
fn bmp(bytes: &[u8]) -> Option<(f64, f64)> {
    if bytes.get(..2)? != b"BM" {
        return None;
    }
    if u32le(bytes.get(14..)?)? == 12 {
        return Some((
            u16le(bytes.get(18..)?)? as f64,
            u16le(bytes.get(20..)?)? as f64,
        ));
    }
    // A negative height is a top-down bitmap, which is a size all the same.
    let width = u32le(bytes.get(18..)?)? as i32;
    let height = u32le(bytes.get(22..)?)? as i32;
    Some((width.unsigned_abs() as f64, height.unsigned_abs() as f64))
}

/// WebP: the canvas lives in one of three chunk layouts, and which one it is decides where.
fn webp(bytes: &[u8]) -> Option<(f64, f64)> {
    if bytes.get(..4)? != b"RIFF" || bytes.get(8..12)? != b"WEBP" {
        return None;
    }
    match bytes.get(12..16)? {
        b"VP8X" => {
            let canvas = bytes.get(24..30)?;
            let width = 1 + (canvas[0] as u32 | (canvas[1] as u32) << 8 | (canvas[2] as u32) << 16);
            let height =
                1 + (canvas[3] as u32 | (canvas[4] as u32) << 8 | (canvas[5] as u32) << 16);
            Some((width as f64, height as f64))
        }
        b"VP8 " => {
            // Lossy: after the 3-byte frame tag and the 3-byte start code, two 14-bit sizes.
            let frame = bytes.get(23..)?;
            if frame.get(..3)? != [0x9d, 0x01, 0x2a] {
                return None;
            }
            let size = frame.get(3..)?;
            Some((
                (u16le(size)? & 0x3fff) as f64,
                (u16le(size.get(2..)?)? & 0x3fff) as f64,
            ))
        }
        b"VP8L" => {
            // Lossless: a signature byte, then 14 bits of width and 14 of height.
            if *bytes.get(20)? != 0x2f {
                return None;
            }
            let bits = bytes.get(21..25)?;
            let packed = u32le(bits)?;
            Some((
                ((packed & 0x3fff) + 1) as f64,
                (((packed >> 14) & 0x3fff) + 1) as f64,
            ))
        }
        _ => None,
    }
}

/// AVIF: an ISO base media file, so the size is in an `ispe` box inside `meta`. The boxes are
/// walked rather than searched for, so bytes that merely look like a box are not read as one.
fn avif(bytes: &[u8]) -> Option<(f64, f64)> {
    fn boxes(bytes: &[u8], inner: bool) -> Option<(f64, f64)> {
        let mut at = 0;
        while at + 8 <= bytes.len() {
            let size = u32be(bytes.get(at..)?)? as usize;
            let kind = bytes.get(at + 4..at + 8)?;
            let end = if size == 0 { bytes.len() } else { at + size };
            if size != 0 && size < 8 {
                return None;
            }
            let body = bytes.get(at + 8..end)?;
            if kind == b"meta" {
                // A full box, so its own version and flags come before the boxes inside it.
                if let Some(found) = boxes(body.get(4..)?, true) {
                    return Some(found);
                }
            }
            if kind == b"ispe" {
                // A full box whose payload is the width and the height, in that order.
                let payload = body.get(4..)?;
                return Some((u32be(payload)? as f64, u32be(payload.get(4..)?)? as f64));
            }
            if inner && matches!(kind, b"iprp" | b"ipco") {
                if let Some(found) = boxes(body, true) {
                    return Some(found);
                }
            }
            if size == 0 {
                return None;
            }
            at = end;
        }
        None
    }
    if bytes.get(4..8)? != b"ftyp" {
        return None;
    }
    boxes(bytes, false)
}

/// SVG: a drawing states its size as attributes when it has one, and otherwise only as a view
/// box. Either is a size to open a window with; neither is a reason to refuse the file.
fn svg(bytes: &[u8]) -> Option<(f64, f64)> {
    let text = String::from_utf8_lossy(bytes);
    let open = text.get(text.find("<svg")?..)?;
    let tag = open.get(..open.find('>')?)?;
    let attribute = |name: &str| -> Option<f64> {
        let at = tag.find(&format!("{name}="))?;
        let value = tag
            .get(at + name.len() + 1..)?
            .trim_start_matches(['"', '\'']);
        value
            .get(..value.find(['"', '\''])?)?
            .trim()
            .trim_end_matches("px")
            .parse()
            .ok()
    };
    if let (Some(width), Some(height)) = (attribute("width"), attribute("height")) {
        return Some((width, height));
    }
    let view = tag
        .find("viewBox=")
        .and_then(|at| tag.get(at + "viewBox=".len() + 1..))
        .and_then(|rest| rest.split(['"', '\'']).next())
        .map(|value| {
            value
                .split([' ', ','])
                .filter_map(|part| part.trim().parse::<f64>().ok())
                .collect::<Vec<_>>()
        })?;
    if view.len() == 4 {
        return Some((view[2], view[3]));
    }
    None
}

fn main() {
    ember_plugin_sdk::serve(handle);
}

#[cfg(test)]
mod tests {
    #[test]
    fn accepts_large_photos_and_rejects_files_over_the_loading_budget() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("photo.jpg");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(40 * 1024 * 1024).unwrap();
        let params = json!({"path": path});
        assert_eq!(
            handle("open", &params).unwrap()["size"],
            40 * 1024 * 1024u64
        );
        file.set_len(128 * 1024 * 1024 + 1).unwrap();
        assert!(handle("open", &params).unwrap_err().contains("128 MiB"));
    }

    use super::{avif, bmp, gif, handle, jpeg, png, svg, webp};
    use serde_json::json;

    #[test]
    fn every_format_this_plugin_claims_reports_its_size() {
        // PNG: the signature, then the IHDR chunk.
        let mut image = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        image.extend_from_slice(&[0, 0, 0, 13]);
        image.extend_from_slice(b"IHDR");
        image.extend_from_slice(&4000u32.to_be_bytes());
        image.extend_from_slice(&3000u32.to_be_bytes());
        assert_eq!(png(&image), Some((4000.0, 3000.0)));

        // JPEG: a comment segment to skip first, then the frame header.
        let mut image = vec![0xff, 0xd8];
        image.extend_from_slice(&[0xff, 0xfe, 0x00, 0x06, 1, 2, 3, 4]);
        image.extend_from_slice(&[0xff, 0xc0, 0x00, 0x11, 8]);
        image.extend_from_slice(&2400u16.to_be_bytes());
        image.extend_from_slice(&1800u16.to_be_bytes());
        assert_eq!(jpeg(&image), Some((1800.0, 2400.0)));

        let mut image = b"GIF89a".to_vec();
        image.extend_from_slice(&640u16.to_le_bytes());
        image.extend_from_slice(&480u16.to_le_bytes());
        assert_eq!(gif(&image), Some((640.0, 480.0)));

        let mut image = b"BM".to_vec();
        image.extend_from_slice(&[0; 12]);
        image.extend_from_slice(&40u32.to_le_bytes());
        image.extend_from_slice(&1024i32.to_le_bytes());
        image.extend_from_slice(&(-768i32).to_le_bytes());
        assert_eq!(bmp(&image), Some((1024.0, 768.0)));

        // WebP, extended layout: a 24-bit canvas size, stored minus one.
        let mut image = b"RIFF".to_vec();
        image.extend_from_slice(&[0, 0, 0, 0]);
        image.extend_from_slice(b"WEBP");
        image.extend_from_slice(b"VP8X");
        image.extend_from_slice(&[0; 8]);
        image.extend_from_slice(&[0x8f, 0x03, 0x00]); // 911
        image.extend_from_slice(&[0x57, 0x02, 0x00]); // 599
        assert_eq!(webp(&image), Some((912.0, 600.0)));

        let mut image = b"RIFF".to_vec();
        image.extend_from_slice(&[0, 0, 0, 0]);
        image.extend_from_slice(b"WEBP");
        image.extend_from_slice(b"VP8L");
        image.extend_from_slice(&5u32.to_le_bytes());
        image.push(0x2f);
        let packed = (399u32) | (299u32 << 14);
        image.extend_from_slice(&packed.to_le_bytes());
        assert_eq!(webp(&image), Some((400.0, 300.0)));

        // AVIF: ftyp, then meta holding an ispe box.
        let mut image = Vec::new();
        image.extend_from_slice(&16u32.to_be_bytes());
        image.extend_from_slice(b"ftyp");
        image.extend_from_slice(b"avif");
        image.extend_from_slice(&[0; 4]);
        image.extend_from_slice(&32u32.to_be_bytes());
        image.extend_from_slice(b"meta");
        image.extend_from_slice(&[0; 4]);
        image.extend_from_slice(&20u32.to_be_bytes());
        image.extend_from_slice(b"ispe");
        image.extend_from_slice(&[0; 4]);
        image.extend_from_slice(&1920u32.to_be_bytes());
        image.extend_from_slice(&1080u32.to_be_bytes());
        assert_eq!(avif(&image), Some((1920.0, 1080.0)));

        // SVG states it as attributes, or only as a view box.
        assert_eq!(
            svg(br#"<svg width="120px" height="80px"></svg>"#),
            Some((120.0, 80.0))
        );
        assert_eq!(
            svg(br#"<svg viewBox="0 0 320 240"></svg>"#),
            Some((320.0, 240.0))
        );
    }

    #[test]
    fn a_header_that_is_not_what_it_claims_is_not_guessed_at() {
        // A file whose extension lies, and a header that stops before the size does.
        assert_eq!(png(b"not a png at all"), None);
        assert_eq!(jpeg(&[0xff, 0xd8]), None);
        assert_eq!(svg(b"<svg></svg>"), None);
    }
}
