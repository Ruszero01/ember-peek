use serde_json::{json, Value};

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
    if size > 32 * 1024 * 1024 {
        return Err("图片插件原型支持不超过 32 MiB 的图片".into());
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
    Ok(json!({"mime":mime,"size":size}))
}

fn main() {
    ember_plugin_sdk::serve(handle);
}
