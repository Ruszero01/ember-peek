use serde_json::{json, Value};
use std::io::Read;

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "settings" => ember_plugin_sdk::settings_applied(params),
        "open" => {
            let path = params["path"].as_str().ok_or("Missing file path")?;
            let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
            let size = file.metadata().map_err(|error| error.to_string())?.len();
            let mut header = [0; 1024];
            let length = file.read(&mut header).map_err(|error| error.to_string())?;
            if !header[..length].windows(5).any(|bytes| bytes == b"%PDF-") {
                return Err("Invalid PDF header".into());
            }
            Ok(json!({"size": size}))
        }
        _ => Err(format!("Unknown PDF method: {method}")),
    }
}

fn main() {
    ember_plugin_sdk::serve(handle);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_headers_without_loading_the_document() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.pdf");
        std::fs::write(&path, b"prefix\n%PDF-1.7\n").unwrap();
        let file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.set_len(256 * 1024 * 1024).unwrap();
        assert_eq!(
            handle("open", &json!({"path": path})).unwrap()["size"],
            256 * 1024 * 1024u64
        );
        drop(file);
        std::fs::write(&path, b"not a PDF").unwrap();
        assert!(handle("open", &json!({"path": path})).is_err());
        assert!(handle("open", &json!({})).is_err());
    }
}
