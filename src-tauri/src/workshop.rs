//! Persistent workshop tasks. Generated code only runs in the preview iframe;
//! this service never executes model-supplied shell commands or native programs.
use ember_runtime::{manifest::Package, Runtime};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct DevelopmentKit {
    api: u32,
    prompt: String,
    analysis_prompt: String,
    /// Declared by packages built before the workshop pulled libraries from a registry
    /// instead of shipping a fixed set. Accepted so such a package still starts, and
    /// ignored: libraries now arrive through `add_dependency`, which records where they
    /// came from. See `docs/specs/plugin-workshop-v1.md`.
    #[serde(default)]
    #[allow(dead_code)]
    assets: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    modules: HashMap<String, String>,
}
fn kit(tool: &Package) -> Result<(DevelopmentKit, String), String> {
    let path = ember_runtime::manifest::contained(&tool.directory, "ui/development-kit.json")?;
    let kit: DevelopmentKit =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if kit.api != 1 {
        return Err("Invalid development kit".into());
    }
    // An incomplete package would otherwise fail in the middle of a build, after the
    // model had already been paid for, so it is refused when the task starts.
    for asset in [&kit.prompt, &kit.analysis_prompt] {
        let path = format!("ui/{asset}");
        ember_runtime::manifest::contained(&tool.directory, &path)
            .map_err(|_| format!("插件包缺少开发包文件 {path}，请重新安装或更新插件工坊"))?;
    }
    let prompt = std::fs::read_to_string(ember_runtime::manifest::contained(
        &tool.directory,
        &format!("ui/{}", kit.prompt),
    )?)
    .map_err(|e| e.to_string())?;
    if prompt.len() > 32000 {
        return Err("Agent instructions exceed 32 KiB".into());
    }
    Ok((kit, prompt))
}

const SDK: &str = include_str!("../../sdk/web/index.js");
const UI: &str = include_str!("../../sdk/web/ui.css");
/// The page's watchdog and error surface. A generated page is served under a CSP that allows
/// no inline script, so this is the only way a page that fails to boot can say so.
const BOOT: &str = include_str!("../../sdk/web/boot.js");
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecord {
    pub version: u64,
    pub sdk_fingerprint: String,
    pub artifact_fingerprint: String,
    pub verified: bool,
    pub summary: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default = "default_provider")]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub endpoint: String,
    pub model: String,
    /// Which catalog preset the settings page filled the endpoint from.
    #[serde(default)]
    pub preset: String,
    /// Legacy serialized field, ignored by generation. New settings send None.
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// Legacy serialized field, ignored by generation.
    #[serde(default)]
    pub context_window: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub timeout_seconds: Option<u32>,
}
fn default_provider() -> String {
    "default".into()
}
impl Default for Config {
    fn default() -> Self {
        Self {
            id: default_provider(),
            name: String::new(),
            endpoint: String::new(),
            model: String::new(),
            preset: String::new(),
            max_tokens: None,
            context_window: None,
            temperature: None,
            timeout_seconds: None,
        }
    }
}
/// One line of a task's execution record. The stage it belongs to is the task's status when
/// it was written, which is what lets the interface group these under the stage nodes
/// instead of showing one flat list beside them.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub at: u64,
    /// The task status at the time. Empty for entries written before this was recorded.
    #[serde(default)]
    pub status: String,
    pub text: String,
}
/// Reads both shapes a task's log can be in: the entries written now, and the flat
/// `"1758350000 · note"` strings older tasks carry.
fn read_logs<'de, D>(reader: D) -> Result<Vec<LogEntry>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Record {
        Entry(LogEntry),
        Text(String),
    }
    let records: Vec<Record> = Vec::deserialize(reader)?;
    Ok(records
        .into_iter()
        .map(|record| match record {
            Record::Entry(entry) => entry,
            Record::Text(text) => {
                let (at, text) = text
                    .split_once(" · ")
                    .filter(|(stamp, _)| stamp.bytes().all(|b| b.is_ascii_digit()))
                    .map(|(stamp, rest)| (stamp.parse().unwrap_or_default(), rest.to_owned()))
                    .unwrap_or((0, text));
                LogEntry {
                    at,
                    status: String::new(),
                    text,
                }
            }
        })
        .collect())
}
/// One message of a task's conversation. The interface draws these; the model reads the
/// user turns as the requirement history. `image` names a captured trial-preview frame
/// that travelled with the turn.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub role: String,
    /// The turn's whole text, and the fallback for a turn without events.
    pub text: String,
    #[serde(default)]
    pub streaming: bool,
    /// Unix seconds, so the interface can show how long the turn has been running.
    #[serde(default)]
    pub started_at: u64,
    #[serde(default)]
    pub ended_at: u64,
    /// What the turn did, in order: what it said, and the tools it ran between saying it.
    #[serde(default)]
    pub events: Vec<TurnEvent>,
}
/// One step inside a turn: prose, or a tool call the agent asked the host to run.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnEvent {
    pub kind: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub detail: String,
    /// Lines this step added and removed, when it wrote a file.
    #[serde(default)]
    pub added: Option<u32>,
    #[serde(default)]
    pub removed: Option<u32>,
}
impl TurnEvent {
    fn text(text: String) -> Self {
        Self {
            kind: "text".into(),
            text,
            tool: String::new(),
            path: String::new(),
            detail: String::new(),
            added: None,
            removed: None,
        }
    }
    fn tool(tool: String, path: String, detail: String) -> Self {
        Self {
            kind: "tool".into(),
            text: String::new(),
            tool,
            path,
            detail,
            added: None,
            removed: None,
        }
    }
}
/// Added and removed lines between two versions of a file, counted the cheap way: lines
/// that appear in one and not the other. It is the number a reader wants next to "wrote
/// this file", not a patch.
fn line_delta(previous: &str, next: &str) -> (u32, u32) {
    fn count(text: &str) -> HashMap<&str, u32> {
        let mut counts: HashMap<&str, u32> = HashMap::new();
        for line in text.lines() {
            *counts.entry(line.trim_end()).or_default() += 1;
        }
        counts
    }
    let before = count(previous);
    let after = count(next);
    let mut added = 0;
    let mut removed = 0;
    for (line, total) in &after {
        added += total.saturating_sub(*before.get(line).unwrap_or(&0));
    }
    for (line, total) in &before {
        removed += total.saturating_sub(*after.get(line).unwrap_or(&0));
    }
    (added, removed)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub status: String,
    /// The user turns as plain text, which is what reaches the model as context.
    pub messages: Vec<String>,
    pub sample: Option<String>,
    #[serde(default)]
    pub sample_size: u64,
    pub extension: String,
    pub error: Option<String>,
    pub version: u64,
    pub tested: bool,
    pub sdk_version: String,
    pub usage: Option<Value>,
    pub installed_version: Option<u64>,
    #[serde(default)]
    pub builds: Vec<BuildRecord>,
    #[serde(default)]
    pub plan: Option<String>,
    #[serde(default, deserialize_with = "read_logs")]
    pub logs: Vec<LogEntry>,
    /// The conversation in order: the user's turns and the assistant's streamed output.
    /// Model output lives here and nowhere else, so the interface can draw the task's
    /// progress separately from what the model said.
    #[serde(default)]
    pub transcript: Vec<Turn>,
    /// What the plugin's own document reported during its last trial run: uncaught
    /// errors, rejections and console failures.
    #[serde(default)]
    pub runtime_logs: Vec<String>,
    /// Whether a trial run of the current version has reported itself successfully.
    #[serde(default)]
    pub self_checked: bool,
    /// Whether a run is working on this task right now. The status alone cannot say it: a
    /// self-check leaves a verdict behind while the agent is still fixing what it saw.
    #[serde(default)]
    pub busy: bool,
    /// The earlier single-blob design wrote the assistant text here. It is folded into
    /// `transcript` when the project loads and is never written again.
    #[serde(default, rename = "outputs", skip_serializing)]
    legacy_outputs: Vec<Value>,
    #[serde(skip)]
    pub preview_token: Option<String>,
}
/// Self-checks one run may make. The agent debugs inside its own run now, so this is a
/// budget rather than a retry count: enough to fix a failing render, not enough to grind.
const MAX_PROBES: u32 = 4;
/// Lookups one run may make — searches, documentation, pages. Enough to research a format it
/// does not know, bounded so a run cannot turn into a browsing session at the user's expense.
const MAX_LOOKUPS: u32 = 24;
/// Where the search engine's key lives in the system credential store.
const SEARCH_SCOPE: &str = "workshop.search";
/// How long one self-check waits for the page to report itself.
const PROBE_TIMEOUT: Duration = Duration::from_secs(45);
/// Poll interval while waiting for that report.
const PROBE_TICK: Duration = Duration::from_millis(120);
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Output {
    name: String,
    summary: String,
    extension: String,
    icon: String,
    javascript: String,
    css: String,
}
/// The window a self-check runs in: the host's preview surface, one per task.
#[derive(Clone)]
pub struct ProbeWindow {
    /// The task this window belongs to, and the build it is showing. The host needs only the
    /// label, url and title below; these two are what lets an implementation tell one task's
    /// window from another's without parsing the label, which is why the test implementation
    /// reads them and the host does not.
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub version: u64,
    pub label: String,
    pub url: String,
    pub title: String,
}
/// The windows a self-check needs. The host implements this with its own webview windows;
/// tests implement it without a window at all, which is what keeps the loop checkable.
pub trait ProbeWindows: Send + Sync {
    fn show(&self, window: ProbeWindow)
        -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;
    fn capture(
        &self,
        label: String,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<u8>, String>> + Send>>;
    fn close(&self, label: String) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;
}
/// What a self-check found, in the shape the agent reads.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeOutcome {
    /// The plugin reported itself rendered.
    pub ok: bool,
    /// Why it did not, when the page said so.
    pub error: Option<String>,
    /// The page's own diagnostics for this run.
    pub logs: Vec<String>,
    /// A PNG of what the preview window showed, base64, when it could be taken.
    pub image: Option<String>,
    /// Anything the host could not do, stated instead of implied.
    pub note: Option<String>,
    /// This self-check was not run because the run already used its budget.
    pub limited: bool,
}
pub struct Workshop {
    root: PathBuf,
    projects: Mutex<HashMap<String, Project>>,
    tasks: Mutex<HashMap<String, tokio::task::AbortHandle>>,
    config: Mutex<Config>,
    providers: Mutex<Vec<Config>>,
    operations: Mutex<()>,
    windows: Arc<dyn ProbeWindows>,
    /// Everything the tasks have pulled from a registry, kept between runs.
    libraries: crate::libraries::Libraries,
    /// Lookups: search, documentation, and reading a page the model was pointed at.
    network: crate::network::Network,
    warnings: Vec<String>,
}
fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    ember_file_store::atomic_write(path, &bytes).map_err(|e| e.to_string())
}
/// Records what a task pulled into the package's own `dependencies.json`. A generated plugin
/// can be exported and handed to someone else, so where its libraries came from — the exact
/// version, the hash the source declared and the licence text — travels with it rather than
/// living only on the machine that generated it.
fn record_dependency(draft: &Path, vendored: &crate::libraries::Vendored) -> Result<(), String> {
    let path = draft.join("dependencies.json");
    let mut record: Value = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| json!({"api":1,"packages":[]}));
    let packages = record["packages"]
        .as_array_mut()
        .ok_or("dependencies.json 内容已损坏")?;
    let entry = json!({
        "name": vendored.package,
        "version": vendored.version,
        "integrity": vendored.integrity,
        "licence": vendored.licence,
        "files": vendored
            .files
            .iter()
            .map(|file| json!({"path": file.path, "name": file.name, "bytes": file.bytes}))
            .collect::<Vec<_>>(),
    });
    // One entry per package and version: pulling a second file from a version already recorded
    // adds to that entry instead of writing a second, conflicting one.
    match packages.iter_mut().find(|existing| {
        existing["name"] == entry["name"] && existing["version"] == entry["version"]
    }) {
        Some(existing) => {
            let files = existing["files"].as_array_mut().ok_or("dependencies.json 内容已损坏")?;
            for file in entry["files"].as_array().into_iter().flatten() {
                if !files.iter().any(|known| known["name"] == file["name"]) {
                    files.push(file.clone());
                }
            }
            if existing["licence"].is_null() {
                existing["licence"] = entry["licence"].clone();
            }
        }
        None => packages.push(entry),
    }
    write_json(&path, &record)
}
impl Workshop {
    pub fn new(root: PathBuf, windows: Arc<dyn ProbeWindows>) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let mut warnings = Vec::new();
        let config = match std::fs::read(root.join("config.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                warnings.push("Workshop API configuration is damaged; configure it again".into());
                Config::default()
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Config::default(),
            Err(e) => return Err(e.to_string()),
        };
        let providers: Vec<Config> = match std::fs::read(root.join("providers.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                warnings.push("供应商配置列表损坏，请重新保存".into());
                Vec::new()
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.to_string()),
        };
        let mut providers = providers;
        if !config.endpoint.is_empty() && !providers.iter().any(|p| p.id == config.id) {
            providers.push(config.clone());
        }
        let mut projects = HashMap::new();
        for entry in std::fs::read_dir(&root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let path = entry.path().join("project.json");
            if !path.is_file() {
                continue;
            }
            if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 1024 * 1024 {
                warnings.push(format!(
                    "Skipped oversized project: {}",
                    entry.file_name().to_string_lossy()
                ));
                continue;
            }
            let mut project: Project =
                match serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?) {
                    Ok(project) => project,
                    Err(_) => {
                        warnings.push(format!(
                            "Skipped damaged project: {}",
                            entry.file_name().to_string_lossy()
                        ));
                        continue;
                    }
                };
            if !valid_id(&project.id) || entry.file_name().to_string_lossy() != project.id {
                continue;
            }
            if matches!(
                project.status.as_str(),
                "analyzing" | "generating" | "validating" | "building" | "installing"
            ) || project.busy
            {
                project.busy = false;
                project.status = "interrupted".into();
                project.error =
                    Some("Task interrupted; resume to retry / 任务中断，可继续重试".into());
                write_json(&path, &project)?;
            }
            // The earlier design kept the requirements and one streamed answer in separate
            // fields. That is the same information the conversation holds, in order.
            if project.transcript.is_empty()
                && (!project.messages.is_empty() || !project.legacy_outputs.is_empty())
            {
                project.transcript = migrated(&project);
                project.legacy_outputs.clear();
                write_json(&path, &project)?;
            }
            projects.insert(project.id.clone(), project);
        }
        // Pulled packages live under the workshop's own directory, next to the tasks that
        // asked for them: a directory without a project.json is not a project, so this is
        // storage the scan walks past.
        let libraries = crate::libraries::Libraries::new(root.join("libraries"), None);
        Ok(Arc::new(Self {
            root,
            projects: Mutex::new(projects),
            tasks: Mutex::new(HashMap::new()),
            config: Mutex::new(config),
            providers: Mutex::new(providers),
            operations: Mutex::new(()),
            windows,
            libraries,
            network: crate::network::Network::new(),
            warnings,
        }))
    }
    fn directory(&self, id: &str) -> Result<PathBuf, String> {
        if !valid_id(id) {
            return Err("Invalid project ID".into());
        }
        Ok(self.root.join(id))
    }
    async fn change(&self, id: &str, update: impl FnOnce(&mut Project)) -> Result<Project, String> {
        let mut projects = self.projects.lock().await;
        let project = projects.get_mut(id).ok_or("Project not found")?;
        let previous = project.clone();
        update(project);
        if let Err(error) = write_json(&self.directory(id)?.join("project.json"), project) {
            *project = previous;
            return Err(error);
        }
        Ok(project.clone())
    }
    pub async fn get(&self, id: &str) -> Result<Project, String> {
        self.projects
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| "Project not found".into())
    }
    pub async fn state(&self) -> Value {
        let mut projects: Vec<_> = self.projects.lock().await.values().cloned().collect();
        projects.sort_by(|a, b| b.id.cmp(&a.id));
        let config = self.config.lock().await.clone();
        let providers = self.providers.lock().await.clone();
        // The settings page marks which providers already carry a stored secret,
        // so it never has to read the credential manager itself.
        let keys: serde_json::Map<String, Value> = providers
            .iter()
            .filter_map(|provider| {
                let url = endpoint(provider).ok()?;
                let stored = crate::credentials::read(&credential_scope(provider, &url))
                    .is_ok_and(|key| !key.is_empty());
                Some((provider.id.clone(), json!(stored)))
            })
            .collect();
        let has_key = keys
            .get(&config.id)
            .and_then(Value::as_bool)
            .unwrap_or(false);
        json!({"config":config,"providers":providers,"keys":keys,"hasKey":has_key,"projects":projects,"warnings":self.warnings,"sdkFingerprint":sdk_fingerprint()})
    }
    pub async fn configure(&self, config: Config, key: Option<String>) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let endpoint = endpoint(&config)?;
        let mut current = self.config.lock().await;
        if let Some(key) = key.filter(|k| !k.is_empty()) {
            crate::credentials::save(&credential_scope(&config, &endpoint), &key)?;
        }
        let mut providers = self.providers.lock().await;
        let mut next = providers.clone();
        if let Some(existing) = next.iter_mut().find(|p| p.id == config.id) {
            *existing = config.clone();
        } else {
            if next.len() >= 32 {
                return Err("最多保存 32 个供应商配置".into());
            }
            next.push(config.clone());
        }
        write_json(&self.root.join("providers.json"), &next)?;
        *providers = next;
        write_json(&self.root.join("config.json"), &config)?;
        *current = config;
        Ok(())
    }
    /// The general web engine this machine has configured, with its key read from the system
    /// credential store rather than from any file this app writes.
    pub fn search_setting(&self) -> crate::network::Engine {
        let mut engine: crate::network::Engine = std::fs::read(self.root.join("search.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        if let Ok(key) = crate::credentials::read(SEARCH_SCOPE) {
            if !key.is_empty() {
                engine.key = Some(key);
            }
        }
        engine
    }
    /// Saves the search engine. The key goes to the credential store and never into a file;
    /// an empty key leaves whatever is stored alone unless it is explicitly cleared.
    pub fn configure_search(
        &self,
        engine: crate::network::Engine,
        clear_key: bool,
    ) -> Result<(), String> {
        if !matches!(engine.provider.as_str(), "" | "searxng" | "tavily") {
            return Err("未知的搜索来源".into());
        }
        if engine.provider == "searxng" {
            let endpoint = reqwest::Url::parse(engine.endpoint.trim())
                .map_err(|_| "搜索端点不是有效地址")?;
            if !matches!(endpoint.scheme(), "http" | "https") {
                return Err("搜索端点必须是 http/https".into());
            }
        }
        if let Some(key) = engine.key.as_deref().filter(|key| !key.is_empty()) {
            crate::credentials::save(SEARCH_SCOPE, key)?;
        } else if clear_key {
            let _ = crate::credentials::remove(SEARCH_SCOPE);
        }
        write_json(
            &self.root.join("search.json"),
            &crate::network::Engine {
                key: None,
                ..engine
            },
        )
    }
    /// What a lookup will actually use: the saved setting, or the one this machine's
    /// environment names. A missing key is reported in the settings, not as a failed search.
    async fn search_engine(&self) -> Option<crate::network::Engine> {
        let engine = self.search_setting();
        if engine.configured() {
            return Some(engine);
        }
        self.network.environment_engine()
    }
    pub async fn select_provider(&self, id: &str) -> Result<(), String> {
        let config = self
            .providers
            .lock()
            .await
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or("供应商不存在")?;
        self.configure(config, None).await
    }
    pub async fn remove_provider(&self, id: &str) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let mut current = self.config.lock().await;
        let mut providers = self.providers.lock().await;
        let provider = providers
            .iter()
            .find(|p| p.id == id)
            .ok_or("供应商不存在")?;
        crate::credentials::remove(&credential_scope(provider, &endpoint(provider)?))?;
        let next: Vec<_> = providers.iter().filter(|p| p.id != id).cloned().collect();
        let selected = if current.id == id {
            next.first().cloned().unwrap_or_default()
        } else {
            current.clone()
        };
        write_json(&self.root.join("config.json"), &selected)?;
        *current = selected;
        write_json(&self.root.join("providers.json"), &next)?;
        *providers = next;
        Ok(())
    }
    pub async fn models(&self) -> Result<Vec<String>, String> {
        let config = self.config.lock().await.clone();
        self.models_for(config, None).await
    }
    pub async fn models_for(
        &self,
        config: Config,
        key: Option<String>,
    ) -> Result<Vec<String>, String> {
        let mut url = endpoint(&config)?;
        url.set_path(&format!(
            "{}/models",
            url.path().trim_end_matches("/chat/completions")
        ));
        let key = match key.filter(|value| !value.is_empty()) {
            Some(key) => key,
            None => service_key(&config)?,
        };
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        let request = client.get(url);
        let request = if key.is_empty() {
            request
        } else {
            request.bearer_auth(&key)
        };
        let response = read_response(request.send().await.map_err(|e| e.to_string())?)
            .await
            .map_err(|e| redact_service_error(e, &key))?;
        let values = response["data"]
            .as_array()
            .ok_or("供应商不支持模型列表，请手动输入模型 ID")?;
        let mut models: Vec<String> = values
            .iter()
            .filter_map(|v| v["id"].as_str())
            .filter(|id| !id.is_empty() && id.len() <= 200)
            .take(2000)
            .map(str::to_owned)
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    }
    pub async fn create(
        &self,
        requirement: String,
        sample: Option<PathBuf>,
    ) -> Result<Project, String> {
        if requirement.len() > 16000 {
            return Err("Requirement exceeds 16 KiB / 需求过长".into());
        }
        if requirement.trim().is_empty() && sample.is_none() {
            return Err(
                "Describe the plugin you want, or add a sample file / 请描述需要的插件，或添加一个样例文件"
                    .into(),
            );
        }
        let (sample, sample_size, extension) = if let Some(path) = sample {
            let path = path.canonicalize().map_err(|e| e.to_string())?;
            let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            if !metadata.is_file() {
                return Err("Sample must be a file / 样例必须是文件".into());
            }
            let extension = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            (
                Some(path.to_string_lossy().into_owned()),
                metadata.len(),
                extension,
            )
        } else {
            (None, 0, String::new())
        };
        let mut projects = self.projects.lock().await;
        let id = format!(
            "p{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos()
        );
        // The task is called after what the user asked for, because the plugin's own name
        // only exists once the model has written it.
        let name = task_name(&requirement, sample.as_deref());
        let project = Project {
            id: id.clone(),
            name,
            status: "draft".into(),
            messages: if requirement.trim().is_empty() {
                Vec::new()
            } else {
                vec![requirement.clone()]
            },
            sample,
            sample_size,
            extension,
            error: None,
            version: 0,
            tested: false,
            sdk_version: env!("CARGO_PKG_VERSION").into(),
            usage: None,
            installed_version: None,
            builds: Vec::new(),
            plan: None,
            logs: Vec::new(),
            transcript: if requirement.trim().is_empty() {
                Vec::new()
            } else {
                vec![Turn {
                    role: "user".into(),
                    text: requirement,
                    streaming: false,
                    started_at: clock(),
                    ended_at: clock(),
                    events: Vec::new(),
                }]
            },
            runtime_logs: Vec::new(),
            self_checked: false,
            busy: false,
            legacy_outputs: Vec::new(),
            preview_token: None,
        };
        std::fs::create_dir(self.directory(&id)?).map_err(|e| e.to_string())?;
        write_json(&self.directory(&id)?.join("project.json"), &project)?;
        projects.insert(id, project.clone());
        Ok(project)
    }
    /// Folds the host's plugin list back into the tasks that claim to be installed. A
    /// plugin the user removed in plugin management must stop looking installed here,
    /// otherwise the workshop would offer to install something it already lost.
    pub async fn reconcile(&self, runtime: &Arc<Runtime>) -> Result<(), String> {
        let installed: Vec<String> = runtime
            .snapshot()
            .await
            .plugins
            .iter()
            .map(|plugin| plugin.manifest.id.clone())
            .collect();
        let stale: Vec<String> = {
            let projects = self.projects.lock().await;
            projects
                .values()
                .filter(|project| {
                    project.installed_version.is_some()
                        && !installed.contains(&generated_id(&project.id))
                })
                .map(|project| project.id.clone())
                .collect()
        };
        for id in stale {
            self.change(&id, |p| {
                p.installed_version = None;
                if p.status == "installed" {
                    p.status = if p.tested {
                        "ready".into()
                    } else {
                        "awaitingPreview".into()
                    };
                    p.error = None;
                }
                p.logs.push(LogEntry {
                    at: clock(),
                    status: p.status.clone(),
                    text: "插件已从插件管理中移除，安装状态已同步".into(),
                });
            })
            .await?;
        }
        Ok(())
    }
    /// Removes a task completely: the conversation, the source drafts, every built version
    /// and the sample bytes the task owns. The user's own sample file is never touched,
    /// because only the project directory is deleted.
    pub async fn delete(
        &self,
        id: &str,
        uninstall: bool,
        runtime: &Arc<Runtime>,
    ) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        if let Some(task) = self.tasks.lock().await.remove(id) {
            task.abort();
            // A task that is still writing would recreate what this call is about to
            // remove, leaving a directory behind with no task to explain it.
            let mut waited = 0;
            while !task.is_finished() && waited < 100 {
                tokio::time::sleep(Duration::from_millis(20)).await;
                waited += 1;
            }
        }
        let project = self.get(id).await?;
        if uninstall && project.installed_version.is_some() {
            runtime.uninstall(&generated_id(id)).await?;
        }
        let directory = self.directory(id)?;
        if directory.exists() {
            std::fs::remove_dir_all(&directory).map_err(|e| e.to_string())?;
        }
        self.projects.lock().await.remove(id);
        Ok(())
    }
    pub async fn cancel(&self, id: &str) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        if let Some(task) = self.tasks.lock().await.remove(id) {
            task.abort();
        }
        self.change(id, |p| {
            p.status = "cancelled".into();
            p.busy = false;
            p.tested = false;
        })
        .await?;
        // A self-check that was waiting for its window is gone with the task; the window
        // itself has to be closed here or it would outlive what it was showing.
        self.windows
            .close(format!("workshop-preview-{id}-probe"))
            .await?;
        Ok(())
    }
    pub async fn attach_sample(&self, id: &str, sample: PathBuf) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let path = sample.canonicalize().map_err(|e| e.to_string())?;
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if !metadata.is_file() {
            return Err("Sample must be a file".into());
        }
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let project = self.get(id).await?;
        if !project.extension.is_empty() && project.extension != extension {
            return Err("Sample type does not match this project".into());
        }
        if self
            .tasks
            .lock()
            .await
            .get(id)
            .is_some_and(|t| !t.is_finished())
        {
            return Err("Cancel generation before changing the sample".into());
        }
        self.change(id, |p| {
            p.preview_token = None;
            p.sample = Some(path.to_string_lossy().into_owned());
            p.sample_size = metadata.len();
            p.extension = extension;
            p.tested = false;
            if p.version > 0 {
                p.status = "awaitingPreview".into();
            }
        })
        .await?;
        Ok(())
    }
    pub async fn start(
        self: &Arc<Self>,
        id: String,
        message: String,
        tool: Package,
        analyze_only: bool,
    ) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        if message.len() > 16000 {
            return Err("Requirement exceeds 16 KiB".into());
        }
        let mut tasks = self.tasks.lock().await;
        tasks.retain(|_, task| !task.is_finished());
        if tasks.len() >= 2 {
            return Err(
                "At most two workshop tasks may run at once / 最多同时运行两个工坊任务".into(),
            );
        }
        if tasks.get(&id).is_some_and(|t| !t.is_finished()) {
            return Err("Task is already running".into());
        }
        let project = self.get(&id).await?;
        if project.messages.iter().map(String::len).sum::<usize>() + message.len() > 64000 {
            return Err("Conversation exceeds 64 KiB".into());
        }
        let config = self.config.lock().await.clone();
        let key = service_key(&config)?;
        self.change(&id, |p| {
            if !message.trim().is_empty() {
                p.messages.push(message.clone());
                p.plan = None;
                p.transcript.push(Turn {
                    role: "user".into(),
                    text: message,
                    streaming: false,
                    started_at: clock(),
                    ended_at: clock(),
                    events: Vec::new(),
                });
            }
            for turn in p.transcript.iter_mut() {
                turn.streaming = false;
            }
            p.status = "analyzing".into();
            p.busy = true;
            p.tested = false;
            p.logs.clear();
            p.usage = None;
        })
        .await?;
        let service = self.clone();
        let task_id = id.clone();
        let task = tokio::spawn(async move {
            let result = if analyze_only {
                service.analyze(&task_id, &tool, &config, &key).await
            } else {
                service.generate(&task_id, &tool, &config, &key).await
            };
            let failure = result.err();
            let _ = service
                .change(&task_id, |p| {
                    p.busy = false;
                    for turn in p.transcript.iter_mut() {
                        turn.streaming = false;
                        if turn.ended_at == 0 {
                            turn.ended_at = clock();
                        }
                    }
                    if let Some(error) = failure {
                        p.status = "failed".into();
                        p.error = Some(error);
                    }
                })
                .await;
        });
        tasks.insert(id, task.abort_handle());
        Ok(())
    }
    async fn request(&self, messages: Value) -> Result<Value, String> {
        let config = self.config.lock().await.clone();
        let key = service_key(&config)?;
        request_service(&config, &key, messages).await
    }
    pub async fn test_connection(&self) -> Result<(), String> {
        let reply = self
            .request(json!([{"role":"user","content":"Reply with OK."}]))
            .await?;
        reply["choices"][0]["message"]["content"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("Service does not support chat completions")?;
        Ok(())
    }
    async fn analyze(
        &self,
        id: &str,
        tool: &Package,
        config: &Config,
        key: &str,
    ) -> Result<(), String> {
        let plan = self.run_pi(id, tool, config, key, true).await?;
        self.change(id, |p| {
            p.plan = Some(plan);
            p.status = "planned".into();
        })
        .await?;
        Ok(())
    }
    async fn generate(
        &self,
        id: &str,
        tool: &Package,
        config: &Config,
        key: &str,
    ) -> Result<(), String> {
        self.run_pi(id, tool, config, key, false).await?;
        Ok(())
    }
    async fn run_pi(
        &self,
        id: &str,
        tool: &Package,
        config: &Config,
        key: &str,
        analysis: bool,
    ) -> Result<String, String> {
        use std::process::Stdio;
        use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
        if config.model.trim().is_empty() {
            return Err("请先选择或输入模型 ID，再保存配置".into());
        }
        let (development_kit, instructions) = kit(tool)?;
        let executable = ember_runtime::manifest::contained(&tool.directory, "bin/node.exe")
            .map_err(|_| "插件工坊缺少 Pi 运行时，请更新插件工坊")?;
        let runner = ember_runtime::manifest::contained(&tool.directory, "bin/agent.mjs")?;
        let project = self.get(id).await?;
        let draft = self.directory(id)?.join("draft");
        std::fs::create_dir_all(draft.join("ui")).map_err(|e| e.to_string())?;
        let mut files = serde_json::Map::new();
        for name in draft_files(&draft) {
            if let Ok(contents) = std::fs::read_to_string(draft.join(&name)) {
                files.insert(name, json!(contents));
            }
        }
        // Older projects predate draft checkpoints; continue from their last build.
        if files.is_empty() && project.version > 0 {
            let previous = self.directory(id)?.join(format!("v{}", project.version));
            for name in ["ui/view.js", "ui/style.css"] {
                if let Ok(contents) = std::fs::read_to_string(previous.join(name)) {
                    files.insert(name.into(), json!(contents));
                }
            }
            let manifest: Value = serde_json::from_slice(
                &std::fs::read(previous.join("plugin.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            files.insert("metadata.json".into(),json!(json!({"name":manifest["name"],"extension":project.extension,"icon":manifest["icon"],"summary":project.builds.last().map(|b|b.summary.as_str()).unwrap_or("")}).to_string()));
        }
        let instructions = if analysis {
            std::fs::read_to_string(
                tool.directory
                    .join("ui")
                    .join(&development_kit.analysis_prompt),
            )
            .map_err(|e| e.to_string())?
        } else {
            instructions
        };
        let init = json!({
            "type":"start",
            "analysis":analysis,
            "instructions":instructions,
            "files":files,
            "key":key,
            "endpoint":config.endpoint,
            "model":config.model,
            "temperature":config.temperature,
            "timeoutSeconds":config.timeout_seconds,
            "maxTokens":budget_ceiling(config),
            "probeLimit":MAX_PROBES,
            "context":{
                "requirements":project.messages,
                "plan":project.plan,
                "previousDiagnostics":project.error,
                "sample":sample_context(&project),
            }
        });
        let mut command = tokio::process::Command::new(executable);
        // Node's entrypoint resolver does not accept Windows verbatim paths.
        let runner_arg = runner.to_string_lossy();
        let runner_arg = runner_arg
            .strip_prefix(r"\\?\UNC\")
            .map(|path| format!(r"\\{path}"))
            .unwrap_or_else(|| {
                runner_arg
                    .strip_prefix(r"\\?\")
                    .unwrap_or(&runner_arg)
                    .to_owned()
            });
        command.env_clear();
        for name in [
            "SystemRoot",
            "TEMP",
            "TMP",
            "HTTPS_PROXY",
            "HTTP_PROXY",
            "NO_PROXY",
            "NODE_EXTRA_CA_CERTS",
        ] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        command
            .arg(runner_arg)
            .current_dir(&draft)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|e| format!("无法启动 Pi Agent：{e}"))?;
        let stderr = child.stderr.take().ok_or("Missing agent diagnostics")?;
        let diagnostics = tokio::spawn(async move {
            let mut bytes = Vec::new();
            let _ = stderr.take(8192).read_to_end(&mut bytes).await;
            String::from_utf8_lossy(&bytes).into_owned()
        });
        let mut stdin = child.stdin.take().ok_or("Missing agent input")?;
        stdin
            .write_all(format!("{init}\n").as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        let mut lines = BufReader::new(child.stdout.take().ok_or("Missing agent output")?).lines();
        self.change(id, |p| {
            p.status = if analysis { "analyzing" } else { "generating" }.into();
            p.transcript.push(Turn {
                role: "assistant".into(),
                text: String::new(),
                streaming: true,
                started_at: clock(),
                ended_at: 0,
                // Events are added as they happen: a turn that starts with a tool call has
                // no empty prose before it.
                events: Vec::new(),
            });
        })
        .await?;
        self.log(id, format!("Pi Agent 已启动 · {}", config.model))
            .await?;
        let mut accepted = None;
        let mut complete = None;
        // Line counts for the file the last tool call wrote, so the turn can show what it
        // changed. The tool's own result arrives after the host has already saved it.
        let mut deltas: HashMap<String, (u32, u32)> = HashMap::new();
        // Whether the project's current version was built from the files as they are now.
        let mut built_here = false;
        let mut probes: u32 = 0;
        let mut lookups: u32 = 0;
        loop {
            let line = tokio::time::timeout(
                Duration::from_secs(config.timeout_seconds.unwrap_or(300) as u64),
                lines.next_line(),
            )
            .await
            .map_err(|_| "模型响应超时，已保存生成文件，可重试继续")?
            .map_err(|e| e.to_string())?;
            let Some(line) = line else { break };
            if line.len() > 1024 * 1024 {
                return Err("Agent event too large".into());
            }
            let event: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
            match event["type"].as_str().unwrap_or("") {
                "output" => {
                    let trim = |value: Option<&Value>| {
                        value
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .chars()
                            .take(64000)
                            .collect::<String>()
                    };
                    // `text` is the message being written now, `whole` is everything the run
                    // has said. The step shows the message; the turn keeps the whole thing.
                    let chunk = trim(event["text"].as_str().map(|_| &event["text"]));
                    let whole = trim(event.get("whole"));
                    self.change(id, |p| {
                        if let Some(turn) = p
                            .transcript
                            .iter_mut()
                            .rev()
                            .find(|turn| turn.role == "assistant")
                        {
                            if turn.events.last().is_none_or(|event| event.kind != "text") {
                                turn.events.push(TurnEvent::text(String::new()));
                            }
                            if let Some(event) = turn.events.last_mut() {
                                event.text = chunk;
                            }
                            turn.text = if whole.is_empty() {
                                turn.events
                                    .iter()
                                    .filter(|event| event.kind == "text")
                                    .map(|event| event.text.as_str())
                                    .collect::<Vec<_>>()
                                    .join(
                                        "

",
                                    )
                            } else {
                                whole
                            };
                            turn.streaming = true;
                        }
                    })
                    .await?;
                }
                "usage" => {
                    self.change(id, |p| {
                        p.usage = Some(json!({"total_tokens":event["total_tokens"]}))
                    })
                    .await?;
                }
                "activity" => {
                    let message = event["message"].as_str().unwrap_or("").to_owned();
                    let tool = event["tool"].as_str().unwrap_or_default();
                    // A tool the agent ran is part of the turn's own record; a host note
                    // (a retry, a rate limit) belongs to the task's log instead.
                    if !tool.is_empty() {
                        let path = event["path"].as_str().unwrap_or_default().to_owned();
                        let detail = event["detail"].as_str().unwrap_or_default().to_owned();
                        let delta = deltas.remove(&path);
                        self.change(id, |p| {
                            if let Some(turn) = p
                                .transcript
                                .iter_mut()
                                .rev()
                                .find(|turn| turn.role == "assistant")
                            {
                                let mut entry = TurnEvent::tool(tool.into(), path, detail);
                                if let Some((added, removed)) = delta {
                                    entry.added = Some(added);
                                    entry.removed = Some(removed);
                                }
                                turn.events.push(entry);
                            }
                        })
                        .await?;
                    }
                    self.log(id, message).await?;
                }
                "file" => {
                    let name = event["path"].as_str().ok_or("Missing file name")?;
                    writable(name)?;
                    let text = event["content"].as_str().ok_or("Missing file content")?;
                    if text.len() > 160000 {
                        return Err("Agent file too large".into());
                    }
                    // What this write changed, for the step the agent is about to report.
                    let located = destination(&draft, name)?;
                    if let Some(parent) = located.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    let previous = std::fs::read_to_string(&located).unwrap_or_default();
                    deltas.insert(name.to_owned(), line_delta(&previous, &text));
                    ember_file_store::atomic_write(&located, text.as_bytes())
                        .map_err(|e| e.to_string())?;
                    accepted = None;
                    built_here = false;
                    self.change(id, |p| p.status = "generating".into()).await?;
                    self.log(id, format!("已保存 {name} · {} bytes", text.len()))
                        .await?;
                }
                "request" => {
                    // The agent may inspect the host's SDK rules and its icon index. Both
                    // are read-only host facts; neither is a format hint.
                    let reply = match event["method"].as_str().unwrap_or_default() {
                        "validate" => {
                            self.change(id, |p| p.status = "validating".into()).await?;
                            let result = parse_output(
                                &event["args"].to_string(),
                                &package_files(&draft),
                            )
                            .and_then(|out| {
                                if !project.extension.is_empty()
                                    && out.extension != project.extension
                                {
                                    Err("必须保持样例文件的扩展名".into())
                                } else {
                                    Ok(out)
                                }
                            });
                            self.change(id, |p| p.status = "generating".into()).await?;
                            match result {
                                Ok(out) => {
                                    accepted = Some(out);
                                    // The step after a passing validation is to see the
                                    // plugin run, so the reply says so where the model is
                                    // already looking.
                                    json!({"type":"reply","id":event["id"],"ok":true,"next":"调用 preview 让宿主构建并运行插件，再根据它报告的页面错误和截图修正问题"})
                                }
                                Err(error) => {
                                    self.log(id, format!("校验反馈：{error}")).await?;
                                    json!({"type":"reply","id":event["id"],"ok":false,"error":error})
                                }
                            }
                        }
                        "icons" => {
                            json!({"type":"reply","id":event["id"],"value":crate::icons::names(event["args"]["query"].as_str().unwrap_or_default())})
                        }
                        // The long tail of formats needs libraries this repository does not
                        // ship, so the agent names one and the host fetches it: pinned,
                        // integrity-checked, unpacked without running anything, and copied
                        // into the package as a file the page can import by itself.
                        "dependency" => {
                            let arguments = &event["args"];
                            let package = arguments["package"]
                                .as_str()
                                .unwrap_or_default()
                                .trim()
                                .to_owned();
                            if package.is_empty() {
                                json!({"type":"reply","id":event["id"],"ok":false,"error":"add_dependency 需要 package"})
                            } else {
                                let version = arguments["version"].as_str();
                                let files: Vec<String> = arguments["files"]
                                    .as_array()
                                    .map(|list| {
                                        list.iter()
                                            .filter_map(|value| value.as_str())
                                            .map(|value| value.trim().to_owned())
                                            .filter(|value| !value.is_empty())
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                if files.is_empty() {
                                    match self.libraries.catalogue(&package, version).await {
                                        Ok(catalogue) => {
                                            self.log(id, format!("查询库 {package}@{} · 共 {} 个文件", catalogue.version, catalogue.total)).await?;
                                            json!({"type":"reply","id":event["id"],"value":serde_json::to_value(&catalogue).map_err(|e| e.to_string())?})
                                        }
                                        Err(error) => {
                                            self.log(id, format!("取库失败：{error}")).await?;
                                            json!({"type":"reply","id":event["id"],"ok":false,"error":error})
                                        }
                                    }
                                } else {
                                    match self
                                        .libraries
                                        .vendor(
                                            &package,
                                            version,
                                            &files,
                                            &draft.join("ui").join("vendor"),
                                        )
                                        .await
                                    {
                                        Ok(vendored) => {
                                            record_dependency(&draft, &vendored)?;
                                            // What is vendored is the agent's input from here:
                                            // the accepted files are stale, and the next build
                                            // has to be made from what is on disk now.
                                            accepted = None;
                                            built_here = false;
                                            self.log(
                                                id,
                                                format!(
                                                    "取用 {package}@{} · {}",
                                                    vendored.version,
                                                    vendored
                                                        .files
                                                        .iter()
                                                        .map(|file| file.name.as_str())
                                                        .collect::<Vec<_>>()
                                                        .join(" ")
                                                ),
                                            )
                                            .await?;
                                            json!({"type":"reply","id":event["id"],"value":serde_json::to_value(&vendored).map_err(|e| e.to_string())?})
                                        }
                                        Err(error) => {
                                            self.log(id, format!("取库失败：{error}")).await?;
                                            json!({"type":"reply","id":event["id"],"ok":false,"error":error})
                                        }
                                    }
                                }
                            }
                        }
                        // Running the plugin is the agent's own feedback loop: it builds
                        // the accepted files, shows them against the sample, waits for the
                        // page's verdict and photographs the result.
                        "preview" => {
                            probes += 1;
                            if probes > MAX_PROBES {
                                json!({"type":"reply","id":event["id"],"value":json!({
                                    "ok": false,
                                    "limited": true,
                                    "logs": [],
                                    "note": format!("本次生成已经用过 {MAX_PROBES} 次自检，不能再试运行了。请按最后一次自检的结果收尾，并在总结里说明它是否通过。"),
                                })})
                            } else {
                                let outcome = self
                                    .probe(id, tool, accepted.clone())
                                    .await?;
                                // Either way the current version was built from the files
                                // the agent has now, so the run must not build them again.
                                built_here = true;
                                self.log(
                                    id,
                                    format!(
                                        "自检 {probes}/{MAX_PROBES}：{}",
                                        if outcome.ok { "通过" } else { "未通过" }
                                    ),
                                )
                                .await?;
                                let mut value =
                                    serde_json::to_value(&outcome).map_err(|e| e.to_string())?;
                                value["probeLimit"] = json!(MAX_PROBES);
                                value["probes"] = json!(probes);
                                json!({"type":"reply","id":event["id"],"value":value})
                            }
                        }
                        "search" | "docs" | "page" => {
                            let arguments = &event["args"];
                            if lookups >= MAX_LOOKUPS {
                                json!({"type":"reply","id":event["id"],"ok":false,"error":format!("本次生成已经查了 {MAX_LOOKUPS} 次，不能再联网查了。请按已经拿到的信息收尾，并在总结里说明哪些是没有验证的。")})
                            } else {
                                lookups += 1;
                                let engine = self.search_engine().await;
                                let query = arguments["query"].as_str().unwrap_or_default().trim();
                                let library = arguments["library"].as_str().unwrap_or_default();
                                let url = arguments["url"].as_str().unwrap_or_default();
                                let lookup = match event["method"].as_str().unwrap_or_default() {
                                    "search" => self.network.search(query, engine.as_ref()).await.map(|answer| {
                                        (
                                            serde_json::to_value(&answer),
                                            format!("{query} · {} 条", answer.results.len()),
                                        )
                                    }),
                                    "docs" => self
                                        .network
                                        .docs(library, arguments["topic"].as_str())
                                        .await
                                        .map(|answer| {
                                            (
                                                serde_json::to_value(&answer),
                                                format!("{library} · {} 字符", answer.text.len()),
                                            )
                                        }),
                                    _ => self.network.page(url).await.map(|answer| {
                                        (
                                            serde_json::to_value(&answer),
                                            format!("{url} · {} 字符", answer.text.len()),
                                        )
                                    }),
                                };
                                match lookup {
                                    Ok((value, detail)) => {
                                        self.log(id, format!("联网查询 {detail}")).await?;
                                        json!({"type":"reply","id":event["id"],"value":value.map_err(|e| e.to_string())?})
                                    }
                                    Err(error) => {
                                        self.log(id, format!("联网查询失败：{error}")).await?;
                                        json!({"type":"reply","id":event["id"],"ok":false,"error":error})
                                    }
                                }
                            }
                        }
                        _ => return Err("Invalid agent method".into()),
                    };
                    stdin
                        .write_all(format!("{reply}\n").as_bytes())
                        .await
                        .map_err(|e| e.to_string())?;
                }
                "done" => {
                    complete = Some(event["text"].as_str().unwrap_or("").to_owned());
                    break;
                }
                "error" => {
                    return Err(redact_service_error(
                        event["message"]
                            .as_str()
                            .unwrap_or("Pi Agent failed")
                            .into(),
                        key,
                    ))
                }
                _ => {}
            }
        }
        drop(stdin);
        let status = child.wait().await.map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!(
                "Pi Agent 异常退出：{}",
                redact_service_error(diagnostics.await.unwrap_or_default(), key)
            ));
        }
        let text = complete.ok_or("Pi Agent 未完成生成，已保存文件可继续")?;
        self.change(id, |p| {
            for turn in p.transcript.iter_mut() {
                turn.streaming = false;
                if turn.ended_at == 0 {
                    turn.ended_at = clock();
                }
            }
        })
        .await?;
        if !analysis {
            let output = accepted.ok_or("插件尚未通过校验")?;
            if !built_here {
                self.build_candidate(id, tool, output)
                    .await?;
                self.log(id, "构建完成，可查看文件并试预览".into()).await?;
            }
        }
        Ok(text)
    }
    pub async fn artifacts(&self, id: &str) -> Result<Value, String> {
        let p = self.get(id).await?;
        if p.version == 0
            || matches!(
                p.status.as_str(),
                "generating" | "validating" | "failed" | "cancelled"
            )
        {
            let draft = self.directory(id)?.join("draft");
            let mut names = draft_files(&draft);
            if draft.join("metadata.json").is_file() {
                names.insert(0, "metadata.json".into());
            }
            let files = self.read_files(&draft, &names);
            if !files.is_empty() || p.version == 0 {
                return Ok(json!(files));
            }
        }
        let root = self.directory(id)?.join(format!("v{}", p.version));
        let mut names: Vec<String> = [
            "plugin.json",
            "ui/view.js",
            "ui/style.css",
            "ui/index.html",
            "README.md",
        ]
        .iter()
        .map(|name| (*name).to_owned())
        .collect();
        // Whatever else the agent brought along is part of the package, so it is shown too.
        names.extend(
            draft_files(&root)
                .into_iter()
                .filter(|name| !["ui/view.js", "ui/style.css"].contains(&name.as_str())),
        );
        let files = self.read_files(&root, &names);
        Ok(json!(files))
    }
    /// Reads named files for the workbench, skipping anything too large to show. `display`
    /// is the prefix the draft keeps its page under: in a package the page is the root.
    fn read_files(&self, root: &Path, names: &[String]) -> Vec<Value> {
        let mut files = Vec::new();
        for name in names {
            let Ok(path) = ember_runtime::manifest::contained(root, name) else {
                continue;
            };
            let Ok(metadata) = std::fs::metadata(&path) else {
                continue;
            };
            if !metadata.is_file() || metadata.len() > 160000 {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            files.push(json!({"name":name,"size":metadata.len(),"content":content}));
        }
        files
    }
    /// Task notes are shown to the user, so a retry or a truncation is never silent. The
    /// stage is read here rather than at the call site: every note belongs to whatever the
    /// task was doing when it was written.
    async fn log(&self, id: &str, note: String) -> Result<(), String> {
        let note: String = note.chars().take(500).collect();
        self.change(id, |p| {
            p.logs.push(LogEntry {
                at: clock(),
                status: p.status.clone(),
                text: note,
            });
            if p.logs.len() > 40 {
                p.logs.remove(0);
            }
        })
        .await?;
        Ok(())
    }
    async fn build_candidate(
        &self,
        id: &str,
        tool: &Package,
        output: Output,
    ) -> Result<(), String> {
        let project = self.get(id).await?;
        self.change(id, |p| p.status = "building".into()).await?;
        let mut version = project.version + 1;
        while self.directory(id)?.join(format!("v{version}")).exists() {
            version += 1;
        }
        let directory = self.directory(id)?.join(format!("v{version}"));
        let draft = self.directory(id)?.join("draft");
        // A failed/aborted candidate is never reused or installed.
        std::fs::create_dir_all(directory.join("ui")).map_err(|e| e.to_string())?;
        std::fs::create_dir(directory.join("bin")).map_err(|e| e.to_string())?;
        std::fs::copy(
            ember_runtime::manifest::contained(&tool.directory, &tool.manifest.executable)?,
            directory.join("bin/view.exe"),
        )
        .map_err(|e| e.to_string())?;
        // The agent's own files first: the page it wrote, plus anything it brought along
        // (a library under vendor/, a helper next to the view). The host's files are written
        // over the top, so a package always carries exactly the ones the host owns.
        for name in draft_files(&draft) {
            let source = destination(&draft, &name)?;
            let target = destination(&directory, &name)?;
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(&source, &target)
                .map_err(|e| format!("{name}: {e} (from {source:?} to {target:?})"))?;
        }
        for (name, contents) in [("sdk.js", SDK), ("sdk-ui.css", UI), ("boot.js", BOOT), ("view.js", output.javascript.as_str()), ("style.css", output.css.as_str()), ("index.html", "<!doctype html><html><head><meta charset=\"utf-8\"><link rel=\"stylesheet\" href=\"sdk-ui.css\"><link rel=\"stylesheet\" href=\"style.css\"></head><body><main id=\"app\"></main><script src=\"boot.js\"></script><script type=\"module\" src=\"view.js\"></script></body></html>")] {
            std::fs::write(directory.join("ui").join(name), contents).map_err(|e| e.to_string())?;
        }
        std::fs::write(directory.join("README.md"), &output.summary).map_err(|e| e.to_string())?;
        write_json(
            &directory.join("plugin.json"),
            &json!({"api":1,"id":generated_id(id),"name":output.name,"version":"0.1.0","extensions":[output.extension],"icon":output.icon,"entry":"ui/index.html","executable":"bin/view.exe","capabilities":["view","controls"],"permissions":["readFile"],"targets":[ember_runtime::manifest::HOST_TARGET]}),
        )?;
        Package::load(&directory)?;
        let record = BuildRecord {
            version,
            sdk_fingerprint: sdk_fingerprint(),
            artifact_fingerprint: ember_runtime::sharing::fingerprint(&directory)?,
            verified: false,
            summary: output.summary,
        };
        let _operation = self.operations.lock().await;
        self.change(id, |p| {
            p.builds.push(record);
            p.name = output.name;
            p.extension = output.extension;
            p.version = version;
            p.status = "awaitingPreview".into();
            p.error = None;
            p.sdk_version = env!("CARGO_PKG_VERSION").into();
        })
        .await?;
        Ok(())
    }
    pub async fn asset(&self, id: &str, asset: &str) -> Result<PathBuf, String> {
        let project = self.get(id).await?;
        if project.version == 0 {
            return Err("No build available".into());
        }
        if !asset.starts_with("ui/") {
            return Err("Only preview assets are available".into());
        }
        ember_runtime::manifest::contained(
            &self.directory(id)?.join(format!("v{}", project.version)),
            asset,
        )
    }
    pub async fn read_sample(&self, id: &str, offset: u64, length: u32) -> Result<Vec<u8>, String> {
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        if length > 1024 * 1024 {
            return Err("Read limit is 1 MiB".into());
        }
        let project = self.get(id).await?;
        let mut file = tokio::fs::File::open(project.sample.ok_or("Select a sample first")?)
            .await
            .map_err(|e| e.to_string())?;
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(length as u64)
            .read_to_end(&mut bytes)
            .await
            .map_err(|e| e.to_string())?;
        Ok(bytes)
    }
    pub async fn begin_preview(&self, id: &str) -> Result<Project, String> {
        let _operation = self.operations.lock().await;
        let project = self.get(id).await?;
        if !matches!(
            project.status.as_str(),
            "awaitingPreview" | "ready" | "previewFailed" | "installed"
        ) {
            return Err("This project is not ready for preview".into());
        }
        self.verified_directory(&project, false)?;
        let token = format!(
            "{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos()
        );
        self.change(id, |p| {
            p.preview_token = Some(token);
            p.tested = false;
            p.status = "awaitingPreview".into();
        })
        .await?;
        self.get(id).await
    }
    pub async fn presented(
        &self,
        id: &str,
        version: u64,
        token: &str,
        error: Option<String>,
        logs: Vec<String>,
    ) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let project = self.get(id).await?;
        if project.preview_token.as_deref() != Some(token) {
            return Err("Preview session has expired".into());
        }
        if project.version != version
            || !matches!(
                project.status.as_str(),
                "awaitingPreview" | "ready" | "previewFailed" | "installed"
            )
        {
            return Err("Preview belongs to an outdated build".into());
        }
        self.verified_directory(&project, false)?;
        // What the document itself reported is kept with the verdict: a page that threw
        // before presenting itself still has to explain why the run failed.
        let logs: Vec<String> = logs
            .into_iter()
            .filter(|line| !line.trim().is_empty())
            .take(20)
            .map(|line| line.chars().take(300).collect())
            .collect();
        self.change(id, |p| {
            p.tested = error.is_none();
            p.self_checked = error.is_none();
            if let Some(build) = p.builds.iter_mut().find(|b| b.version == version) {
                build.verified = error.is_none();
            }
            p.status = if error.is_none() {
                "ready"
            } else {
                "previewFailed"
            }
            .into();
            p.error = error.map(|e| e.chars().take(1000).collect());
            if !logs.is_empty() {
                p.runtime_logs = logs;
            }
        })
        .await?;
        Ok(())
    }
    /// One self-check: build what the agent has accepted, run it against the task's sample
    /// in a preview window, wait for the page's own verdict, and photograph the result. The
    /// agent reads this inside its run, so a failing render is something it can fix without
    /// the user relaying anything.
    async fn probe(
        &self,
        id: &str,
        tool: &Package,
        output: Option<Output>,
    ) -> Result<ProbeOutcome, String> {
        let Some(output) = output else {
            return Ok(ProbeOutcome {
                ok: false,
                error: None,
                logs: Vec::new(),
                image: None,
                note: Some(
                    "还没有通过校验的插件文件：先写完三个文件并调用 validate，再调用 preview。"
                        .into(),
                ),
                limited: false,
            });
        };
        let project = self.get(id).await?;
        if project.sample.is_none() {
            return Ok(ProbeOutcome {
                ok: false,
                error: None,
                logs: Vec::new(),
                image: None,
                note: Some(
                    "这个任务没有样例文件，无法试运行。请在总结里说明没有做运行验证，也不要声称预览通过。"
                        .into(),
                ),
                limited: false,
            });
        }
        self.build_candidate(id, tool, output)
            .await
            .map_err(|error| format!("构建候选版本失败：{error}"))?;
        let project = self.get(id).await?;
        let version = project.version;
        // A fresh session, so the verdict that arrives belongs to this run and not to a
        // window the user still has open on an older build.
        self.begin_preview(id).await?;
        let window = ProbeWindow {
            id: id.to_owned(),
            version,
            label: format!("workshop-preview-{id}-probe"),
            url: format!("index.html?workshopPreview={id}&tool={}", tool.manifest.id),
            title: format!("插件自检 · {}", project.name),
        };
        let label = window.label.clone();
        if let Err(error) = self.windows.show(window).await {
            return Ok(ProbeOutcome {
                ok: false,
                error: None,
                logs: Vec::new(),
                image: None,
                note: Some(format!("无法打开试运行窗口：{error}")),
                limited: false,
            });
        }
        let verdict = self.await_verdict(id, version, PROBE_TIMEOUT).await;
        let shot = self.windows.capture(label.clone()).await;
        let _ = self.windows.close(label).await;
        // The picture exists for the model's eyes only: the user opens the preview window
        // itself, and nothing about the frame is kept afterwards.
        let mut note = verdict.note();
        let image = match shot {
            Ok(bytes) if !bytes.is_empty() => Some(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &bytes,
            )),
            Ok(_) => None,
            Err(error) => {
                note = merge(note, format!("截图失败：{error}"));
                None
            }
        };
        let record = self.get(id).await?;
        Ok(ProbeOutcome {
            ok: verdict.passed(),
            error: verdict.error(),
            logs: record.runtime_logs,
            image,
            note,
            limited: false,
        })
    }
    /// Waits for the preview window to report itself. `presented` is what moves a build out
    /// of `awaitingPreview`, so the project's own state is the signal; nothing has to be
    /// handed around between the two windows.
    async fn await_verdict(&self, id: &str, version: u64, limit: Duration) -> ProbeVerdict {
        let deadline = tokio::time::Instant::now() + limit;
        loop {
            match self.get(id).await {
                Ok(project) if project.version != version => return ProbeVerdict::Stale,
                Ok(project) => match project.status.as_str() {
                    "ready" => return ProbeVerdict::Passed,
                    "previewFailed" => {
                        return ProbeVerdict::Failed(
                            project.error.unwrap_or_else(|| "预览未通过".into()),
                        )
                    }
                    "failed" | "cancelled" | "interrupted" => return ProbeVerdict::Stopped,
                    _ => {}
                },
                Err(_) => return ProbeVerdict::Gone,
            }
            if tokio::time::Instant::now() >= deadline {
                return ProbeVerdict::Timeout;
            }
            tokio::time::sleep(PROBE_TICK).await;
        }
    }
    pub async fn install(&self, id: &str, runtime: &Arc<Runtime>) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let project = self.get(id).await?;
        if !project.tested || !matches!(project.status.as_str(), "ready" | "installed") {
            return Err("Preview must succeed before installation / 请先完成试预览".into());
        }
        let directory = self.verified_directory(&project, true)?;
        let staging = tempfile::tempdir().map_err(|e| e.to_string())?;
        let package = ember_runtime::sharing::prepare(&directory, &staging.path().join("package"))?;
        self.verify_snapshot(&project, &package.directory)?;
        runtime
            .install_from(&package.directory, Some("generated".into()))
            .await?;
        self.change(id, |p| {
            p.status = "installed".into();
            p.installed_version = Some(p.version);
        })
        .await?;
        Ok(())
    }
    pub async fn export(&self, id: &str) -> Result<Vec<u8>, String> {
        let _operation = self.operations.lock().await;
        let project = self.get(id).await?;
        if !project.tested || !matches!(project.status.as_str(), "ready" | "installed") {
            return Err("Only a successfully previewed workshop build can be exported / 只能导出已通过试预览的工坊作品".into());
        }
        let directory = self.verified_directory(&project, true)?;
        let staging = tempfile::tempdir().map_err(|e| e.to_string())?;
        let package = ember_runtime::sharing::prepare(&directory, &staging.path().join("package"))?;
        self.verify_snapshot(&project, &package.directory)?;
        ember_runtime::sharing::export(&package.directory)
    }
    pub async fn restore(&self, id: &str) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        if self
            .tasks
            .lock()
            .await
            .get(id)
            .is_some_and(|task| !task.is_finished())
        {
            return Err("Cancel the active task before restoring a version".into());
        }
        let project = self.get(id).await?;
        let previous = project
            .builds
            .iter()
            .rev()
            .find(|build| build.verified && build.version < project.version)
            .ok_or("No earlier verified build is available")?;
        let mut restored = project.clone();
        restored.version = previous.version;
        let previous_directory = self.verified_directory(&restored, true)?;
        let mut version = project.version + 1;
        while self.directory(id)?.join(format!("v{version}")).exists() {
            version += 1;
        }
        let directory = self.directory(id)?.join(format!("v{version}"));
        let mut package = ember_runtime::sharing::prepare(&previous_directory, &directory)?;
        self.verify_snapshot(&restored, &directory)?;
        package.manifest.version = "0.1.0".into();
        write_json(&directory.join("plugin.json"), &package.manifest)?;
        let record = BuildRecord {
            version,
            sdk_fingerprint: previous.sdk_fingerprint.clone(),
            artifact_fingerprint: ember_runtime::sharing::fingerprint(&directory)?,
            verified: false,
            summary: format!(
                "Restored build {} / 已恢复之前的已验证构建",
                previous.version
            ),
        };
        self.change(id, |p| {
            p.version = version;
            p.builds.push(record);
            p.tested = false;
            p.error = None;
            p.status = "awaitingPreview".into();
        })
        .await?;
        Ok(())
    }
    fn verify_snapshot(&self, project: &Project, directory: &Path) -> Result<(), String> {
        let record = project
            .builds
            .iter()
            .find(|b| b.version == project.version)
            .ok_or("Missing build record")?;
        if ember_runtime::sharing::fingerprint(directory)? != record.artifact_fingerprint {
            return Err("Build files changed after validation; rebuild before continuing".into());
        }
        Ok(())
    }
    fn verified_directory(
        &self,
        project: &Project,
        require_preview: bool,
    ) -> Result<PathBuf, String> {
        let record = project
            .builds
            .iter()
            .find(|b| b.version == project.version)
            .ok_or("Rebuild this project to record its development kit and artifact identity")?;
        if record.sdk_fingerprint != sdk_fingerprint() {
            return Err("Host SDK changed; rebuild and preview this project before installation or sharing / SDK 已更新，请重建并试预览".into());
        }
        if require_preview && !record.verified {
            return Err("This build has not passed preview".into());
        }
        let directory = self
            .directory(&project.id)?
            .join(format!("v{}", project.version));
        if ember_runtime::sharing::fingerprint(&directory)? != record.artifact_fingerprint {
            return Err("Build files changed after validation; rebuild before continuing".into());
        }
        Ok(directory)
    }
}
/// What a self-check saw the preview do.
enum ProbeVerdict {
    Passed,
    Failed(String),
    Timeout,
    Stale,
    Stopped,
    Gone,
}
impl ProbeVerdict {
    fn passed(&self) -> bool {
        matches!(self, ProbeVerdict::Passed)
    }
    fn error(&self) -> Option<String> {
        match self {
            ProbeVerdict::Failed(error) => Some(error.chars().take(1000).collect()),
            _ => None,
        }
    }
    fn note(&self) -> Option<String> {
        match self {
            ProbeVerdict::Passed | ProbeVerdict::Failed(_) => None,
            ProbeVerdict::Timeout => Some(format!(
                "试运行在 {} 秒内没有报告结果：页面可能没有启动，或者没有在渲染完成后调用 presented()。",
                PROBE_TIMEOUT.as_secs()
            )),
            ProbeVerdict::Stale => Some("试运行期间这个任务的版本被改变了。".into()),
            ProbeVerdict::Stopped => Some("任务在试运行期间被停止。".into()),
            ProbeVerdict::Gone => Some("任务在试运行期间被删除。".into()),
        }
    }
}
fn merge(note: Option<String>, extra: String) -> Option<String> {
    Some(match note {
        Some(note) => format!("{note} {extra}"),
        None => extra,
    })
}
/// The plugin id a workshop task installs under. Written once here so removal and
/// installation can never disagree about it.
/// Unix seconds, the one clock turns and log entries share.
fn clock() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn generated_id(id: &str) -> String {
    format!("user.{id}")
}
/// What to call a task before the model has named the plugin: the user's own words when
/// there are any, otherwise the sample they attached.
fn task_name(requirement: &str, sample: Option<&str>) -> String {
    if let Some(line) = requirement
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
    {
        return line.chars().take(40).collect();
    }
    sample
        .and_then(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "新插件任务".into())
}
/// The sample a run is about, as data for the model. The extension is the one fact the
/// host enforces: a preview only ever opens for files the plugin declares.
fn sample_context(project: &Project) -> Value {
    if project.sample.is_none() && project.extension.is_empty() {
        return Value::Null;
    }
    json!({
        "name": project.sample.as_deref().and_then(|path| Path::new(path).file_name()).map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
        "extension": project.extension,
        "size": project.sample_size,
    })
}
/// The conversation of a project written before tasks kept one.
fn migrated(project: &Project) -> Vec<Turn> {
    let mut turns: Vec<Turn> = project
        .messages
        .iter()
        .filter(|text| !text.trim().is_empty())
        .map(|text| Turn {
            role: "user".into(),
            text: text.clone(),
            streaming: false,
            started_at: 0,
            ended_at: 0,
            events: Vec::new(),
        })
        .collect();
    if let Some(text) = project
        .legacy_outputs
        .iter()
        .rev()
        .find_map(|output| output["text"].as_str())
        .filter(|text| !text.trim().is_empty())
    {
        turns.push(Turn {
            role: "assistant".into(),
            text: text.to_owned(),
            streaming: false,
            started_at: 0,
            ended_at: 0,
            events: Vec::new(),
        });
    }
    turns
}
fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn sdk_fingerprint() -> String {
    fingerprint(format!("api:1/tool:1\n{SDK}\n{UI}").as_bytes())
}
fn credential_scope(config: &Config, url: &reqwest::Url) -> String {
    if config.id == "default" {
        url.to_string()
    } else {
        format!("{}|{}", config.id, url)
    }
}
fn service_key(config: &Config) -> Result<String, String> {
    let url = endpoint(config)?;
    let scope = credential_scope(config, &url);
    if matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")) {
        Ok(crate::credentials::read(&scope).unwrap_or_default())
    } else {
        crate::credentials::read(&scope).map_err(|_| "请先为当前供应商保存 API Key".into())
    }
}

/// Spelling of the per-response output budget. Services disagree: older
/// compatibility layers take `max_tokens`, current OpenAI models require
/// `max_completion_tokens`, and reasoning models reject a budget entirely.
#[derive(Clone, Copy, PartialEq)]
enum Budget {
    MaxTokens,
    MaxCompletionTokens,
    Omitted,
}
impl Budget {
    fn field(self) -> Option<&'static str> {
        match self {
            Budget::MaxTokens => Some("max_tokens"),
            Budget::MaxCompletionTokens => Some("max_completion_tokens"),
            Budget::Omitted => None,
        }
    }
    fn fallback(self) -> Option<Self> {
        match self {
            Budget::MaxTokens => Some(Budget::MaxCompletionTokens),
            Budget::MaxCompletionTokens => Some(Budget::Omitted),
            Budget::Omitted => None,
        }
    }
}

/// Requests that do not care about the exact budget still have to survive a
/// service that refuses the budget parameter outright.
async fn request_service(config: &Config, key: &str, messages: Value) -> Result<Value, String> {
    let mut field = Budget::MaxTokens;
    let mut budget = Some(budget_ceiling(config));
    loop {
        match request_chat(config, key, messages.clone(), budget, field).await {
            Err(error) if rejects_budget(&error) => match field.fallback() {
                Some(next) => {
                    field = next;
                    if next == Budget::Omitted {
                        budget = None;
                    }
                }
                None => return Err(error),
            },
            result => return result,
        }
    }
}

async fn request_chat(
    config: &Config,
    key: &str,
    messages: Value,
    max_tokens: Option<u32>,
    budget: Budget,
) -> Result<Value, String> {
    if config.model.trim().is_empty() {
        return Err("请先选择或输入模型 ID，再保存配置".into());
    }
    let url = endpoint(config)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(
            config.timeout_seconds.unwrap_or(120).clamp(10, 900) as u64,
        ))
        .build()
        .map_err(|e| e.to_string())?;
    let mut body = json!({"model":config.model,"messages":messages});
    if let (Some(field), Some(max)) = (budget.field(), max_tokens) {
        body[field] = json!(max);
    }
    if let Some(temperature) = config.temperature {
        body["temperature"] = json!(temperature);
    }
    let request = client.post(url).json(&body);
    let request = if key.is_empty() {
        request
    } else {
        request.bearer_auth(key)
    };
    read_response(request.send().await.map_err(|e| e.to_string())?)
        .await
        .map_err(|e| redact_service_error(e, key))
}
/// Detects a service that refuses the output-budget parameter or the value it
/// carries, so generation can drop it and use the service default instead.
/// Only a rejection counts: a 401 or a rate limit mentioning the same word must
/// keep its own error instead of being retried as a parameter problem.
fn rejects_budget(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    (error.contains("http 400") || error.contains("http 422"))
        && (error.contains("max_tokens")
            || error.contains("max_completion_tokens")
            || error.contains("max output"))
}
fn budget_ceiling(config: &Config) -> u32 {
    let limits = crate::model_catalog::limits(&config.model);
    let reference = limits.as_ref().map_or(32_768, |limits| limits.output);
    // A configured window wins, otherwise the reference window of the model keeps
    // the retry budget from being grown past what the model can actually accept.
    let context = limits.as_ref().map(|limits| limits.context);
    let ceiling = match context {
        Some(context) => reference.min(context.saturating_sub(2_048).max(1_024)),
        None => reference,
    };
    ceiling.clamp(1_024, 131_072)
}
fn redact_service_error(error: String, key: &str) -> String {
    let safe = if key.is_empty() {
        error
    } else {
        error.replace(key, "[redacted]")
    };
    safe.chars().take(1200).collect()
}
async fn read_response(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|size| size > 512 * 1024)
    {
        return Err("Model response exceeds 512 KiB".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if body.len() + chunk.len() > 512 * 1024 {
            return Err("Model response exceeds 512 KiB".into());
        }
        body.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    if !status.is_success() {
        let message = value["error"]["message"]
            .as_str()
            .or_else(|| value["message"].as_str())
            .unwrap_or_default();
        let hint = match status.as_u16() {
            401 => "密钥无效或已过期",
            403 => "当前密钥或套餐无权使用所选模型",
            429 => "服务限流、额度不足或上游暂不可用",
            _ => "请求失败",
        };
        return Err(format!(
            "{hint}（HTTP {status}）{}",
            if message.is_empty() {
                String::new()
            } else {
                format!("：{message}")
            }
        ));
    }
    if value.is_null() {
        return Err("服务未返回有效 JSON，请检查 API 地址".into());
    }
    Ok(value)
}
fn valid_id(id: &str) -> bool {
    id.len() <= 64
        && id.starts_with('p')
        && id[1..].bytes().all(|b| b.is_ascii_digit())
        && id.len() > 1
}
fn endpoint(config: &Config) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(&config.endpoint).map_err(|_| "Invalid API endpoint")?;
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
    {
        return Err("Use HTTPS or a local HTTP endpoint".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || config.model.len() > 200
        || config.id.is_empty()
        || config.id.len() > 64
        || !config
            .id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || config.name.len() > 100
        || config.preset.len() > 40
        || !config
            .preset
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid API configuration".into());
    }
    validate_limits(config)?;
    let path = url.path().trim_end_matches('/');
    if !path.ends_with("/chat/completions") {
        url.set_path(&format!("{path}/chat/completions"));
    }
    Ok(url)
}
/// Only user-facing sampling and transport settings are validated. Legacy
/// output/context limits must not prevent automatically managed generation.
fn validate_limits(config: &Config) -> Result<(), String> {
    if let Some(temperature) = config.temperature {
        if !(0.0..=2.0).contains(&temperature) {
            return Err("温度需在 0 到 2 之间".into());
        }
    }
    if let Some(timeout) = config.timeout_seconds {
        if !(10..=900).contains(&timeout) {
            return Err("请求超时需在 10 到 900 秒之间".into());
        }
    }
    Ok(())
}
fn parse_output(text: &str, files: &[String]) -> Result<Output, String> {
    let text = text.trim();
    let text = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```"))
        .and_then(|text| text.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(text);
    let output: Output = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if output.name.is_empty()
        || output.name.len() > 160
        || output.summary.len() > 4000
        || output.javascript.len() > 128 * 1024
        || output.css.len() > 32 * 1024
    {
        return Err("Output exceeds field limits".into());
    }
    if output.extension.is_empty()
        || output.extension.len() > 32
        || !output.extension.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err("Invalid file extension".into());
    }
    if !crate::icons::contains(&output.icon) {
        return Err("Unknown Lucide icon. Use a canonical icon such as box, file-text, image, table, music or film".into());
    }
    validate_javascript(&output.javascript, files)?;
    // This is diagnostic lint, not the security boundary (the sandbox and CSP are).
    for forbidden in [
        "eval(",
        "new Function",
        "import(",
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "https://",
        "http://",
    ] {
        if output.javascript.contains(forbidden) || output.css.contains(forbidden) {
            return Err(format!("Unsupported code: {forbidden}"));
        }
    }
    Ok(output)
}

/// Files the host writes into every package, so an agent may neither write nor shadow them.
const HOST_FILES: [&str; 4] = ["index.html", "sdk.js", "sdk-ui.css", "boot.js"];
/// A path the agent may write. `metadata.json` is the plugin's own record; everything else
/// lives under `ui/` (the page) or `vendor/` (libraries it brings), which is what gets
/// packaged. The host's own files are refused: they are already there.
fn writable(path: &str) -> Result<(), String> {
    if path == "metadata.json" {
        return Ok(());
    }
    let Some(page) = path.strip_prefix("ui/") else {
        return Err(format!(
            "{path}：页面在 ui/ 下，插件文件也要写在那里（ui/… 或 ui/vendor/…）"
        ));
    };
    let parts: Vec<&str> = page.split('/').collect();
    let shaped = match parts.as_slice() {
        [leaf] => safe_segment(leaf),
        ["vendor", leaf] => safe_segment(leaf),
        _ => false,
    };
    if !shaped {
        return Err(format!("{path}：只能写 ui/<文件名> 或 ui/vendor/<文件名>"));
    }
    if HOST_FILES.contains(&parts[parts.len() - 1]) {
        return Err(format!("{path}：这个文件由宿主生成，不要覆盖"));
    }
    Ok(())
}
/// A path segment of a package file: no separators, no traversal, no drive letters.
fn safe_segment(part: &str) -> bool {
    !part.is_empty()
        && !part.starts_with('.')
        && part
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
}
/// Joins a package-relative name under `root`, refusing anything that could leave it. Unlike
/// `manifest::contained`, the file is not required to exist yet: this is a destination.
fn destination(root: &Path, name: &str) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    for part in name.split('/') {
        if !safe_segment(part) {
            return Err(format!("{name}：路径不合法"));
        }
        path = path.join(part);
    }
    Ok(path)
}
/// An import has to name a file the package will carry. Relative only: a bare specifier has
/// nothing to resolve it here, and the host's own sources are not a plugin's to reach for.
fn writable_import(name: &str, files: &[String]) -> Result<(), String> {
    let path = name
        .strip_prefix("./")
        .ok_or_else(|| format!("只能 import 包内文件（./…）；{name} 在这里没有来源"))?;
    if path.contains("..") {
        return Err(format!("{name}：import 不能离开插件包"));
    }
    if path == "sdk.js" || files.iter().any(|file| file == path) {
        return Ok(());
    }
    Err(format!(
        "{name}：插件包里没有这个文件；把库放进 ui/ 或 vendor/ 再引用。包里现有：{}",
        files.join(" ")
    ))
}
/// The files a package will carry, named the way an import from the page sees them: the
/// host's own and whatever the agent has written so far. `dependencies.json` is the host's
/// record of where those libraries came from, not something a page imports.
fn package_files(draft: &Path) -> Vec<String> {
    let mut files: Vec<String> = HOST_FILES
        .iter()
        .map(|name| (*name).to_owned())
        .chain(["view.js".to_owned(), "style.css".to_owned()])
        .collect();
    // The draft mirrors the package, except that the page lives at the package root.
    for name in draft_files(draft) {
        if name == "dependencies.json" {
            continue;
        }
        files.push(name.strip_prefix("ui/").unwrap_or(&name).to_owned());
    }
    files.sort();
    files.dedup();
    files
}
/// The files a draft holds, as package-relative names ("ui/view.js", "vendor/lib.js").
fn draft_files(draft: &Path) -> Vec<String> {
    let mut files = Vec::new();
    collect_files(draft, draft, &mut files);
    files.retain(|name| name != "metadata.json");
    files.sort();
    files
}
fn collect_files(root: &Path, directory: &Path, files: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, files);
            continue;
        }
        let Ok(name) = path.strip_prefix(root) else {
            continue;
        };
        let name = name.to_string_lossy().replace('\\', "/");
        if name != "metadata.json" {
            files.push(name);
        }
    }
}
fn validate_javascript(source: &str, files: &[String]) -> Result<(), String> {
    use oxc_ast::ast::{CallExpression, Expression, Statement};
    use oxc_ast_visit::{walk::walk_call_expression, Visit};
    let allocator = oxc_allocator::Allocator::default();
    let parsed = oxc_parser::Parser::new(&allocator, source, oxc_span::SourceType::mjs()).parse();
    if !parsed.errors.is_empty() {
        return Err(format!(
            "JavaScript syntax: {:?}",
            parsed.errors.iter().take(3).collect::<Vec<_>>()
        ));
    }
    struct InvalidReadyCall(bool);
    impl<'a> Visit<'a> for InvalidReadyCall {
        fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
            if matches!(&call.callee, Expression::Identifier(identifier) if identifier.name == "ready")
            {
                self.0 = true;
            }
            walk_call_expression(self, call);
        }
    }
    let mut invalid_ready = InvalidReadyCall(false);
    invalid_ready.visit_program(&parsed.program);
    if invalid_ready.0 {
        return Err(
            "SDK ready is a Promise: use `const init = await ready`, never `ready()`".into(),
        );
    }
    if [
        "createElement('button')",
        "createElement(\"button\")",
        "createElement(`button`)",
        "<button",
    ]
    .iter()
    .any(|pattern| source.contains(pattern))
    {
        return Err("功能按钮必须通过 SDK controls 声明，由宿主工具栏统一渲染；不要在预览 DOM 中创建 button".into());
    }
    let mut sdk = false;
    for statement in &parsed.program.body {
        match statement {
            Statement::ImportDeclaration(import) => {
                let name = import.source.value.as_str();
                if name == "./sdk.js" {
                    sdk = true;
                } else {
                    writable_import(name, files)?;
                }
            }
            Statement::ExportAllDeclaration(_)
            | Statement::ExportNamedDeclaration(_)
            | Statement::ExportDefaultDeclaration(_) => {
                return Err("The viewer entry must not re-export modules".into())
            }
            _ => {}
        }
    }
    if !sdk {
        return Err("Import the host SDK".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    /// A requirement a user might type when they drop a file. It deliberately names no
    /// format and no library: the sample in the project context is what decides both.
    const DROP_PROMPT: &str = "为这个文件做一个能看清内容的只读预览。";
    /// A six-line ASCII FBX triangle, the same shape the node side pins down.
    const ASCII_FBX: &str = "; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n\tFBXVersion: 7400\n}\nObjects:  {\n\tGeometry: 1, \"Geometry::Triangle\", \"Mesh\" {\n\t\tVertices: *9 {\n\t\t\ta: 0,0,0,1,0,0,0,1,0\n\t\t}\n\t\tPolygonVertexIndex: *3 {\n\t\t\ta: 0,1,-3\n\t\t}\n\t}\n\tModel: 2, \"Model::Triangle\", \"Mesh\" {\n\t\tVersion: 232\n\t}\n}\nConnections:  {\n\tC: \"OO\",1,2\n\tC: \"OO\",2,0\n}\n";
    /// Real-provider check of the two things a user actually hits: the format of the
    /// dropped sample decides the plugin, and the output budget never fails the task on
    /// its own. Nothing here runs without COMMAND_CODE_URL and COMMAND_CODE_APIKEY.
    #[tokio::test]
    #[ignore = "Explicit real-provider check using COMMAND_CODE_URL and COMMAND_CODE_APIKEY"]
    async fn live_provider_follows_the_dropped_format_and_output_budget() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        let tool = live_tool(&temp.path().join("tool"));
        let config = Config {
            id: "live".into(),
            name: "Live provider".into(),
            endpoint: std::env::var("COMMAND_CODE_URL").expect("Missing test URL"),
            model: std::env::var("COMMAND_CODE_MODEL")
                .unwrap_or_else(|_| "deepseek/deepseek-v4.1-flash".into()),
            ..Config::default()
        };
        workshop
            .configure(
                config.clone(),
                Some(std::env::var("COMMAND_CODE_APIKEY").expect("Missing test key")),
            )
            .await
            .unwrap();
        // A text file must stay a text plugin: what the sample is decides the plugin, and
        // nothing in the instructions suggests a library for it.
        let cases = [
            ("notes.txt", b"alpha, beta\n1, 2\n".to_vec()),
            ("triangle.fbx", ASCII_FBX.as_bytes().to_vec()),
        ];
        for (name, bytes) in cases {
            let project = workshop
                .create(
                    DROP_PROMPT.into(),
                    Some(sample_file(temp.path(), name, &bytes)),
                )
                .await
                .unwrap();
            workshop
                .start(project.id.clone(), String::new(), tool.clone(), false)
                .await
                .unwrap();
            let done = settle(&workshop, &project.id, 300).await;
            println!(
                "[{name}] status={} extension={} error={:?} logs={:?}",
                done.status, done.extension, done.error, done.logs
            );
            assert_eq!(done.status, "awaitingPreview", "{name}: {:?}", done.error);
            let root = workshop
                .directory(&project.id)
                .unwrap()
                .join(format!("v{}", done.version));
            let javascript = std::fs::read_to_string(root.join("ui/view.js")).unwrap();
            let manifest: Value =
                serde_json::from_slice(&std::fs::read(root.join("plugin.json")).unwrap()).unwrap();
            assert_eq!(manifest["extensions"][0], done.extension);
            println!("[{name}] javascript={} bytes", javascript.len());
        }
        workshop.remove_provider(&config.id).await.unwrap();
    }
    fn live_tool(directory: &Path) -> Package {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let market = root.join(".marketplace");
        let mut packages: Vec<_> = std::fs::read_dir(&market)
            .expect("Run npm run plugins:build first")
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("ember.workshop-0.1.0-")
                    && e.path().extension().is_some_and(|v| v == "zip")
            })
            .collect();
        packages.sort_by_key(|e| e.metadata().unwrap().modified().unwrap());
        ember_runtime::sharing::prepare(
            &packages
                .last()
                .expect("Build workshop package first")
                .path(),
            directory,
        )
        .unwrap();
        Package::load(directory).unwrap()
    }
    #[tokio::test]
    #[ignore = "Explicit real-provider check using COMMAND_CODE_URL and COMMAND_CODE_APIKEY"]
    async fn configured_live_provider_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().to_owned());
        let config = Config {
            id: format!(
                "probe-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ),
            name: "Temporary connection test".into(),
            endpoint: std::env::var("COMMAND_CODE_URL").expect("Missing test URL"),
            model: "meituan/LongCat-2.0:free".into(),
            max_tokens: Some(256),
            ..Config::default()
        };
        let id = config.id.clone();
        workshop
            .configure(
                config,
                Some(std::env::var("COMMAND_CODE_APIKEY").expect("Missing test key")),
            )
            .await
            .unwrap();
        let result = async {
            let models = workshop.models().await?;
            if models.is_empty() {
                return Err("Empty models list".into());
            }
            workshop.test_connection().await
        }
        .await;
        workshop
            .remove_provider(&id)
            .await
            .expect("Temporary credential cleanup failed");
        assert!(result.is_ok(), "{}", result.unwrap_err());
    }
    #[tokio::test]
    async fn provider_permission_errors_include_reason_and_redact_credentials() {
        let body = json!({"error":{"message":"MODEL_NOT_IN_PLAN token=secret-token"}}).to_string();
        let (config, server) = mock_http(format!(
            "HTTP/1.1 403 Forbidden\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ));
        let error = request_service(&config, "secret-token", json!([]))
            .await
            .unwrap_err();
        assert!(error.contains("MODEL_NOT_IN_PLAN"));
        assert!(!error.contains("secret-token"));
        server.join().unwrap();
    }
    fn mock_http(response: String) -> (Config, std::thread::JoinHandle<String>) {
        mock_responses(vec![response])
    }
    fn mock_responses(responses: Vec<String>) -> (Config, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let thread = std::thread::spawn(move || {
            let mut requests = String::new();
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    let count = stream.read(&mut chunk).unwrap();
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..count]);
                    if let Some(header_end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&request[..header_end]);
                        let length: usize = headers
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|n| n.trim().parse().unwrap())
                            })
                            .unwrap_or(0);
                        if request.len() >= header_end + 4 + length {
                            break;
                        }
                    }
                }
                stream.write_all(response.as_bytes()).unwrap();
                requests.push_str(&String::from_utf8(request).unwrap());
            }
            requests
        });
        (
            Config {
                endpoint: format!("http://{address}/v1"),
                model: "test-model".into(),
                ..Config::default()
            },
            thread,
        )
    }
    fn json_response(value: Value) -> String {
        let body = value.to_string();
        format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }
    fn error_response(status: &str, message: &str) -> String {
        let body = json!({"error":{"message":message}}).to_string();
        format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }
    /// Waits for a project's task, then returns the project even on timeout so a
    /// failing run still reports the state and diagnostics it reached.
    async fn settle(workshop: &Arc<Workshop>, id: &str, seconds: u64) -> Project {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(seconds);
        while tokio::time::Instant::now() < deadline {
            let running = workshop
                .tasks
                .lock()
                .await
                .get(id)
                .is_some_and(|task| !task.is_finished());
            if !running {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        workshop.get(id).await.unwrap()
    }
    #[test]
    fn the_settings_payload_round_trips_and_older_configs_still_load() {
        // Exactly the shape the settings page sends, and the shape it reads back.
        let config: Config = serde_json::from_value(json!({
            "id": "provider-1", "preset": "deepseek", "name": "我的 DeepSeek",
            "endpoint": "https://api.deepseek.com/v1", "model": "deepseek-chat",
            "maxTokens": null, "contextWindow": 131_072, "temperature": null, "timeoutSeconds": 900
        }))
        .unwrap();
        assert_eq!(config.preset, "deepseek");
        assert_eq!(config.max_tokens, None);
        assert_eq!(config.context_window, Some(131_072));
        assert_eq!(config.timeout_seconds, Some(900));
        let state = serde_json::to_value(&config).unwrap();
        assert_eq!(state["maxTokens"], Value::Null);
        assert_eq!(state["contextWindow"], json!(131_072));
        assert_eq!(state["timeoutSeconds"], json!(900));
        // A config saved before presets and context windows existed keeps its budget.
        let legacy: Config = serde_json::from_value(json!({
            "id": "default", "name": "", "endpoint": "https://example.test/v1",
            "model": "model", "maxTokens": 12000
        }))
        .unwrap();
        assert_eq!(legacy.max_tokens, Some(12_000));
        assert!(legacy.context_window.is_none() && legacy.preset.is_empty());
    }
    #[test]
    fn an_incomplete_tool_package_is_refused_with_an_actionable_error() {
        let temp = tempfile::tempdir().unwrap();
        let tool = tool(&temp.path().join("tool"));
        std::fs::write(tool.directory.join("ui/agent.md"), "Generate").unwrap();
        write_json(
            &tool.directory.join("ui/development-kit.json"),
            &json!({"api":1,"prompt":"agent.md","analysisPrompt":"analysis.md"}),
        )
        .unwrap();
        // The package has no ui/analysis.md, so the task must be refused before any request.
        let error = kit(&tool)
            .err()
            .expect("incomplete package must be refused");
        assert!(error.contains("ui/analysis.md"), "{error}");
        assert!(error.contains("重新安装"), "{error}");
        std::fs::write(tool.directory.join("ui/analysis.md"), b"Analyze").unwrap();
        assert!(kit(&tool).map(|_| ()).is_ok());
    }
    /// A package built before the workshop pulled libraries declares the ones it shipped.
    /// It still starts: those fields are read and ignored, not a parse error.
    #[test]
    fn a_package_that_still_declares_bundled_libraries_starts() {
        let temp = tempfile::tempdir().unwrap();
        let tool = tool(&temp.path().join("tool"));
        std::fs::write(tool.directory.join("ui/agent.md"), "Generate").unwrap();
        std::fs::write(tool.directory.join("ui/analysis.md"), "Analyze").unwrap();
        write_json(
            &tool.directory.join("ui/development-kit.json"),
            &json!({"api":1,"prompt":"agent.md","analysisPrompt":"analysis.md","assets":["model.js"],"modules":{"model.js":"Scene kit"}}),
        )
        .unwrap();
        assert!(kit(&tool).map(|_| ()).is_ok());
    }
    #[tokio::test]
    async fn an_unset_output_budget_is_never_invented() {
        let (config, request) = mock_http(json_response(
            json!({"choices":[{"message":{"content":"OK"}}]}),
        ));
        assert!(config.max_tokens.is_none());
        request_service(&config, "", json!([{"role":"user","content":"test"}]))
            .await
            .unwrap();
        let request = request.join().unwrap().to_lowercase();
        assert!(request.contains("max_tokens"));
        assert!(!request.contains("max_completion_tokens"));
    }
    #[tokio::test]
    async fn a_service_that_rejects_the_budget_parameter_still_answers() {
        let (mut config, server) = mock_responses(vec![
            error_response(
                "400 Bad Request",
                "Unsupported parameter: 'max_tokens' is not supported with this model.",
            ),
            error_response(
                "400 Bad Request",
                "Unsupported parameter: 'max_completion_tokens'.",
            ),
            json_response(json!({"choices":[{"message":{"content":"OK"}}]})),
        ]);
        config.max_tokens = Some(4096);
        let response = request_service(&config, "key", json!([{"role":"user","content":"test"}]))
            .await
            .unwrap();
        assert_eq!(response["choices"][0]["message"]["content"], "OK");
        let requests = server.join().unwrap();
        let sent = requests.to_lowercase();
        assert!(sent.contains("\"max_tokens\":32768"));
        assert!(sent.contains("\"max_completion_tokens\":32768"));
        assert_eq!(requests.matches("POST /v1/chat/completions ").count(), 3);
    }
    #[test]
    fn legacy_output_limits_do_not_block_automatic_generation() {
        let config = |max_tokens, context_window| Config {
            endpoint: "https://example.test/v1".into(),
            model: "model".into(),
            max_tokens,
            context_window,
            ..Config::default()
        };
        assert!(endpoint(&config(Some(4096), Some(131_072))).is_ok());
        assert!(endpoint(&config(None, Some(131_072))).is_ok());
        assert!(endpoint(&config(Some(131_072), Some(131_072))).is_ok());
        assert!(endpoint(&config(Some(64), None)).is_ok());
        assert!(endpoint(&config(Some(4096), Some(512))).is_ok());
    }
    #[test]
    fn the_reference_output_limit_scales_the_retry_ceiling() {
        let config = |max_tokens: Option<u32>, context_window: Option<u32>, model: &str| Config {
            endpoint: "https://example.test/v1".into(),
            model: model.into(),
            max_tokens,
            context_window,
            ..Config::default()
        };
        assert_eq!(budget_ceiling(&config(None, None, "unknown")), 32_768);
        assert_eq!(budget_ceiling(&config(None, None, "deepseek-chat")), 8_192);
        assert_eq!(
            budget_ceiling(&config(Some(65_536), None, "gpt-4o")),
            16_384
        );
    }
    /// The search engine is a setting, not a constant: it is saved next to the tasks, and a
    /// key never lands in that file — it belongs to the system credential store, which the
    /// page never sees either.
    #[test]
    fn the_search_engine_is_a_saved_setting_and_never_stores_a_key_in_a_file() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        assert!(!workshop.search_setting().configured());
        workshop
            .configure_search(
                crate::network::Engine {
                    provider: "searxng".into(),
                    endpoint: "https://searx.example/".into(),
                    key: Some("a-secret".into()),
                    results: 4,
                },
                false,
            )
            .unwrap();
        let stored = std::fs::read_to_string(temp.path().join("workshop/search.json")).unwrap();
        assert!(stored.contains("searx.example"), "{stored}");
        assert!(!stored.contains("a-secret"), "{stored}");
        let saved = workshop.search_setting();
        assert_eq!(saved.provider, "searxng");
        assert_eq!(saved.endpoint, "https://searx.example/");
        assert_eq!(saved.results, 4);
        assert!(saved.configured());
        // Only a provider this build knows, and only an address it can call, are accepted.
        for bad in [
            crate::network::Engine {
                provider: "unknown".into(),
                ..Default::default()
            },
            crate::network::Engine {
                provider: "searxng".into(),
                endpoint: "ftp://searx.example".into(),
                ..Default::default()
            },
            crate::network::Engine {
                provider: "searxng".into(),
                endpoint: "not a url".into(),
                ..Default::default()
            },
        ] {
            assert!(
                workshop.configure_search(bad, false).is_err(),
                "an engine that cannot work must be refused"
            );
        }
        // Turning it off leaves the built-in sources, which need no setting at all.
        workshop
            .configure_search(Default::default(), true)
            .unwrap();
        assert!(!workshop.search_setting().configured());
    }
    #[tokio::test]
    async fn provider_profiles_persist_and_models_can_be_loaded_before_selection() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().to_owned());
        let (mut config, server) = mock_http(json_response(
            json!({"data":[{"id":"model-b"},{"id":"model-a"},{"id":"model-a"}]}),
        ));
        config.model.clear();
        config.id = "custom-provider".into();
        config.name = "Local AI".into();
        workshop.configure(config.clone(), None).await.unwrap();
        assert_eq!(workshop.models().await.unwrap(), vec!["model-a", "model-b"]);
        assert!(server.join().unwrap().starts_with("GET /v1/models "));
        let mut other = config.clone();
        other.id = "second".into();
        other.model = "manual-model".into();
        workshop.configure(other, None).await.unwrap();
        workshop.select_provider(&config.id).await.unwrap();
        let reopened = service(temp.path().to_owned());
        assert_eq!(
            reopened.state().await["providers"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(reopened.state().await["config"]["id"], "custom-provider");
    }
    #[tokio::test]
    async fn draft_model_discovery_does_not_persist_or_select_the_provider() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().to_owned());
        let (mut draft, server) = mock_http(json_response(json!({"data":[{"id":"b"},{"id":"a"}]})));
        draft.id = "draft-provider".into();
        draft.model.clear();
        assert_eq!(
            workshop.models_for(draft, None).await.unwrap(),
            vec!["a", "b"]
        );
        assert!(server.join().unwrap().starts_with("GET /v1/models "));
        let state = workshop.state().await;
        assert!(state["providers"].as_array().unwrap().is_empty());
        assert!(state["config"]["endpoint"]
            .as_str()
            .unwrap_or_default()
            .is_empty());
    }
    #[tokio::test]
    async fn configured_provider_generates_builds_and_installs_without_a_zip_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        // The preview window answers itself, so the model's own self-check gets a verdict
        // and the run finishes on it instead of waiting for a person.
        let (workshop, _windows) = service_with_verdict(
            temp.path().join("workshop"),
            None,
            vec!["warn: nothing to warn about".into()],
        );
        let tool = live_tool(&temp.path().join("tool"));
        let calls = [
            (
                "write_file",
                json!({"path":"metadata.json","content":json!({"name":"Text","summary":"Read text","extension":"txt","icon":"file-text"}).to_string()}),
            ),
            // A library the agent wrote itself, imported by the page it wrote next.
            (
                "write_file",
                json!({"path":"ui/vendor/tiny.js","content":"export const tiny = 1;
"}),
            ),
            (
                "write_file",
                json!({"path":"ui/view.js","content":format!(
                    "import {{tiny}} from './vendor/tiny.js';
{}",
                    viewer().replace("from './sdk.js'", "from './sdk.js';
                void tiny")
                )}),
            ),
            ("write_file", json!({"path":"ui/style.css","content":""})),
            ("validate", json!({})),
            ("preview", json!({})),
        ];
        let responses=calls.into_iter().enumerate().map(|(index,(name,args))| {
            let chunk=json!({"id":"mock","object":"chat.completion.chunk","created":1,"model":"mock","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":format!("call_{index}"),"type":"function","function":{"name":name,"arguments":args.to_string()}}]},"finish_reason":null}]});
            let end=json!({"id":"mock","object":"chat.completion.chunk","created":1,"model":"mock","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]});
            let body=format!("data: {chunk}\n\ndata: {end}\n\ndata: [DONE]\n\n");
            format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len())
        }).collect();
        let (config, server) = mock_responses(responses);
        workshop.configure(config, None).await.unwrap();
        let project = workshop
            .create(
                "Read text".into(),
                Some(sample_file(temp.path(), "sample.txt", b"PRIVATE SAMPLE")),
            )
            .await
            .unwrap();
        workshop
            .start(project.id.clone(), String::new(), tool, false)
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                let running = workshop
                    .tasks
                    .lock()
                    .await
                    .get(&project.id)
                    .is_some_and(|task| !task.is_finished());
                if !running {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
        let generated = workshop.get(&project.id).await.unwrap();
        // The model's own trial run passed, so the build it made is the previewed one and
        // no second version was minted for the same files.
        assert_eq!(generated.status, "ready", "{:?}", generated.error);
        assert!(generated.tested);
        assert!(generated.self_checked);
        assert_eq!(generated.version, 1);
        assert_eq!(generated.runtime_logs, vec!["warn: nothing to warn about"]);
        // What the agent brought along is in the package it built, and importable from the
        // page it wrote.
        let package = workshop.directory(&project.id).unwrap().join("v1/ui");
        assert!(package.join("vendor/tiny.js").is_file());
        let requests = server.join().unwrap();
        assert!(!requests.contains("PRIVATE SAMPLE"));
        assert_eq!(requests.matches("POST /v1/chat/completions ").count(), 6);
        let runtime = Runtime::new(temp.path().join("installed")).unwrap();
        workshop.install(&project.id, &runtime).await.unwrap();
        assert_eq!(runtime.snapshot().await.plugins[0].origin, "generated");
        assert_eq!(workshop.get(&project.id).await.unwrap().status, "installed");
        assert!(workshop
            .export(&project.id)
            .await
            .unwrap()
            .starts_with(b"PK"));
    }
    #[tokio::test]
    async fn api_adapter_uses_the_configured_contract_without_real_credentials() {
        let body = json!({"choices":[{"message":{"content":"OK"}}]}).to_string();
        let (config, request) = mock_http(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()));
        let response = request_service(
            &config,
            "test-token",
            json!([{"role":"user","content":"test"}]),
        )
        .await
        .unwrap();
        assert_eq!(response["choices"][0]["message"]["content"], "OK");
        let request = request.join().unwrap();
        assert!(request.starts_with("POST /v1/chat/completions "));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer test-token"));
        assert!(request.contains("test-model"));
    }
    #[tokio::test]
    async fn api_redirects_are_not_followed_with_the_users_key() {
        let (config, request) = mock_http("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/other\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into());
        assert!(request_service(&config, "test-token", json!([]))
            .await
            .unwrap_err()
            .contains("302"));
        request.join().unwrap();
    }
    #[test]
    fn endpoint_rejects_credential_and_transport_leaks() {
        for url in [
            "http://example.com/v1",
            "https://key@example.com/v1",
            "https://example.com/v1?key=secret",
            "file:///x",
        ] {
            assert!(endpoint(&Config {
                endpoint: url.into(),
                model: "model".into(),
                ..Config::default()
            })
            .is_err());
        }
        assert_eq!(
            endpoint(&Config {
                endpoint: "http://127.0.0.1:1234/v1".into(),
                model: "model".into(),
                ..Config::default()
            })
            .unwrap()
            .as_str(),
            "http://127.0.0.1:1234/v1/chat/completions"
        );
    }
    #[tokio::test]
    async fn creation_is_persistent_and_paths_are_not_user_controlled() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().to_owned());
        let project = workshop.create("A viewer".into(), None).await.unwrap();
        assert!(workshop.directory("../outside").is_err());
        let reopened = service(temp.path().to_owned());
        assert_eq!(
            reopened.get(&project.id).await.unwrap().messages,
            vec!["A viewer"]
        );
        assert!(reopened.get(&project.id).await.unwrap().sample.is_none());
    }
    /// A sample the task references by path. The workshop takes samples as paths and never
    /// as bytes, so a test writes the file it wants the task to point at.
    fn sample_file(temp: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = temp.join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }
    fn output(javascript: &str) -> String {
        json!({"name":"Test viewer","summary":"Read-only text preview","extension":"txt","icon":"file-text","javascript":javascript,"css":"body { margin: 0 }"}).to_string()
    }
    fn viewer() -> &'static str {
        "import {ready,read,presented} from './sdk.js'; await ready; document.getElementById('app').textContent = 'Test'; await presented();"
    }
    fn tool(directory: &Path) -> Package {
        std::fs::create_dir_all(directory.join("ui")).unwrap();
        std::fs::create_dir_all(directory.join("bin")).unwrap();
        std::fs::write(
            directory.join("bin/bridge.exe"),
            b"test bridge - not executed",
        )
        .unwrap();
        std::fs::write(directory.join("ui/index.html"), "<!doctype html>").unwrap();
        write_json(&directory.join("plugin.json"), &json!({"api":1,"id":"test.workshop","name":"Workshop","version":"1.0.0","entry":"ui/index.html","executable":"bin/bridge.exe","capabilities":["controls"]})).unwrap();
        Package::load(directory).unwrap()
    }
    /// What the agent may write, and what an import may name.
    #[test]
    fn only_package_files_are_writable_and_importable() {
        for good in [
            "metadata.json",
            "ui/view.js",
            "ui/style.css",
            "ui/helper.js",
            "ui/vendor/tiny.js",
        ] {
            assert!(writable(good).is_ok(), "{good} should be writable");
        }
        for bad in [
            "../outside.js",
            "ui/../outside.js",
            "ui/vendor/../outside.js",
            "ui/deep/nested/file.js",
            "vendor/tiny.js",
            "bin/view.exe",
            "ui",
            "ui/",
            "ui/.hidden.js",
            "ui/index.html",
            "ui/sdk.js",
            "ui/sdk-ui.css",
            "ui/boot.js",
            "C:/absolute.js",
        ] {
            assert!(writable(bad).is_err(), "{bad} must be refused");
        }
        // An import has to be a relative path to a file the package carries.
        let files = vec!["sdk.js".to_string(), "vendor/tiny.js".to_string()];
        assert!(writable_import("./sdk.js", &files).is_ok());
        assert!(writable_import("./vendor/tiny.js", &files).is_ok());
        for bad in [
            "./missing.js",
            "../outside.js",
            "three",
            "https://cdn.test/three.js",
        ] {
            assert!(
                writable_import(bad, &files).is_err(),
                "{bad} must be refused"
            );
        }
        // A vendored file counts once the draft holds it.
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temp.path().join("vendor")).unwrap();
        std::fs::write(
            temp.path().join("vendor/tiny.js"),
            "export const x = 1;
",
        )
        .unwrap();
        std::fs::write(temp.path().join("metadata.json"), "{}").unwrap();
        let listed = package_files(temp.path());
        assert!(listed.contains(&"vendor/tiny.js".to_string()));
        assert!(!listed.contains(&"metadata.json".to_string()));
    }
    #[test]
    fn compilation_rejects_bad_syntax_and_unbundled_imports() {
        assert!(parse_output(&output(viewer()), &[]).is_ok());
        let wrong_ready = parse_output(
            &output("import {ready,presented} from './sdk.js'; ready().then(() => presented());"),
            &[],
        )
        .err()
        .expect("ready() must be rejected");
        assert!(wrong_ready.contains("ready is a Promise"), "{wrong_ready}");
        assert!(parse_output(
            &output("import {ready,presented} from './sdk.js'; const = ; presented();"),
            &[]
        )
        .is_err());
        assert!(parse_output(
            &output("import './sdk.js'; import 'missing-package'; presented();"),
            &[]
        )
        .is_err());
        assert!(parse_output(
            &output("import './sdk.js'; import './missing.js'; presented();"),
            &[]
        )
        .is_err());
        let custom_button = parse_output(
            &output("import {ready,presented} from './sdk.js'; await ready; document.getElementById('app').append(document.createElement('button')); await presented();"),
            &[],
        )
        .expect_err("generated viewers must use host controls");
        assert!(custom_button.contains("SDK controls"), "{custom_button}");
    }
    /// A pulled library is not a note on the side: the file the page imports and the record of
    /// where it came from both end up in the package, so an exported plugin can be traced back
    /// to what it was built from.
    #[tokio::test]
    async fn a_pulled_library_and_its_record_travel_with_the_package() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        let project = workshop
            .create(
                "Read text".into(),
                Some(sample_file(temp.path(), "sample.txt", b"SAMPLE")),
            )
            .await
            .unwrap();
        let draft = workshop.directory(&project.id).unwrap().join("draft");
        let vendor = draft.join("ui/vendor");
        std::fs::create_dir_all(&vendor).unwrap();
        std::fs::write(vendor.join("tiny.js"), "export const tiny = 1;\n").unwrap();
        std::fs::write(vendor.join("tiny-lib-LICENSE.txt"), "MIT").unwrap();
        let vendored = crate::libraries::Vendored {
            package: "tiny-lib".into(),
            version: "1.0.0".into(),
            integrity: "sha512-Zm9v".into(),
            files: vec![crate::libraries::VendoredFile {
                path: "dist/tiny.js".into(),
                name: "tiny.js".into(),
                bytes: 22,
            }],
            licence: Some("tiny-lib-LICENSE.txt".into()),
            notes: Vec::new(),
        };
        record_dependency(&draft, &vendored).unwrap();
        // Pulling a second file from the same version adds to that entry, not a new one.
        let mut more = vendored.clone();
        more.files = vec![crate::libraries::VendoredFile {
            path: "dist/extra.js".into(),
            name: "extra.js".into(),
            bytes: 22,
        }];
        record_dependency(&draft, &more).unwrap();
        let record: Value =
            serde_json::from_slice(&std::fs::read(draft.join("dependencies.json")).unwrap()).unwrap();
        let packages = record["packages"].as_array().unwrap();
        assert_eq!(packages.len(), 1, "{record}");
        assert_eq!(packages[0]["name"], "tiny-lib");
        assert_eq!(packages[0]["integrity"], "sha512-Zm9v");
        assert_eq!(packages[0]["licence"], "tiny-lib-LICENSE.txt");
        assert_eq!(packages[0]["files"].as_array().unwrap().len(), 2);
        // The page may import it, and the package carries both the file and the record.
        let page = format!(
            "import {{tiny}} from './vendor/tiny.js';\n{}",
            viewer().replace("from './sdk.js'", "from './sdk.js';\nvoid tiny")
        );
        let accepted = parse_output(&output(&page), &package_files(&draft)).unwrap();
        let tool = tool(&temp.path().join("tool"));
        workshop
            .build_candidate(&project.id, &tool, accepted)
            .await
            .unwrap();
        let built = workshop.directory(&project.id).unwrap().join("v1");
        assert!(built.join("ui/vendor/tiny.js").is_file());
        assert!(built.join("ui/vendor/tiny-lib-LICENSE.txt").is_file());
        let carried: Value =
            serde_json::from_slice(&std::fs::read(built.join("dependencies.json")).unwrap()).unwrap();
        assert_eq!(carried["packages"][0]["version"], "1.0.0");
        // `dependencies.json` is the host's record, not an import the page may name.
        assert!(!package_files(&draft).contains(&"dependencies.json".to_string()));
    }
    #[tokio::test]
    async fn only_exact_previewed_workshop_build_can_be_shared_and_imported() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        let project = workshop
            .create(
                "Read text".into(),
                Some(sample_file(temp.path(), "secret.txt", b"PRIVATE SAMPLE")),
            )
            .await
            .unwrap();
        let tool = tool(&temp.path().join("tool"));
        workshop
            .build_candidate(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).unwrap(),
            )
            .await
            .unwrap();
        assert!(
            workshop.export(&project.id).await.is_err(),
            "Build success is not preview success"
        );
        assert!(
            workshop
                .presented(&project.id, 99, "stale", None, Vec::new())
                .await
                .is_err(),
            "Stale view must not approve a build"
        );
        let preview = workshop.begin_preview(&project.id).await.unwrap();
        let previous_token = preview.preview_token.unwrap();
        let preview = workshop.begin_preview(&project.id).await.unwrap();
        assert!(workshop
            .presented(&project.id, 1, &previous_token, None, Vec::new())
            .await
            .is_err());
        workshop
            .presented(
                &project.id,
                1,
                preview.preview_token.as_deref().unwrap(),
                None,
                Vec::new(),
            )
            .await
            .unwrap();
        let bytes = workshop.export(&project.id).await.unwrap();
        let archive = temp.path().join("shared.zip");
        std::fs::write(&archive, &bytes).unwrap();
        let imported =
            ember_runtime::sharing::prepare(&archive, &temp.path().join("imported")).unwrap();
        assert_eq!(imported.manifest.id, format!("user.{}", project.id));
        assert!(!imported.directory.join("sample.txt").exists());
        assert!(!imported.directory.join("project.json").exists());
        let receiver = Runtime::new(temp.path().join("receiver")).unwrap();
        receiver
            .install_from(&imported.directory, Some("local".into()))
            .await
            .unwrap();
        assert_eq!(receiver.snapshot().await.plugins[0].origin, "local");
        std::fs::write(
            workshop
                .directory(&project.id)
                .unwrap()
                .join("v1/ui/view.js"),
            "tampered",
        )
        .unwrap();
        assert!(workshop.export(&project.id).await.is_err());
        assert!(workshop.install(&project.id, &receiver).await.is_err());
    }
    #[tokio::test]
    async fn restoring_a_verified_build_creates_a_new_version_requiring_preview() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        let project = workshop
            .create(
                "Read text".into(),
                Some(sample_file(temp.path(), "example.txt", b"Example")),
            )
            .await
            .unwrap();
        let tool = tool(&temp.path().join("tool"));
        workshop
            .build_candidate(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).unwrap(),
            )
            .await
            .unwrap();
        let preview = workshop.begin_preview(&project.id).await.unwrap();
        workshop
            .presented(
                &project.id,
                1,
                preview.preview_token.as_deref().unwrap(),
                None,
                Vec::new(),
            )
            .await
            .unwrap();
        workshop
            .build_candidate(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).unwrap(),
            )
            .await
            .unwrap();
        workshop.restore(&project.id).await.unwrap();
        let restored = workshop.get(&project.id).await.unwrap();
        assert_eq!(restored.version, 3);
        assert!(!restored.tested);
        assert!(workshop.export(&project.id).await.is_err());
        let preview = workshop.begin_preview(&project.id).await.unwrap();
        workshop
            .presented(
                &project.id,
                3,
                preview.preview_token.as_deref().unwrap(),
                None,
                Vec::new(),
            )
            .await
            .unwrap();
        assert!(workshop.export(&project.id).await.is_ok());
    }
    /// A window host for tests. It records what a self-check asked for and answers with a
    /// frame of its own making, so the loop can be exercised without a desktop; a responder
    /// task can then report itself the way the preview window does.
    #[derive(Clone, Default)]
    struct FakeWindows {
        shown: Arc<std::sync::Mutex<Vec<(String, u64)>>>,
        closed: Arc<std::sync::Mutex<Vec<String>>>,
        announce: Option<tokio::sync::mpsc::UnboundedSender<(String, u64)>>,
    }
    impl ProbeWindows for FakeWindows {
        fn show(
            &self,
            window: ProbeWindow,
        ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>> {
            let shown = self.shown.clone();
            let announce = self.announce.clone();
            let entry = (window.id.clone(), window.version);
            Box::pin(async move {
                shown.lock().unwrap().push(entry.clone());
                if let Some(announce) = announce {
                    let _ = announce.send(entry);
                }
                Ok(())
            })
        }
        fn capture(
            &self,
            _label: String,
        ) -> Pin<Box<dyn Future<Output = Result<Vec<u8>, String>> + Send>> {
            // A frame only has to be a PNG for the caller to pass it on; the pixels are
            // the capture module's business, not this test's.
            Box::pin(async move { Ok(b"\x89PNG\r\n\x1a\nfake-frame".to_vec()) })
        }
        fn close(&self, label: String) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>> {
            let closed = self.closed.clone();
            Box::pin(async move {
                closed.lock().unwrap().push(label);
                Ok(())
            })
        }
    }
    fn service(root: PathBuf) -> Arc<Workshop> {
        Workshop::new(root, Arc::new(FakeWindows::default())).unwrap()
    }
    /// A service whose self-check windows answer themselves, the way the preview window
    /// does when a page renders: `verdict` is what the page reports, `logs` what it says.
    fn service_with_verdict(
        root: PathBuf,
        verdict: Option<String>,
        logs: Vec<String>,
    ) -> (Arc<Workshop>, FakeWindows) {
        let (announce, mut waiting) = tokio::sync::mpsc::unbounded_channel();
        let windows = FakeWindows {
            announce: Some(announce),
            ..FakeWindows::default()
        };
        let workshop =
            Workshop::new(root, Arc::new(windows.clone())).expect("workshop should open");
        let responder = workshop.clone();
        tokio::spawn(async move {
            while let Some((id, version)) = waiting.recv().await {
                // Wait for the session the probe just opened, then report as the page does.
                let mut token = None;
                for _ in 0..400 {
                    match responder.get(&id).await {
                        Ok(project) if project.version == version => {
                            if let Some(value) = project.preview_token.clone() {
                                token = Some(value);
                                break;
                            }
                        }
                        Ok(_) => break,
                        Err(_) => break,
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                let Some(token) = token else { continue };
                responder
                    .presented(&id, version, &token, verdict.clone(), logs.clone())
                    .await
                    .expect("the verdict should be accepted");
            }
        });
        (workshop, windows)
    }
    /// The whole way from an empty task to an installed plugin.
    async fn installed_project(temp: &Path) -> (Arc<Workshop>, Arc<Runtime>, Project) {
        let workshop = service(temp.join("workshop"));
        let tool = tool(&temp.join("tool"));
        let project = workshop
            .create(
                "Read text".into(),
                Some(sample_file(temp, "notes.txt", b"Sample")),
            )
            .await
            .unwrap();
        workshop
            .build_candidate(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).unwrap(),
            )
            .await
            .unwrap();
        let preview = workshop.begin_preview(&project.id).await.unwrap();
        workshop
            .presented(
                &project.id,
                1,
                preview.preview_token.as_deref().unwrap(),
                None,
                Vec::new(),
            )
            .await
            .unwrap();
        let runtime = Runtime::new(temp.join("installed")).unwrap();
        workshop.install(&project.id, &runtime).await.unwrap();
        (workshop, runtime, project)
    }
    /// The files a probe builds from: a plugin the host accepts without a model.
    async fn accepted_files(workshop: &Arc<Workshop>, sample: &str) -> Project {
        workshop
            .create(
                "Read text".into(),
                Some(sample_file(
                    &workshop.root.parent().unwrap().to_owned(),
                    sample,
                    b"Sample",
                )),
            )
            .await
            .unwrap()
    }
    #[tokio::test]
    async fn a_failing_self_check_reports_the_page_and_photographs_the_result() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, windows) = service_with_verdict(
            temp.path().join("workshop"),
            Some("渲染时抛出了异常".into()),
            vec!["error: Cannot read properties of null".into()],
        );
        let tool = tool(&temp.path().join("tool"));
        let project = accepted_files(&workshop, "notes.txt").await;
        let outcome = workshop
            .probe(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).ok(),
            )
            .await
            .unwrap();
        assert!(!outcome.ok);
        assert_eq!(outcome.error.as_deref(), Some("渲染时抛出了异常"));
        assert_eq!(
            outcome.logs,
            vec!["error: Cannot read properties of null".to_string()]
        );
        assert!(
            outcome.image.is_some(),
            "a failed run has to show what it drew"
        );
        assert!(!outcome.limited);
        // The window is opened once and closed again, and nothing about the frame is kept.
        assert_eq!(windows.shown.lock().unwrap().len(), 1);
        assert_eq!(windows.closed.lock().unwrap().len(), 1);
        let after = workshop.get(&project.id).await.unwrap();
        assert_eq!(after.status, "previewFailed");
        assert!(!after.self_checked);
        assert!(!workshop
            .directory(&project.id)
            .unwrap()
            .join("shots")
            .exists());
    }
    #[tokio::test]
    async fn a_passing_self_check_previews_the_build_without_a_user() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, _windows) =
            service_with_verdict(temp.path().join("workshop"), None, Vec::new());
        let tool = tool(&temp.path().join("tool"));
        let project = accepted_files(&workshop, "notes.txt").await;
        let outcome = workshop
            .probe(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).ok(),
            )
            .await
            .unwrap();
        assert!(outcome.ok, "{:?}", outcome.note);
        assert!(outcome.error.is_none());
        let after = workshop.get(&project.id).await.unwrap();
        assert!(after.tested, "a passing run is a trial preview");
        assert!(after.self_checked);
        assert_eq!(after.status, "ready");
        assert!(after.builds.iter().any(|build| build.verified));
    }
    #[tokio::test]
    async fn a_self_check_without_a_sample_says_so_instead_of_pretending() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, windows) =
            service_with_verdict(temp.path().join("workshop"), None, Vec::new());
        let tool = tool(&temp.path().join("tool"));
        let project = workshop.create("Read text".into(), None).await.unwrap();
        let outcome = workshop
            .probe(
                &project.id,
                &tool,
                parse_output(&output(viewer()), &[]).ok(),
            )
            .await
            .unwrap();
        assert!(!outcome.ok);
        assert!(outcome.note.unwrap().contains("没有样例文件"));
        // Nothing was built and no window was opened for a run that could not happen.
        assert!(windows.shown.lock().unwrap().is_empty());
        assert_eq!(workshop.get(&project.id).await.unwrap().version, 0);
    }
    #[tokio::test]
    async fn a_self_check_before_validation_asks_for_it_instead_of_failing_the_run() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, windows) =
            service_with_verdict(temp.path().join("workshop"), None, Vec::new());
        let tool = tool(&temp.path().join("tool"));
        let project = accepted_files(&workshop, "notes.txt").await;
        let outcome = workshop
            .probe(&project.id, &tool, None)
            .await
            .unwrap();
        assert!(!outcome.ok);
        assert!(outcome.note.unwrap().contains("validate"));
        assert!(windows.shown.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn a_plugin_removed_in_plugin_management_stops_counting_as_installed() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, runtime, project) = installed_project(temp.path()).await;
        let installed = workshop.get(&project.id).await.unwrap();
        assert_eq!(installed.installed_version, Some(1));
        assert_eq!(installed.status, "installed");
        runtime.uninstall(&generated_id(&project.id)).await.unwrap();
        workshop.reconcile(&runtime).await.unwrap();
        let synced = workshop.get(&project.id).await.unwrap();
        assert_eq!(synced.installed_version, None);
        // The build it previewed is still there, so the task is installable again.
        assert_eq!(synced.status, "ready");
        assert!(synced
            .logs
            .iter()
            .any(|entry| entry.text.contains("安装状态已同步")));
    }
    #[tokio::test]
    async fn deleting_a_task_removes_its_source_builds_and_frames() {
        let temp = tempfile::tempdir().unwrap();
        let (workshop, runtime, project) = installed_project(temp.path()).await;
        let directory = workshop.directory(&project.id).unwrap();
        assert!(directory.join("v1/ui/view.js").is_file());
        workshop.delete(&project.id, true, &runtime).await.unwrap();
        assert!(workshop.get(&project.id).await.is_err());
        assert!(!directory.exists());
        assert!(runtime.snapshot().await.plugins.is_empty());
    }
    #[tokio::test]
    async fn deleting_a_task_never_touches_the_users_own_sample() {
        let temp = tempfile::tempdir().unwrap();
        let workshop = service(temp.path().join("workshop"));
        let runtime = Runtime::new(temp.path().join("installed")).unwrap();
        let sample = temp.path().join("mine.txt");
        std::fs::write(&sample, b"mine").unwrap();
        let project = workshop
            .create("Read mine".into(), Some(sample.clone()))
            .await
            .unwrap();
        workshop.delete(&project.id, false, &runtime).await.unwrap();
        assert!(
            sample.is_file(),
            "the user's file is not the task's to delete"
        );
    }
    #[tokio::test]
    async fn an_older_task_keeps_its_conversation_after_the_upgrade() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir(temp.path().join("p9")).unwrap();
        write_json(
            &temp.path().join("p9/project.json"),
            &json!({
                "id":"p9","name":"旧任务","mode":"simple","status":"ready",
                "messages":["做一个文本预览"],"sample":null,"extension":"txt","error":null,
                "version":1,"tested":true,"sdkVersion":"0.1.0","usage":null,"installedVersion":null,
                "builds":[],"outputs":[{"stage":"Pi Agent","text":"已完成","finishReason":"complete"}]
            }),
        )
        .unwrap();
        let workshop = service(temp.path().to_owned());
        let migrated = workshop.get("p9").await.unwrap();
        assert_eq!(migrated.transcript.len(), 2);
        assert_eq!(migrated.transcript[0].role, "user");
        assert_eq!(migrated.transcript[0].text, "做一个文本预览");
        assert_eq!(migrated.transcript[1].role, "assistant");
        assert_eq!(migrated.transcript[1].text, "已完成");
        // The fields the older design used are gone after the rewrite.
        let stored: Value =
            serde_json::from_slice(&std::fs::read(temp.path().join("p9/project.json")).unwrap())
                .unwrap();
        assert!(stored.get("outputs").is_none());
        assert!(stored.get("mode").is_none());
        assert_eq!(stored["transcript"][1]["text"], "已完成");
    }
    #[test]
    fn damaged_workshop_project_does_not_prevent_host_startup() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir(temp.path().join("p1")).unwrap();
        std::fs::write(temp.path().join("p1/project.json"), b"broken").unwrap();
        let workshop = service(temp.path().to_owned());
        assert_eq!(workshop.warnings.len(), 1);
    }
}
