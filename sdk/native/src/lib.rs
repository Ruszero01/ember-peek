//! Optional JSON-lines transport. Plugins may implement this wire protocol in any language.
use serde::Deserialize;
use serde_json::json;
pub use serde_json::Value;
use std::{
    io::{self, BufRead, Write},
    sync::{Arc, Mutex},
};

#[derive(Deserialize)]
pub struct Request {
    pub id: u64,
    pub method: String,
    pub params: Value,
}

/// Values of the settings this plugin declared in `plugin.json`.
///
/// Every request carries `params.settings`, already resolved against the declared
/// defaults by the host, so a plugin never has to track its own defaults.
pub fn settings(params: &Value) -> Value {
    params
        .get("settings")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()))
}

/// One setting by key, falling back to `fallback` when it is absent.
pub fn setting(params: &Value, key: &str, fallback: Value) -> Value {
    params
        .get("settings")
        .and_then(|settings| settings.get(key))
        .cloned()
        .unwrap_or(fallback)
}

/// Standard reply for the host's `settings` notification. Returning `Ok` accepts the
/// change; return `Err` to report why the plugin cannot honour it. The host keeps the
/// stored value either way and re-sends it on the next `open`.
pub fn settings_applied(params: &Value) -> Result<Value, String> {
    Ok(settings(params))
}

pub fn serve(handler: fn(&str, &Value) -> Result<Value, String>) {
    serve_with_release(handler, |_| Ok(Value::Null));
}

pub fn serve_with_release(
    handler: fn(&str, &Value) -> Result<Value, String>,
    release: fn(&Value) -> Result<Value, String>,
) {
    let output = Arc::new(Mutex::new(io::stdout()));
    // Bounded parallelism: a slow parse does not hold up another open or an interaction.
    let (send, receive) = std::sync::mpsc::sync_channel::<Request>(16);
    let receive = Arc::new(Mutex::new(receive));
    for _ in 0..4 {
        let receive = receive.clone();
        let output = output.clone();
        std::thread::spawn(move || loop {
            let Ok(request) = receive.lock().unwrap().recv() else {
                break;
            };
            let result = std::panic::catch_unwind(|| {
                if request.method == "release" {
                    release(&request.params)
                } else {
                    handler(&request.method, &request.params)
                }
            })
            .unwrap_or_else(|_| Err("Plugin operation panicked".into()));
            let reply = match result {
                Ok(value) => json!({"id":request.id,"result":value}),
                Err(error) => json!({"id":request.id,"error":error}),
            };
            let mut output = output.lock().unwrap();
            if serde_json::to_writer(&mut *output, &reply).is_err()
                || output.write_all(b"\n").is_err()
                || output.flush().is_err()
            {
                break;
            }
        });
    }
    let mut input = io::stdin().lock();
    let mut line = Vec::new();
    while let Ok(bytes) = input.fill_buf() {
        if bytes.is_empty() {
            break;
        }
        let end = bytes.iter().position(|b| *b == b'\n');
        let count = end.map_or(bytes.len(), |n| n + 1);
        if line.len() + count > 8 * 1024 * 1024 {
            break;
        }
        line.extend_from_slice(&bytes[..count]);
        input.consume(count);
        if end.is_none() {
            continue;
        }
        let Ok(request) = serde_json::from_slice(&line) else {
            break;
        };
        line.clear();
        if send.send(request).is_err() {
            break;
        }
    }
}
