use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Seek, SeekFrom, Write};
const LIMIT: usize = 2 * 1024 * 1024;

fn encode(value: &Value) -> Result<Vec<u8>, String> {
    let text = value["text"].as_str().ok_or("Missing text")?;
    if text.len() > LIMIT {
        return Err("编辑内容超过 2 MiB 限制".into());
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
        return Err("编码后的文件超过 2 MiB 限制".into());
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
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0); // Exclusive handle: conflict check and write are one protected operation.
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
    let write = |file: &mut std::fs::File, data: &[u8]| -> std::io::Result<()> {
        file.seek(SeekFrom::Start(0))?;
        file.write_all(data)?;
        file.set_len(data.len() as u64)?;
        file.sync_all()
    };
    if let Err(error) = write(&mut file, &bytes) {
        return match write(&mut file, &original) {
            Ok(()) => Err(format!("保存失败，已恢复原内容：{error}")),
            Err(restore) => Err(format!(
                "保存失败：{error}；恢复失败：{restore}。请保留当前草稿。"
            )),
        };
    }
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
