use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Read;
const LIMIT: usize = ember_text_document::MAX_TEXT_BYTES;

fn encode(value: &Value) -> Result<Vec<u8>, String> {
    let text = value["text"].as_str().ok_or("Missing text")?;
    // UTF-16 sources can expand to more UTF-8 bytes without exceeding the file budget.
    if text.len() > LIMIT * 3 {
        return Err("编辑内容过大，无法保存".into());
    }
    let mut bytes = Vec::new();
    match value["encoding"].as_str().ok_or("Missing encoding")? {
        "UTF-8" => {
            if value["bom"].as_bool().unwrap_or(false) {
                bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
            }
            bytes.extend_from_slice(text.as_bytes());
        }
        "UTF-16LE" | "UTF-16BE" => {
            let little = value["encoding"] == "UTF-16LE";
            bytes.extend_from_slice(if little { &[0xff, 0xfe] } else { &[0xfe, 0xff] });
            for unit in text.encode_utf16() {
                bytes.extend_from_slice(&if little {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                });
            }
        }
        _ => return Err("不支持的编码".into()),
    }
    if bytes.len() > LIMIT {
        return Err("编码后的文件超过 16 MiB 限制".into());
    }
    Ok(bytes)
}
fn save(params: &Value) -> Result<Value, String> {
    let value = &params["value"];
    let bytes = encode(value)?;
    let expected = value["fingerprint"]
        .as_str()
        .ok_or("Missing original fingerprint")?;
    let path = params["path"].as_str().ok_or("Missing file path")?;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny in-place writers while checking and replacing; permit the atomic rename.
        options.share_mode(0x1 | 0x4); // FILE_SHARE_READ | FILE_SHARE_DELETE
    }
    let mut file = options
        .open(path)
        .map_err(|e| format!("无法独占打开文件：{e}"))?;
    if file.metadata().map_err(|e| e.to_string())?.len() > LIMIT as u64 {
        return Err("文件已改变或超出编辑限制".into());
    }
    let mut original = Vec::new();
    (&mut file)
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut original)
        .map_err(|e| e.to_string())?;
    if format!("{:x}", Sha256::digest(&original)) != expected {
        return Err("文件已被外部修改，保存已拒绝。请保留草稿，重新打开文件后合并修改。".into());
    }
    if file
        .metadata()
        .map_err(|e| e.to_string())?
        .permissions()
        .readonly()
    {
        return Err("文件为只读，保存已拒绝".into());
    }
    // Atomic replacements by another editor are not excluded by a sharing lock. Recheck
    // the current path too, rather than validating only an already-renamed file handle.
    let mut current = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut current)
        .map_err(|e| e.to_string())?;
    if current != original {
        return Err("文件已被外部修改，保存已拒绝。请保留草稿。".into());
    }
    ember_file_store::atomic_write(std::path::Path::new(path), &bytes)
        .map_err(|error| format!("保存替换失败，请保留当前草稿：{error}"))?;
    Ok(json!({"fingerprint":format!("{:x}", Sha256::digest(&bytes))}))
}
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "open" if params["source"].is_null() => ember_text_document::load(std::path::Path::new(
            params["path"].as_str().ok_or("Missing path")?,
        )),
        "open" => {
            if params["source"]["contract"] != "ember.text/1" {
                return Err("需要 ember.text/1 文本数据源".into());
            }
            Ok(Value::Null) // No file decoding: the view consumes the shared contract.
        }
        "save" => save(params),
        "settings" => ember_plugin_sdk::settings_applied(params),
        _ => Err(format!("Unknown editor method: {method}")),
    }
}
fn main() {
    ember_plugin_sdk::serve(handle);
}

#[cfg(test)]
mod tests {
    #[test]
    fn saves_text_above_the_old_limit_without_losing_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.txt");
        let original = vec![b'x'; 3 * 1024 * 1024];
        std::fs::write(&path, &original).unwrap();
        let mut value = ember_text_document::load(&path).unwrap();
        let changed = format!("{}updated", value["text"].as_str().unwrap());
        value["text"] = json!(changed);
        save(&json!({"path": path, "value": value})).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), changed.as_bytes());
    }
    #[test]
    fn utf16_non_ascii_content_is_measured_in_its_saved_encoding() {
        let text = "中".repeat(LIMIT / 2 - 1);
        let encoded = encode(&json!({"text": text, "encoding": "UTF-16LE"})).unwrap();
        assert_eq!(encoded.len(), LIMIT);
    }
    #[test]
    fn encoded_budget_includes_utf16_and_bom() {
        let value = json!({"text": "x".repeat(LIMIT / 2), "encoding": "UTF-16LE"});
        assert!(encode(&value).is_err());
    }

    use super::*;
    #[test]
    fn saves_matching_revision_and_refuses_external_changes_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        std::fs::write(&path, b"before\r\n").unwrap();
        let params = json!({"path":path,"value":{"text":"after\r\n","encoding":"UTF-8","bom":false,
            "fingerprint":format!("{:x}", Sha256::digest(b"before\r\n"))}});
        save(&params).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"after\r\n");
        std::fs::write(&path, b"external").unwrap();
        assert!(save(&params).unwrap_err().contains("外部修改"));
        assert_eq!(std::fs::read(&path).unwrap(), b"external");
    }
    #[cfg(windows)]
    #[test]
    fn failed_replacement_preserves_original_bytes() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        std::fs::write(&path, b"original").unwrap();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        let params = json!({"path":path,"value":{"text":"new","encoding":"UTF-8","bom":false,
            "fingerprint":format!("{:x}", Sha256::digest(b"original"))}});
        assert!(save(&params).unwrap_err().contains("保存替换失败"));
        drop(held);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        save(&params).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
    }
    #[test]
    fn standalone_editor_provides_its_own_text_source() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        std::fs::write(&path, "standalone").unwrap();
        let result = handle("open", &json!({"path":path,"source":null})).unwrap();
        assert_eq!(result["text"], "standalone");
        assert_eq!(result["editable"], true);
    }
    #[test]
    fn consumer_open_never_reads_or_decodes_the_file() {
        assert!(handle(
            "open",
            &json!({"path":"missing.txt","source":{"contract":"ember.text/1"}})
        )
        .is_ok());
    }
    #[test]
    fn preserves_utf16_endianness_and_bom() {
        assert_eq!(
            encode(&json!({"text":"A\r\n","encoding":"UTF-16LE"})).unwrap(),
            vec![255, 254, 65, 0, 13, 0, 10, 0]
        );
        assert_eq!(
            encode(&json!({"text":"A","encoding":"UTF-16BE"})).unwrap(),
            vec![254, 255, 0, 65]
        );
        assert_eq!(
            encode(&json!({"text":"A","encoding":"UTF-8","bom":true})).unwrap(),
            vec![239, 187, 191, 65]
        );
    }
}
