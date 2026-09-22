// Stateless, read-only bridge reused by workshop-generated web viewers.
// No generated native code or build scripts are executed.
fn main() {
    ember_plugin_sdk::serve(|method, params| match method {
        "open" => Ok(serde_json::json!({})),
        "settings" => ember_plugin_sdk::settings_applied(params),
        _ => Err("Unsupported bridge method".into()),
    });
}
