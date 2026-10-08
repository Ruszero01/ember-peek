use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
static PARSES: AtomicUsize = AtomicUsize::new(0);
use std::{
    io::{BufRead, Write},
    sync::{Arc, Mutex},
    time::Duration,
};

fn main() {
    let output = Arc::new(Mutex::new(std::io::stdout()));
    for line in std::io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let output = output.clone();
        std::thread::spawn(move || {
            if request["method"] == "crash" {
                std::process::exit(7);
            }
            if request["method"] == "open" && request["params"]["source"].is_null() {
                PARSES.fetch_add(1, Ordering::Relaxed);
                let path = request["params"]["path"].as_str().unwrap();
                let text = std::fs::read_to_string(path).unwrap();
                if text == "slow" {
                    std::thread::sleep(Duration::from_millis(700));
                }
                if text == "held" {
                    let release = std::path::Path::new(path).with_extension("go");
                    let deadline = std::time::Instant::now() + Duration::from_secs(5);
                    while !release.exists() && std::time::Instant::now() < deadline {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
                if text == "broken" {
                    writeln!(
                        output.lock().unwrap(),
                        "{}",
                        json!({"id":request["id"],"error":"unsupported document"})
                    )
                    .unwrap();
                    return;
                }
            }
            writeln!(output.lock().unwrap(), "{}", json!({"id":request["id"],"result":{"pid":std::process::id(),"parseCount":PARSES.load(Ordering::Relaxed),"echo":request["params"]}})).unwrap();
        });
    }
}
