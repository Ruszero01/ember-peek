use serde_json::Value;
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "open" if !params["source"].is_null() => Ok(Value::Null),
        "open" => ember_text_document::load(std::path::Path::new(
            params["path"].as_str().ok_or("Missing path")?,
        )),
        "settings" => ember_plugin_sdk::settings_applied(params),
        _ => Err(format!("Unknown text method: {method}")),
    }
}
fn main() {
    ember_plugin_sdk::serve(handle);
}
