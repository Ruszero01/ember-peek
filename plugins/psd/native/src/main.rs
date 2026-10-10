//! Read the saved composite directly; never load or interpret layer payloads.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    sync::{Arc, Mutex, OnceLock},
};

const SIDE: usize = 2560;
const CACHE_LIMIT: usize = 128 * 1024 * 1024;
const CHUNK: usize = 512 * 1024;
struct Preview {
    bytes: Vec<u8>,
    width: usize,
    height: usize,
}
type Images = HashMap<String, Arc<Preview>>;
static IMAGES: OnceLock<Mutex<Images>> = OnceLock::new();
fn images() -> &'static Mutex<Images> {
    IMAGES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug)]
struct Header {
    version: u64,
    channels: usize,
    width: usize,
    height: usize,
    colors: usize,
}
fn number(input: &mut impl Read, count: usize) -> Result<u64, String> {
    let mut bytes = [0; 8];
    input
        .read_exact(&mut bytes[8 - count..])
        .map_err(|e| e.to_string())?;
    Ok(u64::from_be_bytes(bytes))
}
fn header(input: &mut impl Read) -> Result<Header, String> {
    let mut signature = [0; 4];
    input
        .read_exact(&mut signature)
        .map_err(|e| e.to_string())?;
    if &signature != b"8BPS" {
        return Err("Invalid PSD signature".into());
    }
    let version = number(input, 2)?;
    if !matches!(version, 1 | 2) || number(input, 6)? != 0 {
        return Err("Invalid PSD header".into());
    }
    let channels = number(input, 2)? as usize;
    let height = number(input, 4)? as usize;
    let width = number(input, 4)? as usize;
    let depth = number(input, 2)?;
    let mode = number(input, 2)?;
    let colors = match mode {
        1 => 1,
        3 => 3,
        _ => return Err("Preview supports RGB and grayscale composites only".into()),
    };
    let limit = if version == 1 { 30_000 } else { 300_000 };
    if width == 0
        || height == 0
        || width > limit
        || height > limit
        || !(colors..=56).contains(&channels)
    {
        return Err("Invalid PSD dimensions or channels".into());
    }
    if depth != 8 {
        return Err("Preview requires an 8-bit saved composite".into());
    }
    Ok(Header {
        version,
        channels,
        width,
        height,
        colors,
    })
}
fn preview_size(head: &Header) -> (usize, usize) {
    let longest = head.width.max(head.height);
    if longest <= SIDE {
        (head.width, head.height)
    } else {
        (
            (head.width * SIDE / longest).max(1),
            (head.height * SIDE / longest).max(1),
        )
    }
}
fn skip(input: &mut (impl Read + Seek), count: u64, end: u64) -> Result<(), String> {
    let next = input
        .stream_position()
        .map_err(|e| e.to_string())?
        .checked_add(count)
        .ok_or("Section length overflow")?;
    if next > end {
        return Err("Truncated PSD section".into());
    }
    input
        .seek(SeekFrom::Start(next))
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn unpack(bytes: &[u8], row: &mut [u8]) -> Result<(), String> {
    let (mut from, mut to) = (0usize, 0usize);
    while from < bytes.len() {
        let tag = bytes[from] as i8;
        from += 1;
        if tag == -128 {
            continue;
        }
        let length = if tag >= 0 {
            tag as usize + 1
        } else {
            (1 - tag as i16) as usize
        };
        let end = to.checked_add(length).ok_or("RLE overflow")?;
        let target = row.get_mut(to..end).ok_or("RLE exceeds row")?;
        if tag >= 0 {
            let source = bytes
                .get(from..from + length)
                .ok_or("Truncated RLE literal")?;
            target.copy_from_slice(source);
            from += length;
        } else {
            target.fill(*bytes.get(from).ok_or("Truncated RLE run")?);
            from += 1;
        }
        to = end;
    }
    if to != row.len() {
        return Err("Incomplete RLE row".into());
    }
    Ok(())
}
fn decode(input: &mut (impl Read + Seek), head: &Header, end: u64) -> Result<Vec<u8>, String> {
    for count in [4, 4, if head.version == 2 { 8 } else { 4 }] {
        let length = number(input, count)?;
        skip(input, length, end)?;
    }
    let compression = number(input, 2)?;
    if compression > 1 {
        return Err("Preview supports raw and RLE saved composites; save with Photoshop compatibility enabled".into());
    }
    let (width, height) = preview_size(head);
    let mut pixels = vec![255; width * height * 4];
    let mut row = vec![0; head.width];
    let mut packed = Vec::new();
    let mut offsets = Vec::new();
    let start = if compression == 1 {
        let count = head.channels * head.height;
        let entry = if head.version == 2 { 4 } else { 2 };
        let table_end = input
            .stream_position()
            .map_err(|e| e.to_string())?
            .checked_add((count * entry) as u64)
            .ok_or("RLE table overflow")?;
        if table_end > end {
            return Err("Truncated RLE table".into());
        }
        // Only retain offsets for color rows, but validate all declared channel lengths.
        let mut offset = table_end;
        for index in 0..count {
            let length = number(input, entry)?;
            if index < head.colors * head.height {
                offsets.push((offset, length));
            }
            offset = offset.checked_add(length).ok_or("RLE length overflow")?;
            if offset > end {
                return Err("Truncated composite".into());
            }
        }
        table_end
    } else {
        let start = input.stream_position().map_err(|e| e.to_string())?;
        let length = (head.width as u64) * (head.height as u64) * (head.channels as u64);
        if start.checked_add(length).ok_or("Composite overflow")? > end {
            return Err("Truncated composite".into());
        }
        start
    };
    for channel in 0..head.colors {
        for y in 0..height {
            let original_y = y * head.height / height;
            let index = channel * head.height + original_y;
            let (offset, length) = if compression == 1 {
                offsets[index]
            } else {
                (start + (index * head.width) as u64, head.width as u64)
            };
            // A valid PackBits row cannot need more than two bytes per sample plus padding.
            if length > (head.width * 2 + 1024) as u64 {
                return Err("RLE row exceeds budget".into());
            }
            input
                .seek(SeekFrom::Start(offset))
                .map_err(|e| e.to_string())?;
            if compression == 1 {
                packed.resize(length as usize, 0);
                input.read_exact(&mut packed).map_err(|e| e.to_string())?;
                unpack(&packed, &mut row)?;
            } else {
                input.read_exact(&mut row).map_err(|e| e.to_string())?;
            }
            for x in 0..width {
                let sample = row[x * head.width / width];
                let at = (y * width + x) * 4;
                if head.colors == 1 {
                    pixels[at..at + 3].fill(sample);
                } else {
                    pixels[at + channel] = sample;
                }
            }
        }
    }
    Ok(pixels)
}
fn session(params: &Value) -> Result<&str, String> {
    params["session"].as_str().ok_or("Missing session".into())
}
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    if method == "settings" {
        return ember_plugin_sdk::settings_applied(params);
    }
    match method {
        "open" => {
            let mut file = File::open(params["path"].as_str().ok_or("Missing path")?)
                .map_err(|e| e.to_string())?;
            let head = header(&mut file)?;
            let (width, height) = preview_size(&head);
            Ok(
                json!({"dimensions":{"width":head.width,"height":head.height},"preview":{"width":width,"height":height},"size":width*height*4}),
            )
        }
        "render" => {
            let owner = session(params)?;
            // Serialize decodes to bound concurrent allocations in the SDK's worker pool.
            let mut cache = images().lock().map_err(|e| e.to_string())?;
            if let Some(bytes) = cache.get(owner) {
                return Ok(
                    json!({"size":bytes.bytes.len(),"width":bytes.width,"height":bytes.height}),
                );
            }
            let mut file = File::open(params["path"].as_str().ok_or("Missing path")?)
                .map_err(|e| e.to_string())?;
            let end = file.metadata().map_err(|e| e.to_string())?.len();
            let head = header(&mut file)?;
            let (width, height) = preview_size(&head);
            if cache.values().map(|v| v.bytes.len()).sum::<usize>() + width * height * 4
                > CACHE_LIMIT
            {
                return Err("PSD preview cache is full; close an older preview".into());
            }
            let mut reader = std::io::BufReader::with_capacity(64 * 1024, file);
            let bytes = decode(&mut reader, &head, end)?;
            let size = bytes.len();
            cache.insert(
                owner.to_owned(),
                Arc::new(Preview {
                    bytes,
                    width,
                    height,
                }),
            );
            Ok(json!({"size":size,"width":width,"height":height}))
        }
        "pixels" => {
            let value = &params["value"];
            let offset = value["offset"].as_u64().ok_or("Missing offset")?;
            let length = value["length"].as_u64().ok_or("Missing length")?;
            if length == 0 || length > CHUNK as u64 {
                return Err("Read at most 512 KiB".into());
            }
            let bytes = images()
                .lock()
                .map_err(|e| e.to_string())?
                .get(session(params)?)
                .cloned()
                .ok_or("Preview not rendered")?;
            let end = offset.checked_add(length).ok_or("Read overflow")?;
            if end > bytes.bytes.len() as u64 {
                return Err("Read outside preview".into());
            }
            Ok(Value::String(
                STANDARD.encode(&bytes.bytes[offset as usize..end as usize]),
            ))
        }
        _ => Err(format!("Unknown PSD method: {method}")),
    }
}
fn release(params: &Value) -> Result<Value, String> {
    images()
        .lock()
        .map_err(|e| e.to_string())?
        .remove(session(params)?);
    Ok(Value::Null)
}
fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn fixture(version: u16, compression: u16) -> Vec<u8> {
        let mut bytes = b"8BPS".to_vec();
        bytes.extend(version.to_be_bytes());
        bytes.extend([0; 6]);
        bytes.extend(3u16.to_be_bytes());
        bytes.extend(2u32.to_be_bytes());
        bytes.extend(2u32.to_be_bytes());
        bytes.extend(8u16.to_be_bytes());
        bytes.extend(3u16.to_be_bytes());
        bytes.extend([0; 8]);
        bytes.extend(vec![0; if version == 2 { 8 } else { 4 }]);
        bytes.extend(compression.to_be_bytes());
        if compression == 1 {
            for _ in 0..6 {
                if version == 2 {
                    bytes.extend(3u32.to_be_bytes());
                } else {
                    bytes.extend(3u16.to_be_bytes());
                }
            }
        }
        for row in [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]] {
            if compression == 1 {
                bytes.push(1);
            }
            bytes.extend(row);
        }
        bytes
    }
    #[test]
    fn psd_and_psb_raw_and_rle_composites_match() {
        for version in [1, 2] {
            for compression in [0, 1] {
                let bytes = fixture(version, compression);
                let end = bytes.len() as u64;
                let mut input = Cursor::new(bytes);
                let head = header(&mut input).unwrap();
                assert_eq!(
                    decode(&mut input, &head, end).unwrap(),
                    [1, 5, 9, 255, 2, 6, 10, 255, 3, 7, 11, 255, 4, 8, 12, 255]
                );
            }
        }
    }
    #[test]
    fn malformed_rows_and_truncated_sections_fail() {
        for bytes in [&[2, 1, 2][..], &[254][..], &[254, 1][..], &[0, 1][..]] {
            assert!(unpack(bytes, &mut [0; 2]).is_err());
        }
        let mut row = [0; 3];
        unpack(&[128, 254, 42], &mut row).unwrap();
        assert_eq!(row, [42; 3]);
        let bytes = fixture(2, 1);
        let mut input = Cursor::new(bytes.clone());
        let head = header(&mut input).unwrap();
        assert!(decode(&mut input, &head, bytes.len() as u64 - 1).is_err());
        let mut input = Cursor::new(bytes);
        input.set_position(26);
        input.get_mut()[26..30].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(decode(&mut input, &head, 100).is_err());
    }
    #[test]
    fn psb_skips_layer_sections_beyond_four_gib_without_loading_them() {
        // A virtual gap tests 64-bit seeks without allocating a multi-gigabyte fixture.
        struct Sparse {
            prefix: Cursor<Vec<u8>>,
            tail: Cursor<Vec<u8>>,
            position: u64,
            gap_end: u64,
        }
        impl Read for Sparse {
            fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
                let n = if self.position < 42 {
                    self.prefix.set_position(self.position);
                    self.prefix.read(out)?
                } else if self.position >= self.gap_end {
                    self.tail.set_position(self.position - self.gap_end);
                    self.tail.read(out)?
                } else {
                    return Err(std::io::Error::other("Layer data must not be read"));
                };
                self.position += n as u64;
                Ok(n)
            }
        }
        impl Seek for Sparse {
            fn seek(&mut self, from: SeekFrom) -> std::io::Result<u64> {
                self.position = match from {
                    SeekFrom::Start(n) => n,
                    SeekFrom::Current(n) => self.position.checked_add_signed(n).unwrap(),
                    SeekFrom::End(_) => unreachable!(),
                };
                Ok(self.position)
            }
        }
        let bytes = fixture(2, 0);
        let gap = 5u64 * 1024 * 1024 * 1024;
        let mut prefix = bytes[..42].to_vec();
        prefix[34..42].copy_from_slice(&gap.to_be_bytes());
        let end = bytes.len() as u64 + gap;
        let mut input = Sparse {
            prefix: Cursor::new(prefix),
            tail: Cursor::new(bytes[42..].to_vec()),
            position: 0,
            gap_end: 42 + gap,
        };
        let head = header(&mut input).unwrap();
        assert_eq!(decode(&mut input, &head, end).unwrap()[..4], [1, 5, 9, 255]);
    }
    #[test]
    fn rpc_bounds_and_release_are_enforced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.psd");
        std::fs::write(&path, fixture(1, 1)).unwrap();
        let mut params = json!({"path":path,"session":"psd-test"});
        assert_eq!(handle("open", &params).unwrap()["size"], 16);
        let rendered = handle("render", &params).unwrap();
        assert_eq!(rendered["size"], 16);
        assert_eq!(handle("render", &params).unwrap(), rendered);
        params["value"] = json!({"offset":0,"length":4});
        assert_eq!(
            handle("pixels", &params).unwrap(),
            STANDARD.encode([1, 5, 9, 255])
        );
        params["value"] = json!({"offset":u64::MAX,"length":4});
        assert!(handle("pixels", &params).is_err());
        release(&params).unwrap();
        assert!(handle("pixels", &params).is_err());
    }
    #[test]
    fn output_budget_preserves_aspect_ratio() {
        let head = Header {
            version: 2,
            channels: 3,
            width: 13760,
            height: 5440,
            colors: 3,
        };
        assert_eq!(preview_size(&head), (2560, 1012));
    }
}
