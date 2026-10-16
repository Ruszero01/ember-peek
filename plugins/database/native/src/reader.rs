//! Read-only SQLite reading: the facts about one database file, the shape of one object,
//! and one bounded page of rows at a time.
//!
//! Everything here opens the user's file with `SQLITE_OPEN_READ_ONLY`, so no statement this
//! module runs can write to it, create a journal beside it or leave a lock behind. Values
//! are bounded on their way out — a page is at most [`MAX_ROWS`] rows, a text cell at most
//! [`TEXT_LIMIT`] characters and a blob cell at most [`BLOB_LIMIT`] bytes — because the
//! preview draws a grid, not a copy of the database.
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

/// The 16 bytes every SQLite database file starts with. A file that does not carry them is
/// not read as one, whatever its extension says.
const HEADER: &[u8] = b"SQLite format 3\0";
/// Objects one open reports. A schema larger than this is listed only in part.
pub const MAX_OBJECTS: usize = 5000;
/// Rows one request may ask for, whatever it asked for. A page is drawn, not exported.
pub const MAX_ROWS: usize = 500;
/// Widest table the row grid draws. SQLite's own limit is 2000 columns; the preview stops
/// well before the statement that reads one page would outgrow the SQLite expression limits.
pub const MAX_COLUMNS: usize = 512;
/// Characters kept from one text cell.
const TEXT_LIMIT: usize = 4096;
/// Bytes kept from one blob cell.
const BLOB_LIMIT: usize = 64;
/// Rows counted before a table reports "more than this". Counting is a scan, so it stops.
const COUNT_LIMIT: i64 = 100_000;
/// How long a statement waits for another process's lock before reporting the file busy.
const BUSY_TIMEOUT: Duration = Duration::from_millis(3000);

/// One table or view, as the schema lists it. `kind` is SQLite's own `table`/`view`.
#[derive(Clone)]
pub struct Object {
    pub name: String,
    pub kind: String,
}

/// One column as `PRAGMA table_xinfo` describes it.
#[derive(Clone)]
struct Column {
    name: String,
    declared: Option<String>,
    not_null: bool,
    default: Option<String>,
    /// 1-based position inside the primary key, 0 when the column is not part of it.
    primary: i64,
    /// SQLite's own flag: 0 ordinary, 1 hidden by a virtual table, 2/3 generated.
    hidden: i64,
}

/// One open file: its schema, and one connection kept for the session's other requests.
pub struct Database {
    /// Every object the schema listed, in the order the list is shown: tables, then views.
    objects: Vec<Object>,
    /// Visible column names per object, filled on first use. The row statement is built from
    /// these, so a page never asks the schema again and never selects a hidden column.
    columns: Mutex<HashMap<String, Vec<String>>>,
    connection: Mutex<Option<Connection>>,
}

impl Database {
    /// Inspect a file and prepare it for reading.
    ///
    /// Returns the session state and the `open` result the view receives. A zero-length file
    /// is a valid empty database and is reported as one rather than refused.
    pub fn open(path: &Path) -> Result<(Self, Value), String> {
        let metadata =
            std::fs::metadata(path).map_err(|error| format!("database-unreadable:{error}"))?;
        if !metadata.is_file() {
            return Err("database-unreadable:not a regular file".into());
        }
        let size = metadata.len();
        let mut database = Self {
            objects: Vec::new(),
            columns: Mutex::new(HashMap::new()),
            connection: Mutex::new(None),
        };
        if size == 0 {
            return Ok((
                database,
                json!({
                    "format": "sqlite",
                    "library": rusqlite::version(),
                    "size": 0,
                    "empty": true,
                    "objects": [],
                    "objectCount": 0,
                }),
            ));
        }
        let header = ember_plugin_sdk::read_prefix(path, HEADER.len())
            .map_err(|error| format!("database-unreadable:{error}"))?;
        if header != HEADER {
            return Err("database-not-sqlite".into());
        }
        let connection = connect(path)?;
        let (objects, total) = list_objects(&connection)?;
        let facts = json!({
            "format": "sqlite",
            "library": rusqlite::version(),
            "size": size,
            "empty": false,
            "pageSize": pragma_int(&connection, "page_size"),
            "pageCount": pragma_int(&connection, "page_count"),
            "freelistPages": pragma_int(&connection, "freelist_count"),
            "encoding": pragma_text(&connection, "encoding"),
            "userVersion": pragma_int(&connection, "user_version"),
            "applicationId": pragma_int(&connection, "application_id"),
            "schemaVersion": pragma_int(&connection, "schema_version"),
            "objects": objects
                .iter()
                .map(|object| json!({"name": object.name, "kind": object.kind}))
                .collect::<Vec<_>>(),
            "objectCount": total,
        });
        database.objects = objects;
        *database.connection.lock().unwrap() = Some(connection);
        Ok((database, facts))
    }

    /// How one table or view is shaped: its columns, its indexes, its row count and the
    /// statement that created it.
    pub fn structure(&self, name: &str) -> Result<Value, String> {
        let kind = self.object_kind(name)?;
        let connection = self.connection.lock().unwrap();
        let connection = connection.as_ref().ok_or("database-object-missing")?;
        let columns = columns_of(connection, name)?;
        let sql: Option<String> = connection
            .query_row(
                "SELECT sql FROM sqlite_schema WHERE name = ?1 AND type IN ('table','view')",
                [name],
                |row| row.get(0),
            )
            .optional()
            .map_err(query_error)?
            .flatten();
        Ok(json!({
            "name": name,
            "kind": kind,
            "sql": sql,
            "columns": columns
                .iter()
                .filter(|column| column.hidden != 1)
                .map(column_json)
                .collect::<Vec<_>>(),
            "indexes": indexes_of(connection, name)?,
            // A view has no stored rows, so counting one would run its query for a number the
            // reader does not need; only a table reports a count.
            "rows": if kind == "table" {
                Some(row_count(connection, name, COUNT_LIMIT)?)
            } else {
                None
            },
        }))
    }

    /// One page of rows, in the order SQLite returns them, plus whether another page follows.
    pub fn rows(&self, name: &str, offset: i64, count: usize) -> Result<Value, String> {
        self.object_kind(name)?;
        let count = count.clamp(1, MAX_ROWS);
        let offset = offset.max(0);
        let columns = self.visible_columns(name)?;
        if columns.len() > MAX_COLUMNS {
            return Err(format!("database-too-wide:{}", columns.len()));
        }
        let connection = self.connection.lock().unwrap();
        let connection = connection.as_ref().ok_or("database-object-missing")?;
        // One source column becomes three result columns: the cell (cut down to the display
        // limit), its SQLite storage class, and the length it had before cutting. `typeof` is
        // evaluated per row, so a column declared TEXT that holds a number still reads right.
        let selection = columns
            .iter()
            .map(|column| {
                let quoted = quote(column);
                format!(
                    "CASE typeof({quoted}) WHEN 'text' THEN substr({quoted},1,{TEXT_LIMIT}) \
                     WHEN 'blob' THEN substr({quoted},1,{BLOB_LIMIT}) ELSE {quoted} END, \
                     typeof({quoted}), length({quoted})"
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        // One row beyond the page is asked for: it is the difference between "the table ends
        // here" and "there is more", which a view without a row count cannot answer otherwise.
        let sql = format!(
            "SELECT {selection} FROM {} LIMIT {} OFFSET {}",
            quote(name),
            count + 1,
            offset
        );
        let mut statement = connection.prepare(&sql).map_err(query_error)?;
        let mut result = statement.query([]).map_err(query_error)?;
        let mut page = Vec::with_capacity(count);
        let mut more = false;
        while let Some(row) = result.next().map_err(query_error)? {
            if page.len() == count {
                more = true;
                break;
            }
            let mut cells = Vec::with_capacity(columns.len());
            for index in 0..columns.len() {
                let class = row
                    .get_ref(index * 3 + 1)
                    .map_err(query_error)?
                    .as_str()
                    .unwrap_or("null")
                    .to_string();
                let total = row
                    .get_ref(index * 3 + 2)
                    .ok()
                    .and_then(|value| value.as_i64().ok());
                let cell = row.get_ref(index * 3).map_err(query_error)?;
                cells.push(encode_cell(&class, cell, total));
            }
            page.push(Value::Array(cells));
        }
        Ok(json!({
            "name": name,
            "offset": offset,
            "columns": columns,
            "rows": page,
            "hasMore": more,
        }))
    }

    /// The kind of an object the schema listed. A name the open did not report is refused
    /// here, so no request can make the reader name an identifier it has not seen.
    fn object_kind(&self, name: &str) -> Result<String, String> {
        self.objects
            .iter()
            .find(|object| object.name == name)
            .map(|object| object.kind.clone())
            .ok_or_else(|| "database-object-missing".to_string())
    }

    fn visible_columns(&self, name: &str) -> Result<Vec<String>, String> {
        let cached = self.columns.lock().unwrap().get(name).cloned();
        if let Some(columns) = cached {
            return Ok(columns);
        }
        let columns = {
            let connection = self.connection.lock().unwrap();
            let connection = connection.as_ref().ok_or("database-object-missing")?;
            columns_of(connection, name)?
                .into_iter()
                .filter(|column| column.hidden != 1)
                .map(|column| column.name)
                .collect::<Vec<_>>()
        };
        self.columns
            .lock()
            .unwrap()
            .insert(name.to_string(), columns.clone());
        Ok(columns)
    }
}

fn connect(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(open_error)?;
    connection.busy_timeout(BUSY_TIMEOUT).map_err(query_error)?;
    Ok(connection)
}

/// Every table and view the schema lists, tables first then views, each in name order.
/// Tables named `sqlite_*` are SQLite's own bookkeeping and are not part of the database's
/// contents. Returns the objects (up to [`MAX_OBJECTS`]) and how many there are in total.
fn list_objects(connection: &Connection) -> Result<(Vec<Object>, i64), String> {
    let total: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema \
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get(0),
        )
        .map_err(query_error)?;
    let mut statement = connection
        .prepare(
            "SELECT name, type FROM sqlite_schema \
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' \
             ORDER BY CASE type WHEN 'view' THEN 1 ELSE 0 END, name COLLATE NOCASE \
             LIMIT ?1",
        )
        .map_err(query_error)?;
    let objects = statement
        .query_map([MAX_OBJECTS as i64], |row| {
            Ok(Object {
                name: row.get(0)?,
                kind: row.get(1)?,
            })
        })
        .map_err(query_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(query_error)?;
    Ok((objects, total))
}

/// The objects a session holds, in the schema's own order.
fn columns_of(connection: &Connection, name: &str) -> Result<Vec<Column>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_xinfo({})", quote(name)))
        .map_err(query_error)?;
    let columns = statement
        .query_map([], |row| {
            Ok(Column {
                name: row.get(1)?,
                declared: row.get(2)?,
                not_null: row.get::<_, i64>(3)? != 0,
                default: row.get(4)?,
                primary: row.get(5)?,
                hidden: row.get(6)?,
            })
        })
        .map_err(query_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(query_error)?;
    Ok(columns)
}

fn column_json(column: &Column) -> Value {
    json!({
        "name": column.name,
        "type": column.declared,
        "notNull": column.not_null,
        "primaryKey": column.primary,
        "default": column.default,
        "generated": column.hidden == 2 || column.hidden == 3,
    })
}

fn indexes_of(connection: &Connection, name: &str) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA index_list({})", quote(name)))
        .map_err(query_error)?;
    let entries = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)? != 0,
            ))
        })
        .map_err(query_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(query_error)?;
    let mut indexes = Vec::with_capacity(entries.len());
    for (name, unique, origin, partial) in entries {
        indexes.push(json!({
            "name": name,
            "unique": unique,
            "origin": origin,
            "partial": partial,
            "columns": index_columns(connection, &name)?,
        }));
    }
    Ok(indexes)
}

/// The key columns of one index, in order. An expression key column has no name and is
/// reported as null; the view words it.
fn index_columns(connection: &Connection, index: &str) -> Result<Vec<Option<String>>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA index_xinfo({})", quote(index)))
        .map_err(query_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, Option<String>>(2)?, row.get::<_, i64>(5)?))
        })
        .map_err(query_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(query_error)?;
    Ok(rows
        .into_iter()
        .filter(|(_, key)| *key == 1)
        .map(|(name, _)| name)
        .collect())
}

/// Count rows without scanning a whole large table: counting stops at `limit`, and the reply
/// says whether the number is the real one.
fn row_count(connection: &Connection, name: &str, limit: i64) -> Result<Value, String> {
    let sql = format!(
        "SELECT COUNT(*) FROM (SELECT 1 FROM {} LIMIT {})",
        quote(name),
        limit + 1
    );
    let counted: i64 = connection
        .query_row(&sql, [], |row| row.get(0))
        .map_err(query_error)?;
    Ok(json!({"value": counted.min(limit), "exact": counted <= limit}))
}

fn pragma_int(connection: &Connection, name: &str) -> Option<i64> {
    connection
        .query_row(&format!("PRAGMA {name}"), [], |row| row.get::<_, i64>(0))
        .optional()
        .ok()
        .flatten()
}

fn pragma_text(connection: &Connection, name: &str) -> Option<String> {
    connection
        .query_row(&format!("PRAGMA {name}"), [], |row| row.get::<_, String>(0))
        .optional()
        .ok()
        .flatten()
}

/// One cell as the grid draws it: null, or an object naming the storage class and carrying
/// the text to show.
fn encode_cell(class: &str, value: ValueRef<'_>, total: Option<i64>) -> Value {
    match class {
        "integer" => json!({"kind": "integer", "text": integer_text(value)}),
        "real" => json!({"kind": "real", "text": real_text(value)}),
        "text" => {
            let raw = match value {
                ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).into_owned(),
                _ => String::new(),
            };
            let mut cell = Map::new();
            cell.insert("kind".into(), json!("text"));
            cell.insert("text".into(), json!(sanitize(&raw)));
            if let Some(total) = total.filter(|total| *total > TEXT_LIMIT as i64) {
                cell.insert("truncated".into(), json!(true));
                cell.insert("characters".into(), json!(total));
            }
            Value::Object(cell)
        }
        "blob" => {
            let bytes = value.as_blob().unwrap_or_default();
            let kept = bytes.len().min(BLOB_LIMIT);
            let mut hex = String::with_capacity(kept * 2);
            for byte in &bytes[..kept] {
                let _ = write!(hex, "{byte:02x}");
            }
            let total = total.unwrap_or(bytes.len() as i64);
            json!({
                "kind": "blob",
                "hex": hex,
                "bytes": total,
                "truncated": total > BLOB_LIMIT as i64,
            })
        }
        _ => Value::Null,
    }
}

fn integer_text(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Integer(number) => number.to_string(),
        _ => String::new(),
    }
}

fn real_text(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Real(number) => format_real(number),
        _ => String::new(),
    }
}

/// A REAL as text. Values that print as a long run of digits fall back to exponent form, so
/// one cell never turns into a wall of zeros.
fn format_real(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value.is_infinite() {
        return if value > 0.0 {
            "Inf".into()
        } else {
            "-Inf".into()
        };
    }
    let magnitude = value.abs();
    if magnitude != 0.0 && !(1e-4..1e15).contains(&magnitude) {
        format!("{value:e}")
    } else {
        format!("{value}")
    }
}

/// Replace control characters that would otherwise be invisible in the grid. Tabs and line
/// breaks are kept: they are part of the value and the grid renders them as whitespace.
fn sanitize(text: &str) -> String {
    if !text.chars().any(is_control) {
        return text.to_string();
    }
    text.chars()
        .map(|character| {
            if is_control(character) {
                '\u{fffd}'
            } else {
                character
            }
        })
        .collect()
}

fn is_control(character: char) -> bool {
    matches!(character, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}')
}

/// A SQL identifier, quoted the way SQLite quotes one.
fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn detail(error: &rusqlite::Error) -> String {
    error.to_string().chars().take(200).collect()
}

fn open_error(error: rusqlite::Error) -> String {
    match &error {
        rusqlite::Error::SqliteFailure(code, _) => match code.code {
            rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked => {
                "database-locked".into()
            }
            rusqlite::ErrorCode::NotADatabase => "database-not-sqlite".into(),
            rusqlite::ErrorCode::PermissionDenied | rusqlite::ErrorCode::ReadOnly => {
                "database-unreadable".into()
            }
            _ => format!("database-open-failed:{}", detail(&error)),
        },
        _ => format!("database-open-failed:{}", detail(&error)),
    }
}

fn query_error(error: rusqlite::Error) -> String {
    match &error {
        rusqlite::Error::SqliteFailure(code, _) => match code.code {
            rusqlite::ErrorCode::NotADatabase | rusqlite::ErrorCode::DatabaseCorrupt => {
                "database-corrupt".into()
            }
            rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked => {
                "database-locked".into()
            }
            _ => format!("database-query-failed:{}", detail(&error)),
        },
        _ => format!("database-query-failed:{}", detail(&error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A database exercising one of everything the grid has to draw: a primary key, a default,
    /// a not-null column, an index, a view, a quoted identifier, and each storage class.
    fn sample() -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.db");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email TEXT NOT NULL DEFAULT 'none',
                    score REAL,
                    data BLOB,
                    note TEXT
                );
                CREATE INDEX users_email ON users (email);
                CREATE VIEW top_users AS SELECT id, email FROM users WHERE score > 1;
                CREATE TABLE "we""ird" ("a""b" TEXT);
                INSERT INTO "we""ird" VALUES ('quoted');
                INSERT INTO users (id, email, score, data, note) VALUES
                    (1, 'a@example.com', 1.5, x'1f8b', 'plain'),
                    (2, 'b@example.com', 2, NULL, NULL),
                    (3, 'c@example.com', NULL, x'00ff', 'tab' || char(9) || 'and' || char(10) || 'newline'),
                    (4, 'd@example.com', 1e300, x'01', NULL);
                "#,
            )
            .unwrap();
        drop(connection);
        (directory, path)
    }

    fn open_sample() -> (tempfile::TempDir, PathBuf, Database, Value) {
        let (directory, path) = sample();
        let (database, facts) = Database::open(&path).unwrap();
        (directory, path, database, facts)
    }

    #[test]
    fn reports_the_file_facts_and_lists_tables_before_views() {
        let (_directory, _path, _database, facts) = open_sample();
        assert_eq!(facts["format"], "sqlite");
        assert_eq!(facts["empty"], false);
        assert!(facts["pageSize"].as_i64().unwrap() > 0);
        assert!(facts["pageCount"].as_i64().unwrap() > 0);
        assert_eq!(facts["encoding"], "UTF-8");
        assert_eq!(facts["objectCount"], 3);
        let names = facts["objects"]
            .as_array()
            .unwrap()
            .iter()
            .map(|object| object["name"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(names, ["users", "we\"ird", "top_users"]);
        assert_eq!(facts["objects"][2]["kind"], "view");
    }

    #[test]
    fn reports_a_zero_length_file_as_an_empty_database() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("empty.db");
        std::fs::write(&path, b"").unwrap();
        let (database, facts) = Database::open(&path).unwrap();
        assert_eq!(facts["empty"], true);
        assert_eq!(facts["objects"].as_array().unwrap().len(), 0);
        assert_eq!(facts["objectCount"], 0);
        assert!(database.structure("users").is_err());
    }

    #[test]
    fn refuses_a_file_that_is_not_a_sqlite_database() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fake.db");
        std::fs::write(&path, b"this is not a database at all, it is prose").unwrap();
        assert_eq!(Database::open(&path).err().unwrap(), "database-not-sqlite");
        assert!(Database::open(&directory.path().join("missing.db"))
            .err()
            .unwrap()
            .starts_with("database-unreadable"));
        assert!(Database::open(directory.path())
            .err()
            .unwrap()
            .starts_with("database-unreadable"));
    }

    #[test]
    fn describes_columns_indexes_and_the_statement_that_created_the_object() {
        let (_directory, _path, database, _facts) = open_sample();
        let structure = database.structure("users").unwrap();
        assert_eq!(structure["kind"], "table");
        assert!(structure["sql"]
            .as_str()
            .unwrap()
            .starts_with("CREATE TABLE users"));
        let columns = structure["columns"].as_array().unwrap();
        assert_eq!(columns.len(), 5);
        assert_eq!(columns[0]["name"], "id");
        assert_eq!(columns[0]["primaryKey"], 1);
        assert_eq!(columns[0]["notNull"], false);
        assert_eq!(columns[1]["name"], "email");
        assert_eq!(columns[1]["notNull"], true);
        assert_eq!(columns[1]["default"], "'none'");
        assert_eq!(columns[1]["generated"], false);
        assert_eq!(structure["rows"], json!({"value": 4, "exact": true}));
        let indexes = structure["indexes"].as_array().unwrap();
        assert_eq!(indexes.len(), 1);
        assert_eq!(indexes[0]["name"], "users_email");
        assert_eq!(indexes[0]["unique"], false);
        assert_eq!(indexes[0]["columns"], json!(["email"]));
        // A view carries no stored rows, so it reports no count at all.
        let view = database.structure("top_users").unwrap();
        assert_eq!(view["kind"], "view");
        assert_eq!(view["columns"].as_array().unwrap().len(), 2);
        assert_eq!(view["rows"], Value::Null);
    }

    #[test]
    fn a_name_the_open_did_not_list_is_refused() {
        let (_directory, _path, database, _facts) = open_sample();
        assert_eq!(
            database.structure("sqlite_master").unwrap_err(),
            "database-object-missing"
        );
        assert_eq!(
            database.rows("nope", 0, 10).unwrap_err(),
            "database-object-missing"
        );
        assert_eq!(
            database
                .rows("users\"; DROP TABLE users; --", 0, 10)
                .unwrap_err(),
            "database-object-missing"
        );
        // The database is untouched by the attempt.
        assert_eq!(database.structure("users").unwrap()["rows"]["value"], 4);
    }

    #[test]
    fn a_page_carries_each_storage_class_with_its_display_form() {
        let (_directory, _path, database, _facts) = open_sample();
        let page = database.rows("users", 0, 2).unwrap();
        assert_eq!(
            page["columns"],
            json!(["id", "email", "score", "data", "note"])
        );
        assert_eq!(page["offset"], 0);
        assert_eq!(page["hasMore"], true);
        let rows = page["rows"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0][0], json!({"kind": "integer", "text": "1"}));
        assert_eq!(rows[0][1], json!({"kind": "text", "text": "a@example.com"}));
        assert_eq!(rows[0][2], json!({"kind": "real", "text": "1.5"}));
        assert_eq!(
            rows[0][3],
            json!({"kind": "blob", "hex": "1f8b", "bytes": 2, "truncated": false})
        );
        assert_eq!(rows[1][4], Value::Null);
        // Tabs and line breaks survive; other control characters are replaced.
        let third = database.rows("users", 2, 1).unwrap();
        assert_eq!(third["rows"][0][4]["text"], "tab\tand\nnewline");
        assert_eq!(third["hasMore"], true);
        // The last page reports the end rather than promising another one.
        let last = database.rows("users", 3, 2).unwrap();
        assert_eq!(last["rows"].as_array().unwrap().len(), 1);
        assert_eq!(last["hasMore"], false);
        assert_eq!(last["rows"][0][2]["text"], "1e300");
        let beyond = database.rows("users", 99, 2).unwrap();
        assert_eq!(beyond["rows"].as_array().unwrap().len(), 0);
        assert_eq!(beyond["hasMore"], false);
    }

    #[test]
    fn a_page_asks_for_one_row_more_than_it_draws_and_never_for_more_than_the_cap() {
        let (_directory, _path, database, _facts) = open_sample();
        assert_eq!(
            database.rows("users", 0, 0).unwrap()["rows"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let page = database.rows("users", 0, MAX_ROWS).unwrap();
        assert_eq!(page["rows"].as_array().unwrap().len(), 4);
        assert_eq!(page["hasMore"], false);
        assert_eq!(database.rows("users", -5, 1).unwrap()["offset"], 0);
    }

    #[test]
    fn long_cells_are_cut_to_the_display_limit_and_say_how_long_they_were() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("wide.db");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch("CREATE TABLE cells (text_value TEXT, blob_value BLOB);")
            .unwrap();
        connection
            .execute(
                "INSERT INTO cells VALUES (?1, ?2)",
                rusqlite::params!["x".repeat(TEXT_LIMIT + 5), vec![7u8; BLOB_LIMIT + 3]],
            )
            .unwrap();
        drop(connection);
        let (database, _facts) = Database::open(&path).unwrap();
        let page = database.rows("cells", 0, 1).unwrap();
        let cell = &page["rows"][0][0];
        assert_eq!(cell["kind"], "text");
        assert_eq!(cell["text"].as_str().unwrap().chars().count(), TEXT_LIMIT);
        assert_eq!(cell["truncated"], true);
        assert_eq!(cell["characters"], TEXT_LIMIT as i64 + 5);
        let blob = &page["rows"][0][1];
        assert_eq!(blob["kind"], "blob");
        assert_eq!(blob["hex"].as_str().unwrap().len(), BLOB_LIMIT * 2);
        assert_eq!(blob["bytes"], BLOB_LIMIT as i64 + 3);
        assert_eq!(blob["truncated"], true);
    }

    #[test]
    fn columns_that_are_hidden_or_wide_are_handled_explicitly() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("wide.db");
        let connection = Connection::open(&path).unwrap();
        let columns = (0..MAX_COLUMNS + 1)
            .map(|index| format!("\"c{index}\""))
            .collect::<Vec<_>>()
            .join(",");
        connection
            .execute_batch(&format!("CREATE TABLE wide ({columns});"))
            .unwrap();
        connection
            .execute_batch("CREATE TABLE generated (a INTEGER, b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL);")
            .unwrap();
        connection
            .execute_batch("INSERT INTO generated (a) VALUES (3);")
            .unwrap();
        drop(connection);
        let (database, _facts) = Database::open(&path).unwrap();
        assert_eq!(
            database.rows("wide", 0, 1).unwrap_err(),
            format!("database-too-wide:{}", MAX_COLUMNS + 1)
        );
        // A generated column is part of the row the grid draws and is marked as generated.
        let page = database.rows("generated", 0, 1).unwrap();
        assert_eq!(page["rows"][0].as_array().unwrap().len(), 2);
        let structure = database.structure("generated").unwrap();
        assert_eq!(structure["columns"][1]["generated"], true);
    }

    #[test]
    fn a_count_stops_at_its_limit_and_says_so() {
        let (_directory, _path, database, _facts) = open_sample();
        let connection = database.connection.lock().unwrap();
        let connection = connection.as_ref().unwrap();
        assert_eq!(
            row_count(connection, "users", 4).unwrap(),
            json!({"value": 4, "exact": true})
        );
        assert_eq!(
            row_count(connection, "users", 3).unwrap(),
            json!({"value": 3, "exact": false})
        );
    }

    #[test]
    fn quoted_identifiers_round_trip_through_every_statement() {
        let (_directory, _path, database, _facts) = open_sample();
        let structure = database.structure("we\"ird").unwrap();
        assert_eq!(structure["columns"][0]["name"], "a\"b");
        let page = database.rows("we\"ird", 0, 5).unwrap();
        assert_eq!(page["columns"], json!(["a\"b"]));
        assert_eq!(page["rows"][0][0]["text"], "quoted");
    }

    #[test]
    fn real_values_print_compactly() {
        assert_eq!(format_real(1.5), "1.5");
        assert_eq!(format_real(-0.0), "-0");
        assert_eq!(format_real(1e300), "1e300");
        assert_eq!(format_real(1e-9), "1e-9");
        assert_eq!(format_real(f64::INFINITY), "Inf");
        assert_eq!(format_real(f64::NAN), "NaN");
    }

    #[test]
    fn control_characters_are_replaced_but_whitespace_is_not() {
        assert_eq!(sanitize("keep\tthese\nlines\r"), "keep\tthese\nlines\r");
        assert_eq!(sanitize("a\u{0}b\u{7f}c"), "a\u{fffd}b\u{fffd}c");
    }
}
