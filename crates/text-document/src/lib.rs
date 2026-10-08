use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Read;

/// Shared byte budget for preview decoding and lossless editor saves.
pub const MAX_TEXT_BYTES: usize = 16 * 1024 * 1024;

pub fn load(path: &std::path::Path) -> Result<Value, String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take((MAX_TEXT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let truncated = bytes.len() > MAX_TEXT_BYTES;
    bytes.truncate(MAX_TEXT_BYTES);
    let fingerprint = format!("{:x}", Sha256::digest(&bytes));
    let mut valid = true;
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let (text, encoding) = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let little = bytes[0] == 0xff;
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|b| {
                if little {
                    u16::from_le_bytes([b[0], b[1]])
                } else {
                    u16::from_be_bytes([b[0], b[1]])
                }
            })
            .collect();
        {
            valid = bytes.len().is_multiple_of(2) && String::from_utf16(&units).is_ok();
            (
                String::from_utf16_lossy(&units),
                if little { "UTF-16LE" } else { "UTF-16BE" },
            )
        }
    } else {
        let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
        {
            valid &= std::str::from_utf8(bytes).is_ok();
            (String::from_utf8_lossy(bytes).into_owned(), "UTF-8")
        }
    };
    Ok(
        json!({"text":text,"encoding":encoding,"truncated":truncated,"editable":valid && !truncated,"bom":bom,"fingerprint":fingerprint}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_text_at_budget_is_editable_but_overflow_is_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.txt");
        let bytes = vec![b'x'; MAX_TEXT_BYTES];
        std::fs::write(&path, &bytes).unwrap();
        let value = load(&path).unwrap();
        assert_eq!(value["text"].as_str().unwrap().len(), MAX_TEXT_BYTES);
        assert_eq!(value["truncated"], false);
        assert_eq!(value["editable"], true);
        let mut oversized = bytes;
        oversized.push(b'y');
        std::fs::write(&path, oversized).unwrap();
        let value = load(&path).unwrap();
        assert_eq!(value["text"].as_str().unwrap().len(), MAX_TEXT_BYTES);
        assert_eq!(value["truncated"], true);
        assert_eq!(value["editable"], false);
    }
}
