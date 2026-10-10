use serde_json::Value;
fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "settings" => ember_plugin_sdk::settings_applied(params),
        "open" => {
            let path = params["path"].as_str().ok_or("Missing file path")?;
            ember_office_document::inspect(
                std::path::Path::new(path),
                ember_office_document::Kind::Spreadsheet,
            )
        }
        _ => Err(format!("Unknown excel method: {method}")),
    }
}
fn main() {
    ember_plugin_sdk::serve(handle);
}
