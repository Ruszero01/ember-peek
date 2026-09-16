mod artifact;
mod composition;
pub mod manifest;
pub mod market;
mod process;

use manifest::{Activation, ActivationMode, Capability, Manifest, Package, Permission};
use process::Worker;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

pub const IDLE_TTL: Duration = Duration::from_secs(120);
const MAX_SESSIONS: usize = 16;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub plugin_id: String,
    pub revision: u64,
    pub entry: String,
    pub file_id: String,
    pub label: String,
    pub capabilities: Vec<Capability>,
    pub overlay: Option<manifest::OverlaySize>,
    pub available: bool,
    pub dirty: bool,
    pub name: String,
    pub size: u64,
    pub status: String,
    pub view_ready: bool,
    pub error: Option<String>,
}

struct Session {
    info: SessionInfo,
    path: PathBuf,
    package: Package,
    data: Value,
    touched: Instant,
    calls: usize,
    source: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    #[serde(flatten)]
    pub manifest: Manifest,
    pub enabled: bool,
    pub process_ids: Vec<u32>,
    /// Current values keyed by setting key: declared defaults plus user overrides.
    pub values: serde_json::Map<String, Value>,
    /// Declared defaults, so the UI can detect an override and offer a reset.
    pub defaults: serde_json::Map<String, Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub plugins: Vec<PluginInfo>,
    pub sessions: Vec<SessionInfo>,
    pub active: Option<String>,
    pub warnings: Vec<String>,
    pub plugin_directory: String,
    /// Whether the first-run plugin chooser still has to be shown.
    pub onboarded: bool,
}

#[derive(Default)]
struct Inner {
    packages: BTreeMap<String, Package>,
    workers: HashMap<String, Arc<Worker>>,
    sessions: HashMap<String, Session>,
    active: Option<String>,
    preferred: BTreeMap<String, String>,
    activation: BTreeMap<String, Activation>,
    disabled: HashSet<String>,
    removed: HashSet<String>,
    /// Plugin id -> the values the user actually changed. Defaults are resolved
    /// from the manifest, so a plugin update can retune defaults without a migration.
    settings: BTreeMap<String, serde_json::Map<String, Value>>,
    warnings: Vec<String>,
    view_states: HashMap<(PathBuf, String), (Value, Instant)>,
    /// Whether the first-run plugin chooser has been shown and answered. It is UI state,
    /// but it lives in this file because this file is the app's persisted state, and the
    /// host has to decide before any window exists.
    onboarded: bool,
}

pub struct Runtime {
    root: PathBuf,
    inner: Mutex<Inner>,
    installation: Mutex<()>,
    sequence: AtomicU64,
    ttl: Duration,
}

impl Runtime {
    pub fn new(root: PathBuf) -> Result<Arc<Self>, String> {
        Self::with_ttl(root, IDLE_TTL)
    }
    pub fn with_ttl(root: PathBuf, ttl: Duration) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let state: Value = std::fs::read(root.join("host-state.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(json!({}));
        let inner = Inner {
            disabled: serde_json::from_value(state["disabled"].clone()).unwrap_or_default(),
            removed: serde_json::from_value(state["removed"].clone()).unwrap_or_default(),
            settings: serde_json::from_value(state["settings"].clone()).unwrap_or_default(),
            preferred: serde_json::from_value(state["preferred"].clone()).unwrap_or_default(),
            activation: serde_json::from_value(state["activation"].clone()).unwrap_or_default(),
            onboarded: state["onboarded"].as_bool().unwrap_or(false),
            ..Default::default()
        };
        Ok(Arc::new(Self {
            root,
            inner: Mutex::new(inner),
            installation: Mutex::new(()),
            sequence: AtomicU64::new(1),
            ttl,
        }))
    }

    fn persist(&self, inner: &Inner) -> Result<(), String> {
        let bytes = serde_json::to_vec(&json!({
            "disabled": inner.disabled,
            "removed": inner.removed,
            "settings": inner.settings,
            "preferred": inner.preferred,
            "activation": inner.activation,
            "onboarded": inner.onboarded,
        }))
        .map_err(|e| e.to_string())?;
        std::fs::write(self.root.join("host-state.json"), bytes).map_err(|e| e.to_string())
    }

    /// Opaque, bounded navigation state shared only by the same file and data contract.
    pub async fn view_state(&self, id: &str, value: Option<Value>) -> Result<Value, String> {
        let mut inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or("Session expired")?;
        let contract = session
            .package
            .manifest
            .provides
            .as_ref()
            .or(session.package.manifest.consumes.as_ref())
            .ok_or("No shared contract")?;
        let key = (session.path.clone(), contract.clone());
        if let Some(value) = value {
            if serde_json::to_vec(&value).map_err(|e| e.to_string())?.len() > 4096 {
                return Err("Navigation state exceeds 4 KiB".into());
            }
            if !inner.view_states.contains_key(&key) && inner.view_states.len() >= 128 {
                if let Some(oldest) = inner
                    .view_states
                    .iter()
                    .min_by_key(|(_, (_, time))| *time)
                    .map(|(key, _)| key.clone())
                {
                    inner.view_states.remove(&oldest);
                }
            }
            inner
                .view_states
                .insert(key, (value.clone(), Instant::now()));
            Ok(value)
        } else {
            Ok(inner
                .view_states
                .get(&key)
                .map(|(value, _)| value.clone())
                .unwrap_or(Value::Null))
        }
    }

    pub async fn scan(&self) -> Result<(), String> {
        let mut packages: BTreeMap<String, Package> = BTreeMap::new();
        let mut warnings = Vec::new();
        let mut inner = self.inner.lock().await;
        for entry in std::fs::read_dir(&self.root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.path().is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            match Package::load(&entry.path()) {
                Ok(package) => {
                    if inner.removed.contains(&package.key()) {
                        continue;
                    }
                    let id = package.manifest.id.clone();
                    if packages
                        .get(&id)
                        .is_none_or(|old| old.manifest.revision < package.manifest.revision)
                    {
                        packages.insert(id, package);
                    }
                }
                Err(error) => {
                    warnings.push(format!("{}: {error}", entry.file_name().to_string_lossy()))
                }
            }
        }
        inner.packages = packages;
        inner.warnings = warnings;
        Ok(())
    }

    pub async fn snapshot(&self) -> Snapshot {
        let inner = self.inner.lock().await;
        let empty = serde_json::Map::new();
        let mut plugins = Vec::new();
        for package in inner.packages.values() {
            let mut pids = Vec::new();
            for (key, worker) in &inner.workers {
                if inner
                    .sessions
                    .values()
                    .any(|s| s.package.key() == *key && s.info.plugin_id == package.manifest.id)
                {
                    if let Some(pid) = worker.pid().await {
                        pids.push(pid);
                    }
                }
            }
            let mut manifest = package.manifest.clone();
            if let Some(activation) = inner.activation.get(&manifest.id) {
                manifest.activation = activation.clone();
            }
            plugins.push(PluginInfo {
                manifest,
                enabled: !inner.disabled.contains(&package.manifest.id),
                process_ids: pids,
                values: package
                    .manifest
                    .resolve_settings(inner.settings.get(&package.manifest.id).unwrap_or(&empty)),
                defaults: package.manifest.default_settings(),
            });
        }
        let mut sessions: Vec<_> = inner
            .sessions
            .values()
            .map(|s| {
                let mut info = s.info.clone();
                info.available = !inner.disabled.contains(&info.plugin_id)
                    && inner.packages.contains_key(&info.plugin_id)
                    && (!s.data["cacheKey"].is_null() || info.dirty);
                info
            })
            .collect();
        sessions.sort_by(|a, b| {
            a.file_id
                .cmp(&b.file_id)
                .then(a.label.cmp(&b.label))
                .then(a.id.cmp(&b.id))
        });
        let active = inner
            .active
            .as_ref()
            .and_then(|id| sessions.iter().find(|s| &s.id == id))
            .and_then(|selected| {
                if selected.available {
                    Some(selected.id.clone())
                } else {
                    sessions
                        .iter()
                        .filter(|s| s.file_id == selected.file_id && s.available)
                        .min_by_key(|s| (!s.capabilities.contains(&Capability::View), &s.id))
                        .map(|s| s.id.clone())
                }
            });
        Snapshot {
            plugins,
            sessions,
            active,
            warnings: inner.warnings.clone(),
            plugin_directory: self.root.to_string_lossy().into(),
            onboarded: inner.onboarded,
        }
    }

    /// The first-run plugin chooser has been answered, whether plugins were installed or
    /// not. Recorded so it is only ever shown once.
    pub async fn complete_onboarding(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if inner.onboarded {
            return Ok(());
        }
        inner.onboarded = true;
        self.persist(&inner)
    }

    /// Put this installation back to what a first launch looks like: nothing installed and
    /// nothing remembered. Development builds offer it from the tray, because the first-run
    /// chooser is otherwise only reachable by clearing the app data directory by hand.
    pub async fn reset_to_first_launch(&self) -> Result<(), String> {
        // Refused rather than answered with data loss, the same as uninstalling.
        if self.has_dirty().await {
            return Err("请先保存或撤销未保存的编辑".into());
        }
        // A running plugin's own executable cannot be deleted on Windows, so they stop
        // first; nothing is left that could hold a package directory open.
        self.shutdown().await;
        let mut inner = self.inner.lock().await;
        inner.packages.clear();
        inner.sessions.clear();
        inner.active = None;
        inner.preferred.clear();
        inner.activation.clear();
        inner.disabled.clear();
        inner.settings.clear();
        inner.view_states.clear();
        inner.warnings.clear();
        inner.removed.clear();
        inner.onboarded = false;
        // A fresh installation has no package directories either. Anything still locked by
        // a process that has not exited yet stays retired instead, and the collector
        // removes it once that process is gone.
        for entry in std::fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if let Ok(package) = Package::load(&entry.path()) {
                let key = package.key();
                if std::fs::remove_dir_all(entry.path()).is_err() {
                    inner.removed.insert(key);
                }
            }
        }
        self.persist(&inner)
    }

    /// Store one declared setting. Unknown keys and values that fail the schema are
    /// rejected, so persisted state can always be trusted by the running plugin.
    pub async fn set_setting(
        self: &Arc<Self>,
        plugin_id: &str,
        key: &str,
        value: Value,
    ) -> Result<(), String> {
        let resolved = {
            let mut inner = self.inner.lock().await;
            let manifest = inner
                .packages
                .get(plugin_id)
                .ok_or("Unknown plugin")?
                .manifest
                .clone();
            let accepted = manifest.coerce_setting(key, &value)?;
            let restored = manifest
                .settings
                .iter()
                .find(|setting| setting.key == key)
                .is_some_and(|setting| setting.default_value() == accepted);
            let stored = inner.settings.entry(plugin_id.to_owned()).or_default();
            if restored {
                // Back to the default: drop the override so later default changes apply.
                stored.remove(key);
            } else {
                stored.insert(key.to_owned(), accepted);
            }
            if stored.is_empty() {
                inner.settings.remove(plugin_id);
            }
            self.persist(&inner)?;
            let empty = serde_json::Map::new();
            manifest.resolve_settings(inner.settings.get(plugin_id).unwrap_or(&empty))
        };
        self.broadcast_settings(plugin_id, &resolved).await;
        Ok(())
    }

    pub async fn settings_for_session(&self, id: &str) -> Result<Value, String> {
        let inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or("Session expired")?;
        let empty = serde_json::Map::new();
        let stored = inner
            .settings
            .get(&session.info.plugin_id)
            .unwrap_or(&empty);
        Ok(json!({
            "settings": session.package.manifest.resolve_settings(stored),
            "defaults": session.package.manifest.default_settings(),
        }))
    }

    /// Push a settings change to live sessions. The host UI updates web views from
    /// its own snapshot; native workers are told directly. A worker that rejects the
    /// update is not rolled back: the stored value stays authoritative and the
    /// plugin sees it again on its next open.
    async fn broadcast_settings(&self, plugin_id: &str, resolved: &serde_json::Map<String, Value>) {
        let targets: Vec<(Arc<Worker>, String)> = {
            let inner = self.inner.lock().await;
            inner
                .sessions
                .values()
                .filter(|session| session.info.plugin_id == plugin_id)
                .filter_map(|session| {
                    let worker = inner.workers.get(&session.package.key())?;
                    Some((worker.clone(), session.info.id.clone()))
                })
                .collect()
        };
        for (worker, session) in targets {
            let payload = json!({"session":session,"settings":resolved});
            if let Err(error) = worker.call("settings", payload).await {
                eprintln!("Plugin settings update rejected for {session}: {error}");
            }
        }
    }

    pub async fn session_data(&self, id: &str) -> Result<Value, String> {
        let inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or("Session expired")?;
        if session.info.status != "ready" {
            return Err("Session is not ready".into());
        }
        if session.package.manifest.provides.is_some() {
            if let Some(source) = session
                .source
                .as_ref()
                .and_then(|id| inner.sessions.get(id))
            {
                return Ok(source.data["result"].clone());
            }
        }
        Ok(session.data["result"].clone())
    }

    pub async fn complete_view(&self, id: &str, error: Option<String>) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let session = inner.sessions.get_mut(id).ok_or("Session expired")?;
        session.info.view_ready = true;
        session.touched = Instant::now();
        if let Some(error) = error {
            session.info.status = "error".into();
            session.info.error = Some(error);
        }
        Ok(())
    }

    pub async fn session_file(&self, id: &str) -> Result<PathBuf, String> {
        self.inner
            .lock()
            .await
            .sessions
            .get(id)
            .map(|s| s.path.clone())
            .ok_or("Session expired".into())
    }

    pub async fn authorize(&self, id: &str, permission: Permission) -> Result<(), String> {
        let inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or("Session expired")?;
        if !session.package.manifest.permissions.contains(&permission) {
            return Err("Plugin permission not declared".into());
        }
        if inner.disabled.contains(&session.info.plugin_id)
            || !inner.packages.contains_key(&session.info.plugin_id)
        {
            return Err("Plugin is disabled".into());
        }
        Ok(())
    }
    pub async fn dirty(&self, id: &str, dirty: bool) -> Result<(), String> {
        self.inner
            .lock()
            .await
            .sessions
            .get_mut(id)
            .ok_or("Session expired")?
            .info
            .dirty = dirty;
        Ok(())
    }
    pub async fn invalidate(&self, file_id: &str) {
        for session in self
            .inner
            .lock()
            .await
            .sessions
            .values_mut()
            .filter(|s| s.info.file_id == file_id)
        {
            session.data["cacheKey"] = Value::Null;
        }
    }
    pub async fn has_dirty(&self) -> bool {
        self.inner
            .lock()
            .await
            .sessions
            .values()
            .any(|s| s.info.dirty)
    }
    pub async fn source_call(&self, id: &str, method: &str, value: Value) -> Result<Value, String> {
        let source = {
            let inner = self.inner.lock().await;
            let consumer = inner.sessions.get(id).ok_or("Session expired")?;
            let source_id = consumer.source.as_ref().ok_or("No compatible source")?;
            let provider = inner.sessions.get(source_id).ok_or("Source expired")?;
            if !provider
                .package
                .manifest
                .source_methods
                .iter()
                .any(|export| export == method)
            {
                return Err("Source method is not exported".into());
            }
            source_id.clone()
        };
        self.call(&source, method, value).await
    }

    pub async fn asset(&self, id: &str, path: &str) -> Result<PathBuf, String> {
        let inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or("Session expired")?;
        manifest::contained(
            &session.package.directory,
            if path.is_empty() {
                &session.package.manifest.entry
            } else {
                path
            },
        )
    }

    pub async fn call(&self, id: &str, method: &str, value: Value) -> Result<Value, String> {
        if method == "open" || method == "release" || method == "settings" || method.is_empty() {
            return Err("Reserved plugin method".into());
        }
        let (worker, path, settings) = {
            let mut inner = self.inner.lock().await;
            let session = inner.sessions.get_mut(id).ok_or("Session expired")?;
            if session.calls >= 8 {
                return Err("Too many concurrent plugin calls".into());
            }
            session.calls += 1;
            session.touched = Instant::now();
            let key = session.package.key();
            let path = session.path.clone();
            let manifest = session.package.manifest.clone();
            let empty = serde_json::Map::new();
            let stored = inner.settings.get(&manifest.id).unwrap_or(&empty);
            let settings = manifest.resolve_settings(stored);
            let worker = inner.workers.get(&key).cloned().ok_or("Worker expired")?;
            (worker, path, settings)
        };
        let result = worker
            .call(
                method,
                json!({"session":id,"path":path,"value":value,"settings":settings}),
            )
            .await;
        if let Some(session) = self.inner.lock().await.sessions.get_mut(id) {
            session.calls -= 1;
            session.touched = Instant::now();
        }
        result
    }

    pub async fn reorder_plugins(&self, ids: Vec<String>) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        if unique.len() != ids.len()
            || ids.len() != inner.packages.len()
            || ids.iter().any(|id| !inner.packages.contains_key(id))
        {
            return Err("插件列表已改变，请刷新后重试".into());
        }
        for (index, id) in ids.iter().enumerate() {
            let mut activation = inner
                .activation
                .get(id)
                .cloned()
                .unwrap_or_else(|| inner.packages[id].manifest.activation.clone());
            activation.priority = i32::try_from(ids.len() - index).map_err(|_| "插件数量过多")?;
            inner.activation.insert(id.clone(), activation);
        }
        inner.preferred.clear();
        self.persist(&inner)
    }

    pub async fn set_activation(&self, id: &str, activation: Activation) -> Result<(), String> {
        if !(-1000..=1000).contains(&activation.priority) {
            return Err("优先级应在 -1000 到 1000 之间".into());
        }
        let mut inner = self.inner.lock().await;
        if !inner.packages.contains_key(id) {
            return Err("Unknown plugin".into());
        }
        inner.activation.insert(id.to_owned(), activation);
        inner.preferred.clear();
        self.persist(&inner)
    }

    pub async fn enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if !inner.packages.contains_key(id) {
            return Err("Unknown plugin".into());
        }
        if !enabled
            && inner
                .sessions
                .values()
                .any(|s| s.info.plugin_id == id && s.info.dirty)
        {
            return Err("请先保存或撤销该插件的未保存编辑".into());
        }
        if enabled {
            inner.disabled.remove(id);
        } else {
            inner.disabled.insert(id.into());
            if let Some(active) = inner
                .active
                .as_ref()
                .and_then(|key| inner.sessions.get(key))
            {
                if active.info.plugin_id == id {
                    let file_id = active.info.file_id.clone();
                    inner.active = inner
                        .sessions
                        .values()
                        .filter(|s| {
                            s.info.file_id == file_id
                                && !inner.disabled.contains(&s.info.plugin_id)
                                && inner.packages.contains_key(&s.info.plugin_id)
                        })
                        .min_by_key(|s| {
                            (!s.package.manifest.has(Capability::View), s.info.id.clone())
                        })
                        .map(|s| s.info.id.clone());
                }
            }
        }
        self.persist(&inner)
    }

    pub async fn uninstall(&self, id: &str) -> Result<(), String> {
        let _installation = self.installation.lock().await;
        let mut inner = self.inner.lock().await;
        if inner
            .sessions
            .values()
            .any(|s| s.info.plugin_id == id && s.info.dirty)
        {
            return Err("请先保存或撤销该插件的未保存编辑".into());
        }
        if inner.packages.remove(id).is_none() {
            return Err("Unknown plugin".into());
        }
        inner.activation.remove(id);
        inner.preferred.retain(|_, preferred| preferred != id);
        // The disabled flag describes an installed package, so it goes with the package.
        // Otherwise reinstalling would bring the plugin back silently switched off.
        inner.disabled.remove(id);
        // Retire all installed revisions; existing work can finish before collection.
        for entry in std::fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if let Ok(package) = Package::load(&entry.path()) {
                if package.manifest.id == id {
                    inner.removed.insert(package.key());
                }
            }
        }
        self.persist(&inner)
    }

    pub async fn install(&self, source: &Path) -> Result<(), String> {
        let _installation = self.installation.lock().await;
        self.install_package(source).await
    }

    pub async fn update_development(&self, source: &Path) -> Result<(), String> {
        let _installation = self.installation.lock().await;
        let package = Package::load(source)?;
        let should_update = self
            .inner
            .lock()
            .await
            .packages
            .get(&package.manifest.id)
            .is_some_and(|old| {
                !old.manifest.build_id.is_empty()
                    && old.manifest.build_id != package.manifest.build_id
            });
        if should_update {
            self.install_package(source).await?;
        }
        Ok(())
    }

    async fn install_package(&self, source: &Path) -> Result<(), String> {
        let package = Package::load(source)?;
        if !package.manifest.build_id.is_empty()
            && self
                .inner
                .lock()
                .await
                .packages
                .get(&package.manifest.id)
                .is_some_and(|old| old.manifest.build_id == package.manifest.build_id)
        {
            return Ok(());
        }
        let mut revision = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64;
        while self
            .root
            .join(format!("{}-{revision}", package.manifest.id))
            .exists()
        {
            revision += 1;
        }
        let directory = self
            .root
            .join(format!("{}-{revision}", package.manifest.id));
        let staging = self.root.join(format!(".install-{revision}"));
        if staging.starts_with(&package.directory) {
            return Err("Installation destination is inside the source package".into());
        }
        copy_package(&package.directory, &staging, 0)?;
        let mut manifest = package.manifest;
        manifest.revision = revision;
        std::fs::write(
            staging.join("plugin.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .map_err(|e| e.to_string())?;
        Package::load(&staging)?;
        publish_directory(&staging, &directory)?;
        {
            let mut inner = self.inner.lock().await;
            if !inner.packages.contains_key(&manifest.id) {
                // New installations append; updates preserve the user's order.
                let mut ordered: Vec<_> = inner
                    .packages
                    .values()
                    .map(|p| {
                        let activation = inner
                            .activation
                            .get(&p.manifest.id)
                            .cloned()
                            .unwrap_or_else(|| p.manifest.activation.clone());
                        (p.manifest.id.clone(), activation)
                    })
                    .collect();
                ordered.sort_by(|a, b| b.1.priority.cmp(&a.1.priority).then(a.0.cmp(&b.0)));
                ordered.push((manifest.id.clone(), manifest.activation.clone()));
                let count = ordered.len();
                for (index, (id, mut activation)) in ordered.into_iter().enumerate() {
                    activation.priority = (count - index) as i32;
                    inner.activation.insert(id, activation);
                }
                inner.preferred.clear();
                self.persist(&inner)?;
            }
        }
        self.scan().await
    }

    pub async fn reap(&self) {
        let mut inner = self.inner.lock().await;
        let active_file = inner
            .active
            .as_ref()
            .and_then(|id| inner.sessions.get(id))
            .map(|s| s.info.file_id.clone());
        let pinned: HashSet<_> = inner
            .sessions
            .values()
            .filter(|s| s.calls != 0 || s.info.dirty || s.touched.elapsed() < self.ttl)
            .map(|s| s.info.file_id.clone())
            .chain(active_file)
            .collect();
        for session in inner.sessions.values_mut() {
            if session.info.status == "ready"
                && !session.info.view_ready
                && session.touched.elapsed() >= Duration::from_secs(120)
            {
                session.info.status = "error".into();
                session.info.error = Some("Plugin view initialization exceeded 120 seconds".into());
                session.touched = Instant::now();
            }
        }
        let expired: Vec<_> = inner
            .sessions
            .iter()
            .filter(|(_, s)| {
                !pinned.contains(&s.info.file_id)
                    && s.calls == 0
                    && (s.info.status != "ready" || s.info.view_ready)
                    && s.touched.elapsed() >= self.ttl
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            if let Some(session) = inner.sessions.remove(&id) {
                if inner
                    .sessions
                    .values()
                    .any(|s| s.package.key() == session.package.key())
                {
                    if let Some(worker) = inner.workers.get(&session.package.key()).cloned() {
                        tokio::spawn(async move {
                            let _ = worker.release(json!({"session":id})).await;
                        });
                    }
                }
            }
        }
        let unused: Vec<_> = inner
            .workers
            .keys()
            .filter(|key| !inner.sessions.values().any(|s| s.package.key() == **key))
            .cloned()
            .collect();
        for key in unused {
            if let Some(worker) = inner.workers.remove(&key) {
                worker.stop().await;
            }
        }
        let removable: Vec<_> = inner
            .removed
            .iter()
            .filter(|key| !inner.sessions.values().any(|s| s.package.key() == **key))
            .cloned()
            .collect();
        let mut changed = false;
        for key in removable {
            let path = PathBuf::from(&key);
            if path.parent() == Some(self.root.as_path()) && std::fs::remove_dir_all(&path).is_ok()
            {
                inner.removed.remove(&key);
                changed = true;
            }
        }
        if changed {
            let _ = self.persist(&inner);
        }
    }

    pub async fn shutdown(&self) {
        let workers: Vec<_> = self
            .inner
            .lock()
            .await
            .workers
            .drain()
            .map(|(_, w)| w)
            .collect();
        for worker in workers {
            worker.stop().await;
        }
    }
}

/// Put an assembled package directory in place.
///
/// `rename` is the right primitive: atomic and free. But Windows refuses to rename a
/// directory while any handle is open inside it, and that is exactly what happens when
/// something watches the tree the package is assembled in — an editor with the checkout
/// open, a sync client, an antivirus. Copying is not refused by the same condition, so it
/// is the fallback rather than the end of the install.
pub(crate) fn publish_directory(from: &Path, to: &Path) -> Result<(), String> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            if to.exists() {
                // Someone published it first; the caller decides what that means.
                return Err(rename_error.to_string());
            }
            if let Err(error) = copy_package(from, to, 0) {
                let _ = std::fs::remove_dir_all(to);
                return Err(error);
            }
            let _ = std::fs::remove_dir_all(from);
            Ok(())
        }
    }
}

fn copy_package(source: &Path, target: &Path, depth: usize) -> Result<(), String> {
    if depth > 16 {
        return Err("Package nesting exceeds 16 levels".into());
    }
    std::fs::create_dir(target).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            return Err("Package symlinks are not supported".into());
        }
        let destination = target.join(entry.file_name());
        if kind.is_dir() {
            copy_package(&entry.path(), &destination, depth + 1)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), destination).map_err(|e| e.to_string())?;
        } else {
            return Err("Unsupported package entry".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn staged(root: &Path) -> PathBuf {
        let staging = root.join("staging");
        std::fs::create_dir_all(staging.join("bin")).unwrap();
        std::fs::write(staging.join("plugin.json"), "{}").unwrap();
        std::fs::write(staging.join("bin/one.exe"), "stub").unwrap();
        staging
    }

    /// Windows refuses to rename a directory while a handle is open inside it, which is
    /// what a watcher, a scanner or an editor does to files that were just written. A
    /// package has to land anyway, so this asserts the copy fallback. On a platform that
    /// allows the rename the same assertions hold; the fallback is simply not needed.
    #[test]
    fn publishing_a_directory_that_something_has_open() {
        let temp = tempfile::tempdir().unwrap();
        let staging = staged(temp.path());
        let held = std::fs::File::open(staging.join("plugin.json")).unwrap();

        let published = temp.path().join("published");
        publish_directory(&staging, &published).unwrap();
        drop(held);
        assert!(published.join("plugin.json").is_file());
        assert_eq!(
            std::fs::read_to_string(published.join("bin/one.exe")).unwrap(),
            "stub"
        );
        assert!(!staging.exists(), "the staging directory is left behind");
    }

    /// Publishing onto an occupied destination is refused rather than merged. That is how
    /// two installs of the same artifact agree instead of fighting: the caller sees the
    /// error, notices the destination is there, and uses what is already published.
    #[test]
    fn publishing_onto_an_occupied_directory_is_refused() {
        let temp = tempfile::tempdir().unwrap();
        let staging = staged(temp.path());
        let published = temp.path().join("published");
        std::fs::create_dir_all(&published).unwrap();
        std::fs::write(published.join("plugin.json"), "already published").unwrap();

        assert!(publish_directory(&staging, &published).is_err());
        assert!(staging.exists(), "the staging directory is still there");
        assert_eq!(
            std::fs::read_to_string(published.join("plugin.json")).unwrap(),
            "already published"
        );
    }
}
