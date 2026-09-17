use serde_json::{json, Value};
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "open" => {
            let path = std::path::Path::new(params["path"].as_str().ok_or("Missing path")?);
            let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
            Ok(
                json!({"bytes":meta.len(),"extension":path.extension().and_then(|s| s.to_str()).unwrap_or(""),"readOnly":meta.permissions().readonly()}),
            )
        }
        "settings" => ember_plugin_sdk::settings_applied(params),
        _ => Err("Unknown metadata method".into()),
    }
}
fn main() {
    ember_plugin_sdk::serve(handle);
}
