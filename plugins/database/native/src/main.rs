//! Read-only SQLite preview: one connection per open session, a schema and bounded pages of
//! rows. Nothing this plugin sends can change the file it is looking at.
mod reader;

use reader::Database;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

type Sessions = HashMap<String, Arc<Database>>;
static SESSIONS: OnceLock<Mutex<Sessions>> = OnceLock::new();

fn sessions() -> &'static Mutex<Sessions> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The database a request names. The session is cloned out of the table before any query
/// runs, so a slow read never holds up another file.
fn session(params: &Value) -> Result<Arc<Database>, String> {
    let id = params["session"].as_str().ok_or("Missing session")?;
    sessions()
        .lock()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or_else(|| "database-session-expired".to_string())
}

fn handle(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "settings" => ember_plugin_sdk::settings_applied(params),
        "open" => {
            let path = params["path"].as_str().ok_or("Missing file path")?;
            let id = params["session"].as_str().ok_or("Missing session")?;
            let (database, facts) = Database::open(Path::new(path))?;
            // Re-opening a session replaces whatever the previous open left behind.
            sessions()
                .lock()
                .unwrap()
                .insert(id.to_string(), Arc::new(database));
            Ok(facts)
        }
        "structure" => {
            let request = &params["value"];
            let name = request["name"].as_str().ok_or("Missing object name")?;
            session(params)?.structure(name)
        }
        "rows" => {
            let request = &params["value"];
            let name = request["name"].as_str().ok_or("Missing object name")?;
            let offset = request["offset"].as_i64().unwrap_or(0);
            let count = request["count"].as_u64().unwrap_or(200) as usize;
            session(params)?.rows(name, offset, count)
        }
        _ => Err(format!("Unknown database method: {method}")),
    }
}

fn release(params: &Value) -> Result<Value, String> {
    if let Some(id) = params["session"].as_str() {
        sessions().lock().unwrap().remove(id);
    }
    Ok(Value::Null)
}

fn main() {
    ember_plugin_sdk::serve_with_release(handle, release);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> (tempfile::TempDir, String) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.db");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);")
            .unwrap();
        drop(connection);
        let path = path.to_string_lossy().into_owned();
        (directory, path)
    }

    #[test]
    fn a_session_is_opened_asked_and_released() {
        let (_directory, path) = sample();
        let open = json!({"session": "s1", "path": path});
        let facts = handle("open", &open).unwrap();
        assert_eq!(facts["objectCount"], 1);
        assert_eq!(facts["objects"][0]["name"], "users");
        let structure = handle(
            "structure",
            &json!({"session": "s1", "value": {"name": "users"}}),
        )
        .unwrap();
        assert_eq!(structure["columns"][0]["name"], "id");
        let page = handle(
            "rows",
            &json!({"session": "s1", "value": {"name": "users", "offset": 0, "count": 10}}),
        )
        .unwrap();
        assert_eq!(page["columns"], json!(["id", "email"]));
        assert_eq!(page["rows"].as_array().unwrap().len(), 0);
        assert_eq!(release(&json!({"session": "s1"})).unwrap(), Value::Null);
        assert_eq!(
            handle(
                "rows",
                &json!({"session": "s1", "value": {"name": "users"}})
            )
            .unwrap_err(),
            "database-session-expired"
        );
        // Reopening the same session id leaves exactly one entry behind.
        handle("open", &open).unwrap();
        assert_eq!(sessions().lock().unwrap().len(), 1);
        release(&json!({"session": "s1"})).unwrap();
        assert_eq!(sessions().lock().unwrap().len(), 0);
    }

    #[test]
    fn requests_without_the_fields_they_need_are_refused() {
        assert!(handle("open", &json!({"session": "s2"})).is_err());
        assert!(handle("open", &json!({"path": "x.db"})).is_err());
        assert!(handle("structure", &json!({"session": "s2"})).is_err());
        assert!(handle("rows", &json!({"session": "s2"})).is_err());
        // The payload of a custom method arrives under `value`, not beside the session.
        assert_eq!(
            handle("structure", &json!({"session": "s2", "name": "users"})).unwrap_err(),
            "Missing object name"
        );
        assert!(handle("page", &json!({})).is_err());
    }

    #[test]
    fn the_pages_and_the_native_side_agree_on_the_settings_reply() {
        assert_eq!(
            handle("settings", &json!({"settings": {"showList": false}})).unwrap(),
            json!({"showList": false})
        );
    }
}
