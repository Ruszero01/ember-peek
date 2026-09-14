use crate::manifest::{contained, Package};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
};

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;
const MAX_MESSAGE: usize = 8 * 1024 * 1024;

struct Connection {
    child: Child,
    input: ChildStdin,
    pending: Pending,
    closed: Arc<AtomicBool>,
}

pub struct Worker {
    package: Package,
    connection: Mutex<Option<Connection>>,
    sequence: AtomicU64,
}

impl Worker {
    pub fn new(package: Package) -> Self {
        Self {
            package,
            connection: Mutex::new(None),
            sequence: AtomicU64::new(1),
        }
    }

    async fn connect(&self) -> Result<Connection, String> {
        let executable = contained(&self.package.directory, &self.package.manifest.executable)?;
        let mut command = Command::new(executable);
        command
            .current_dir(&self.package.directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|e| format!("Start plugin: {e}"))?;
        let input = child.stdin.take().ok_or("Plugin stdin unavailable")?;
        let output = child.stdout.take().ok_or("Plugin stdout unavailable")?;
        let pending: Pending = Arc::default();
        let requests = pending.clone();
        let closed = Arc::new(AtomicBool::new(false));
        let reader_closed = closed.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(output);
            let mut line = Vec::new();
            let error = loop {
                // fill_buf bounds allocation even if a broken plugin never writes a newline.
                let bytes = match reader.fill_buf().await {
                    Ok([]) => break "Plugin process exited".to_string(),
                    Ok(bytes) => bytes,
                    Err(e) => break format!("Plugin read failed: {e}"),
                };
                let end = bytes.iter().position(|b| *b == b'\n');
                let count = end.map_or(bytes.len(), |n| n + 1);
                if line.len() + count > MAX_MESSAGE {
                    break "Plugin response exceeds 8 MiB".into();
                }
                line.extend_from_slice(&bytes[..count]);
                reader.consume(count);
                if end.is_none() {
                    continue;
                }
                let reply: Value = match serde_json::from_slice(&line) {
                    Ok(value) => value,
                    Err(e) => break format!("Invalid plugin response: {e}"),
                };
                line.clear();
                let Some(id) = reply["id"].as_u64() else {
                    break "Plugin response has no request id".into();
                };
                if let Some(sender) = requests.lock().await.remove(&id) {
                    let result = if let Some(error) = reply.get("error") {
                        Err(error.to_string())
                    } else {
                        Ok(reply["result"].clone())
                    };
                    let _ = sender.send(result);
                }
            };
            reader_closed.store(true, Ordering::Release);
            for (_, sender) in requests.lock().await.drain() {
                let _ = sender.send(Err(error.clone()));
            }
        });
        Ok(Connection {
            child,
            input,
            pending,
            closed,
        })
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        self.call_inner(method, params, true).await
    }

    pub async fn release(&self, params: Value) -> Result<Value, String> {
        self.call_inner("release", params, false).await
    }

    async fn call_inner(&self, method: &str, params: Value, start: bool) -> Result<Value, String> {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed);
        let mut bytes = serde_json::to_vec(&json!({"id":id,"method":method,"params":params}))
            .map_err(|e| e.to_string())?;
        if bytes.len() > MAX_MESSAGE {
            return Err("Plugin request exceeds 8 MiB".into());
        }
        bytes.push(b'\n');
        let (sender, receiver) = oneshot::channel();
        let pending;
        {
            let mut slot = self.connection.lock().await;
            if let Some(connection) = slot.as_mut() {
                if connection.closed.load(Ordering::Acquire)
                    || connection
                        .child
                        .try_wait()
                        .map_err(|e| e.to_string())?
                        .is_some()
                {
                    *slot = None;
                }
            }
            if slot.is_none() {
                if !start {
                    return Ok(Value::Null);
                }
                *slot = Some(self.connect().await?);
            }
            let connection = slot.as_mut().unwrap();
            pending = connection.pending.clone();
            {
                let mut requests = pending.lock().await;
                // Synchronize registration with the reader's terminal drain. A process
                // can exit between connection selection and request registration.
                if connection.closed.load(Ordering::Acquire) {
                    return Err("Plugin response pipe closed before request".into());
                }
                requests.insert(id, sender);
            }
            let write =
                tokio::time::timeout(Duration::from_secs(5), connection.input.write_all(&bytes))
                    .await;
            if !matches!(write, Ok(Ok(()))) {
                pending.lock().await.remove(&id);
                *slot = None;
                return Err("Plugin request pipe failed or timed out".into());
            }
        }
        match tokio::time::timeout(Duration::from_secs(120), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Plugin response channel closed".into()),
            Err(_) => {
                pending.lock().await.remove(&id);
                self.stop().await;
                Err("Plugin operation exceeded 120 seconds".into())
            }
        }
    }

    pub async fn pid(&self) -> Option<u32> {
        let mut slot = self.connection.lock().await;
        let connection = slot.as_mut()?;
        if connection.child.try_wait().ok().flatten().is_some() {
            return None;
        }
        connection.child.id()
    }

    pub async fn stop(&self) {
        if let Some(mut connection) = self.connection.lock().await.take() {
            let _ = connection.child.kill().await;
            let _ = connection.child.wait().await;
            for (_, sender) in connection.pending.lock().await.drain() {
                let _ = sender.send(Err("Plugin process stopped".into()));
            }
        }
    }
}
