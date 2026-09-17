mod artifact;
mod composition;
pub mod i18n;
pub mod manifest;
pub mod market;
mod process;

use crate::i18n::{msg, text, Locale, Refusal};
use manifest::{Activation, ActivationMode, Capability, Manifest, Package, Permission};
use process::Worker;
use serde::{Deserialize, Serialize};
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
/// Name prefix for the installed directory a replacement moved aside. Everything else that
/// is not a plugin lives under a dot name, and `scan` skips those.
const REPLACED_PREFIX: &str = ".replaced-";

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
    /// The plugin has changes it has not committed. Only the plugin can clear this, and the
    /// host treats it as a reason not to destroy the session: what it protects is the user's
    /// uncommitted work, whether that is a text draft, a crop or a colour tweak.
    pub pending: bool,
    /// The plugin's own wording for those changes, shown when the host has to explain why it
    /// refused. Absent means the host falls back to a neutral phrase.
    pub pending_reason: Option<String>,
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

/// What a replacement cut: the files whose previews were dropped, and whether the session
/// that was on screen was one of them.
struct TakenOver {
    files: Vec<PathBuf>,
    active: Option<(PathBuf, String)>,
}

/// Uncommitted work a destructive action would destroy: which session holds it, which file
/// it is about, and what the plugin calls the changes.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingChange {
    pub session: String,
    /// The file the work belongs to: what the user has to go back to, and the part of the
    /// sentence they can act on.
    pub file: String,
    pub reason: String,
}

impl PendingChange {
    /// Read the claim off a session, with the host's neutral wording for a plugin that did
    /// not name what it is holding.
    pub fn from_info(info: &SessionInfo) -> Self {
        Self {
            session: info.id.clone(),
            file: info.name.clone(),
            reason: info
                .pending_reason
                .clone()
                .unwrap_or_else(|| text().pending_fallback.to_owned()),
        }
    }

    /// The sentence every refusing path uses, so uninstalling, switching off and replacing a
    /// plugin all explain the same situation in the same words.
    pub fn refusal(&self, action: Refusal) -> String {
        text().refusal(&self.file, &self.reason, action)
    }
}

fn pending_change(session: &Session) -> PendingChange {
    PendingChange::from_info(&session.info)
}

/// `Runtime::blocking_change` for callers that already hold the lock. A `None` id asks about
/// every plugin, which is what a whole-application action such as the development reset does.
fn blocking_change(inner: &Inner, plugin_id: Option<&str>) -> Option<PendingChange> {
    inner
        .sessions
        .values()
        .find(|session| {
            session.info.pending && plugin_id.is_none_or(|id| session.info.plugin_id == id)
        })
        .map(pending_change)
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
    updating: bool,
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
    /// The interface language the host last spoke. Persisted because the tray menu is
    /// built before any window exists, from the language the previous session ended in.
    locale: Locale,
}

pub struct Runtime {
    root: PathBuf,
    inner: Mutex<Inner>,
    installation: Mutex<()>,
    sequence: AtomicU64,
    ttl: Duration,
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct StoredState {
    disabled: HashSet<String>,
    removed: HashSet<String>,
    settings: BTreeMap<String, serde_json::Map<String, Value>>,
    preferred: BTreeMap<String, String>,
    activation: BTreeMap<String, Activation>,
    onboarded: bool,
    /// The language tag the host last spoke, absent before anything has chosen one.
    locale: Option<String>,
}

fn read_state(root: &Path) -> Result<StoredState, String> {
    let path = root.join("host-state.json");
    let backup = root.join("host-state.backup.json");
    let read = |path: &Path| -> Result<StoredState, String> {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    };
    if !path.exists() && !backup.exists() { return Ok(StoredState::default()); }
    match read(&path) {
        Ok(state) => Ok(state),
        Err(error) => {
            let state = read(&backup).map_err(|backup_error| msg!(text().state_corrupt, error = error, backup = backup_error))?;
            let bytes = std::fs::read(&backup).map_err(|e| e.to_string())?;
            ember_file_store::atomic_write(&path, &bytes).map_err(|e| e.to_string())?;
            eprintln!("宿主状态读取失败，已从备份恢复：{error}");
            Ok(state)
        }
    }
}

impl Runtime {
    pub fn new(root: PathBuf) -> Result<Arc<Self>, String> {
        Self::with_ttl(root, IDLE_TTL)
    }
    pub fn with_ttl(root: PathBuf, ttl: Duration) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let state = read_state(&root)?;
        let locale = state
            .locale
            .as_deref()
            .map(Locale::from_tag)
            .unwrap_or_default();
        // The persisted language takes effect before anything can ask for a message: the
        // tray is built from it, and the first window corrects it if the system says
        // otherwise.
        i18n::set_locale(locale);
        let inner = Inner {
            disabled: state.disabled,
            removed: state.removed,
            settings: state.settings,
            preferred: state.preferred,
            activation: state.activation,
            onboarded: state.onboarded,
            locale,
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
            "locale": inner.locale.tag(),
        }))
        .map_err(|e| e.to_string())?;
        let path = self.root.join("host-state.json");
        let backup = self.root.join("host-state.backup.json");
        match std::fs::read(&path) {
            Ok(previous) => {
                serde_json::from_slice::<StoredState>(&previous).map_err(|e| msg!(text().state_invalid, error = e))?;
                ember_file_store::atomic_write(&backup, &previous).map_err(|e| e.to_string())?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if !backup.exists() { ember_file_store::atomic_write(&backup, &bytes).map_err(|e| e.to_string())?; }
            }
            Err(error) => return Err(msg!(text().state_unreadable, error = error)),
        }
        ember_file_store::atomic_write(&path, &bytes).map_err(|e| e.to_string())
    }

    /// Speak this interface language from now on, and remember it for the runs that start
    /// before a window can say what the system asks for.
    ///
    /// The language is one value for the whole process, so it is applied here rather than
    /// returned to the caller: the messages the host is about to produce — a tray menu
    /// rebuilt, a dialog opened, an error handed to a window — have to already be in it.
    pub async fn set_locale(&self, tag: Option<String>) -> Result<(), String> {
        let locale = tag
            .as_deref()
            .filter(|tag| !tag.trim().is_empty())
            .map(Locale::from_tag)
            .unwrap_or_default();
        i18n::set_locale(locale);
        let mut inner = self.inner.lock().await;
        if inner.locale == locale {
            return Ok(());
        }
        inner.locale = locale;
        self.persist(&inner)
    }

    /// The interface language the host is speaking.
    pub async fn locale(&self) -> Locale {
        self.inner.lock().await.locale
    }

    /// Opaque, bounded navigation state shared only by the same file and data contract.
    pub async fn view_state(&self, id: &str, value: Option<Value>) -> Result<Value, String> {
        let mut inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
        let contract = session
            .package
            .manifest
            .provides
            .as_ref()
            .or(session.package.manifest.consumes.as_ref())
            .ok_or_else(|| msg!(text().no_contract))?;
        let key = (session.path.clone(), contract.clone());
        if let Some(value) = value {
            if serde_json::to_vec(&value).map_err(|e| e.to_string())?.len() > 4096 {
                return Err(msg!(text().navigation_too_large));
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
        let _installation = self.installation.lock().await;
        self.scan_installed().await
    }

    async fn scan_installed(&self) -> Result<(), String> {
        // Before reading the directory, undo any replacement that died halfway: an installation
        // moved aside but never replaced has to come back, or the plugin would look uninstalled.
        recover_replaced(&self.root);
        let mut packages: BTreeMap<String, Package> = BTreeMap::new();
        let mut warnings = Vec::new();
        // A plugin gets one directory, so any other revision of it is dead weight: the one this
        // scan does not select is retired, which is also how an installation that predates
        // in-place updates loses the copies the older scheme left behind.
        let mut superseded = Vec::new();
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
                    match packages.get(&id).map(|old| {
                        (old.key(), old.manifest.revision)
                    }) {
                        Some((_, revision)) if revision >= package.manifest.revision => {
                            superseded.push(package.key())
                        }
                        Some((current, _)) => {
                            superseded.push(current);
                            packages.insert(id, package);
                        }
                        None => {
                            packages.insert(id, package);
                        }
                    }
                }
                Err(error) => {
                    warnings.push(format!("{}: {error}", entry.file_name().to_string_lossy()))
                }
            }
        }
        inner.packages = packages;
        inner.warnings = warnings;
        let mut changed = false;
        for key in superseded {
            changed |= inner.removed.insert(key);
        }
        if changed {
            self.persist(&inner)?;
        }
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
            // The list shows the plugin's own text in the interface language.
            let mut manifest = package.manifest.localized(i18n::locale());
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
                    && (!s.data["cacheKey"].is_null() || info.pending);
                // The label is the plugin's name, which the plugin declares per language:
                // a session that outlives a language change has to follow it, the same way
                // the plugin list does.
                info.label = s.package.manifest.localized_name(i18n::locale());
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
        if let Some(change) = self.blocking_change(None).await {
            return Err(change.refusal(Refusal::Reset));
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
                .ok_or_else(|| msg!(text().unknown_plugin))?
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
        let session = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
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
        let session = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
        if session.info.status != "ready" {
            return Err(msg!(text().session_not_ready));
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
        let session = inner.sessions.get_mut(id).ok_or_else(|| msg!(text().session_expired))?;
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
        let session = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
        if !session.package.manifest.permissions.contains(&permission) {
            return Err(msg!(text().permission_undeclared));
        }
        if inner.disabled.contains(&session.info.plugin_id)
            || !inner.packages.contains_key(&session.info.plugin_id)
        {
            return Err(msg!(text().plugin_disabled));
        }
        Ok(())
    }
    /// Record the plugin's own claim that this session holds uncommitted changes, and how
    /// the plugin names them. The host cannot verify the claim and does not try: it only
    /// keeps the plugin's word about what must not be destroyed.
    pub async fn set_pending(
        &self,
        id: &str,
        pending: bool,
        reason: Option<String>,
    ) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let session = inner.sessions.get_mut(id).ok_or_else(|| msg!(text().session_expired))?;
        session.info.pending = pending;
        session.info.pending_reason = if pending {
            reason.map(|reason| reason.trim().to_string())
                .filter(|reason| !reason.is_empty())
                .map(|reason| reason.chars().take(60).collect())
        } else {
            None
        };
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
    /// Whether any session holds uncommitted changes. Only the plugin clears that state, so
    /// this is what keeps a draft alive across an idle pass and what makes quitting ask first.
    pub async fn has_pending(&self) -> bool {
        self.inner
            .lock()
            .await
            .sessions
            .values()
            .any(|s| s.info.pending)
    }

    /// Uncommitted changes that a destructive action would destroy: those of one plugin, or
    /// of any plugin when `plugin_id` is `None`.
    ///
    /// Every path that disposes of a plugin — uninstalling it, switching it off, replacing it
    /// with a new build, quitting — asks this, so all of them refuse in the same words and a
    /// plugin that reports changes is protected without the host knowing what they are.
    pub async fn blocking_change(&self, plugin_id: Option<&str>) -> Option<PendingChange> {
        let inner = self.inner.lock().await;
        blocking_change(&inner, plugin_id)
    }
    pub async fn source_call(&self, id: &str, method: &str, value: Value) -> Result<Value, String> {
        let source = {
            let inner = self.inner.lock().await;
            let consumer = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
            let source_id = consumer.source.as_ref().ok_or_else(|| msg!(text().no_source))?;
            let provider = inner.sessions.get(source_id).ok_or_else(|| msg!(text().source_expired))?;
            if !provider
                .package
                .manifest
                .source_methods
                .iter()
                .any(|export| export == method)
            {
                return Err(msg!(text().source_method_unexported));
            }
            source_id.clone()
        };
        self.call(&source, method, value).await
    }

    pub async fn asset(&self, id: &str, path: &str) -> Result<PathBuf, String> {
        let inner = self.inner.lock().await;
        let session = inner.sessions.get(id).ok_or_else(|| msg!(text().session_expired))?;
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
            return Err(msg!(text().reserved_method));
        }
        let (worker, path, settings) = {
            let mut inner = self.inner.lock().await;
            let session = inner.sessions.get_mut(id).ok_or_else(|| msg!(text().session_expired))?;
            if session.calls >= 8 {
                return Err(msg!(text().too_many_calls));
            }
            session.calls += 1;
            session.touched = Instant::now();
            let key = session.package.key();
            let path = session.path.clone();
            let manifest = session.package.manifest.clone();
            let empty = serde_json::Map::new();
            let stored = inner.settings.get(&manifest.id).unwrap_or(&empty);
            let settings = manifest.resolve_settings(stored);
            let worker = inner.workers.get(&key).cloned().ok_or_else(|| msg!(text().worker_expired))?;
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
            return Err(msg!(text().plugins_changed));
        }
        for (index, id) in ids.iter().enumerate() {
            let mut activation = inner
                .activation
                .get(id)
                .cloned()
                .unwrap_or_else(|| inner.packages[id].manifest.activation.clone());
            activation.priority = i32::try_from(ids.len() - index).map_err(|_| msg!(text().too_many_plugins))?;
            inner.activation.insert(id.clone(), activation);
        }
        inner.preferred.clear();
        self.persist(&inner)
    }

    pub async fn set_activation(&self, id: &str, activation: Activation) -> Result<(), String> {
        if !(-1000..=1000).contains(&activation.priority) {
            return Err(msg!(text().priority_range));
        }
        let mut inner = self.inner.lock().await;
        if !inner.packages.contains_key(id) {
            return Err(msg!(text().unknown_plugin));
        }
        inner.activation.insert(id.to_owned(), activation);
        inner.preferred.clear();
        self.persist(&inner)
    }

    pub async fn enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if !inner.packages.contains_key(id) {
            return Err(msg!(text().unknown_plugin));
        }
        if !enabled {
            if let Some(change) = blocking_change(&inner, Some(id)) {
                return Err(change.refusal(Refusal::Disable));
            }
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
        if let Some(change) = blocking_change(&inner, Some(id)) {
            return Err(change.refusal(Refusal::Uninstall));
        }
        if inner.packages.remove(id).is_none() {
            return Err(msg!(text().unknown_plugin));
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

    pub async fn install(self: &Arc<Self>, source: &Path) -> Result<(), String> {
        let _installation = self.installation.lock().await;
        let package = Package::load(source)?;
        let installed = self
            .inner
            .lock()
            .await
            .packages
            .get(&package.manifest.id)
            .cloned();
        if let Some(installed) = &installed {
            let incoming = semver::Version::parse(&package.manifest.version).map_err(|e| msg!(text().invalid_version, error = e))?;
            let current = semver::Version::parse(&installed.manifest.version).map_err(|e| msg!(text().installed_invalid_version, error = e))?;
            if incoming.cmp_precedence(&current).is_lt() {
                return Err(msg!(text().downgrade, installed = current, incoming = incoming));
            }
        }
        match installed {
            // Already this exact build: installing it again changes nothing.
            Some(installed)
                if !package.manifest.build_id.is_empty()
                    && installed.manifest.build_id == package.manifest.build_id =>
            {
                Ok(())
            }
            // An update replaces the installed directory; only a first install adds one.
            Some(installed) => self.replace_package(source, &installed).await,
            None => self.install_package(source).await,
        }
    }

    pub async fn update_development(self: &Arc<Self>, source: &Path) -> Result<(), String> {
        let _installation = self.installation.lock().await;
        let package = Package::load(source)?;
        let installed = self
            .inner
            .lock()
            .await
            .packages
            .get(&package.manifest.id)
            .cloned();
        let Some(installed) = installed else { return Ok(()) };
        if installed.manifest.build_id.is_empty()
            || installed.manifest.build_id == package.manifest.build_id
        {
            return Ok(());
        }
        self.replace_package(source, &installed).await
    }

    /// Replace the installed revision in place.
    ///
    /// An update does not stack a new revision beside the old one: the installed directory is
    /// swapped for the verified new one, so a machine keeps exactly one copy per plugin. The
    /// swap is two renames, which is why an update stops the plugin first — Windows will not
    /// rename a directory with a running executable inside it — and why a crash between the
    /// two leaves the previous revision recoverable instead of a half-written install.
    ///
    /// Whatever was previewing the plugin is cut and put back on the new build. Uncommitted
    /// work is never in scope: an update is refused while the plugin reports any, so nothing a
    /// user has not saved is destroyed by this.
    async fn replace_package(
        self: &Arc<Self>,
        source: &Path,
        installed: &Package,
    ) -> Result<(), String> {
        let id = installed.manifest.id.clone();
        if let Some(change) = self.blocking_change(Some(&id)).await {
            return Err(change.refusal(Refusal::Update));
        }
        let package = Package::load(source)?;
        // The replacement keeps the installation's revision, so the directory it lives in is
        // stable across updates instead of being renamed on every release.
        let revision = installed.manifest.revision;
        let staging = self.root.join(format!(".install-{revision}"));
        let _ = std::fs::remove_dir_all(&staging);
        copy_package(&package.directory, &staging, 0)?;
        let mut manifest = package.manifest;
        manifest.revision = revision;
        std::fs::write(
            staging.join("plugin.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .map_err(|e| e.to_string())?;
        // Nothing is swapped until the staged tree is known to load.
        Package::load(&staging)?;
        // Cut the previews now: their process is about to go and the files under them are
        // about to change, so they must not be left pointing at either.
        let taken = match self.take_over(&id).await {
            Ok(taken) => taken,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&staging);
                return Err(error);
            }
        };
        if let Err(error) = swap_directory(&staging, &installed.directory) {
            let _ = std::fs::remove_dir_all(&staging);
            self.inner.lock().await.updating = false;
            let _ = self.reopen(taken).await;
            return Err(msg!(text().swap_failed, error = error));
        }
        let scanned = self.scan_installed().await;
        self.inner.lock().await.updating = false;
        scanned?;
        // Installations that predate in-place updates can still hold extra revisions; with no
        // rollback to fall back to, the installed one is the only one worth keeping.
        let retired = self.retire_superseded(&id).await;
        let failures = self.reopen(taken).await;
        retired?;
        if failures.is_empty() {
            Ok(())
        } else {
            Err(msg!(text().reopen_failed, failures = failures.join(text().semicolon)))
        }
    }

    /// Stop everything serving one plugin and drop the sessions showing it, returning the
    /// files they had open so they can be put back on the new build.
    ///
    /// A plugin process is shared by every file it previews, so the whole plugin goes, and with
    /// it every session of the file groups it took part in: a group is composed once, and
    /// recomposing it around a half-removed plugin would leave one contributor talking to a
    /// process that no longer exists.
    async fn take_over(self: &Arc<Self>, id: &str) -> Result<TakenOver, String> {
        let mut inner = self.inner.lock().await;
        let mut files: HashSet<String> = inner
            .sessions
            .values()
            .filter(|session| session.info.plugin_id == id)
            .map(|session| session.info.file_id.clone())
            .collect();
        // Workers multiplex files. Expand to every session served by a worker we will
        // stop, including peers in those files, before checking or removing anything.
        let mut affected_keys = HashSet::new();
        loop {
            let before = (files.len(), affected_keys.len());
            for session in inner.sessions.values() {
                if session.info.plugin_id == id || files.contains(&session.info.file_id)
                    || affected_keys.contains(&session.package.key()) {
                    files.insert(session.info.file_id.clone());
                    affected_keys.insert(session.package.key());
                }
            }
            if before == (files.len(), affected_keys.len()) { break; }
        }
        if let Some(session) = inner.sessions.values().find(|s| files.contains(&s.info.file_id) && s.info.pending) {
            return Err(pending_change(session).refusal(Refusal::Update));
        }
        inner.updating = true;
        let dropped: Vec<String> = inner
            .sessions
            .values()
            .filter(|session| {
                session.info.plugin_id == id || files.contains(&session.info.file_id)
            })
            .map(|session| session.info.id.clone())
            .collect();
        let was_active = inner
            .active
            .as_ref()
            .filter(|active| dropped.contains(active))
            .and_then(|active| inner.sessions.get(active))
            .map(|session| (session.path.clone(), session.info.plugin_id.clone()));
        let mut paths = Vec::new();
        let mut keys = HashSet::new();
        for session_id in dropped {
            if let Some(session) = inner.sessions.remove(&session_id) {
                if !paths.contains(&session.path) { paths.push(session.path.clone()); }
                keys.insert(session.package.key());
            }
        }
        if was_active.is_some() {
            inner.active = None;
        }
        let workers: Vec<_> = keys
            .iter()
            .filter_map(|key| inner.workers.remove(key))
            .collect();
        drop(inner);
        for worker in workers {
            worker.stop().await;
        }
        Ok(TakenOver {
            files: paths,
            active: was_active,
        })
    }

    /// Put the cut previews back, now that the plugin they use is the new build. A file whose
    /// plugin no longer claims it, or refuses to start, is reported rather than dropped in
    /// silence — the preview window falls back to its own empty state either way.
    async fn reopen(self: &Arc<Self>, taken: TakenOver) -> Vec<String> {
        let mut failures = Vec::new();
        for path in taken.files {
            match self.open(path.clone()).await {
                Ok(_) => {}
                Err(error) => failures.push(format!(
                    "{}：{error}",
                    path.file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_else(|| path.to_string_lossy().into_owned())
                )),
            }
        }
        if let Some((path, plugin)) = taken.active {
            let id = {
                let inner = self.inner.lock().await;
                inner.sessions.values().find(|s| s.path == path && s.info.plugin_id == plugin)
                    .or_else(|| inner.sessions.values().find(|s| s.path == path))
                    .map(|s| s.info.id.clone())
            };
            if let Some(id) = id {
                let _ = self.activate(Some(id)).await;
            }
        }
        failures
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
        self.scan_installed().await?;
        self.retire_superseded(&manifest.id).await
    }

    /// Retire every revision of a plugin except the installed one.
    ///
    /// An update swaps the installed directory rather than adding a revision, so this is a
    /// cleanup for installations that predate that: they can still hold revisions from the
    /// scheme where updates landed beside the old one. There is no rollback to preserve, so
    /// nothing else on disk is worth keeping — but they are retired through the same collector
    /// the uninstaller uses, so a revision still serving a preview is deleted once that preview
    /// is gone rather than being ripped out from under it.
    async fn retire_superseded(&self, id: &str) -> Result<(), String> {
        let installed = self
            .inner
            .lock()
            .await
            .packages
            .get(id)
            .map(Package::key);
        let Some(installed) = installed else {
            return Ok(());
        };
        let mut revisions: Vec<Package> = Vec::new();
        for entry in std::fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if !entry.path().is_dir() {
                continue;
            }
            if let Ok(package) = Package::load(&entry.path()) {
                if package.manifest.id == id && package.key() != installed {
                    revisions.push(package);
                }
            }
        }
        let mut inner = self.inner.lock().await;
        let mut changed = false;
        for package in revisions {
            changed |= inner.removed.insert(package.key());
        }
        if changed {
            self.persist(&inner)?;
        }
        Ok(())
    }

    /// The build of every revision on disk, retired ones excluded. The download cache only
    /// exists to avoid fetching something twice, so anything no installed revision can
    /// reach is dead weight: this is what the cache is pruned against.
    pub async fn installed_build_ids(&self) -> Result<HashSet<String>, String> {
        let inner = self.inner.lock().await;
        let mut ids = HashSet::new();
        for entry in std::fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if !entry.path().is_dir() {
                continue;
            }
            if let Ok(package) = Package::load(&entry.path()) {
                if !inner.removed.contains(&package.key()) && !package.manifest.build_id.is_empty()
                {
                    ids.insert(package.manifest.build_id);
                }
            }
        }
        Ok(ids)
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
            .filter(|s| s.calls != 0 || s.info.pending || s.touched.elapsed() < self.ttl)
            .map(|s| s.info.file_id.clone())
            .chain(active_file)
            .collect();
        for session in inner.sessions.values_mut() {
            if session.info.status == "ready"
                && !session.info.view_ready
                && session.touched.elapsed() >= Duration::from_secs(120)
            {
                session.info.status = "error".into();
                session.info.error = Some(msg!(text().view_timeout));
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

/// Swap a freshly assembled package in over the installed directory it replaces.
///
/// Two renames rather than a copy over the top: copying into a live plugin directory is not
/// atomic, so a crash, a full disk or an antivirus lock halfway through would leave an
/// installation that mixes both builds — a new executable beside an old UI, or a truncated
/// one — and the damage only shows up the next time the plugin runs. Renaming the installed
/// directory aside first means the worst case is a complete previous revision sitting under
/// `REPLACED_PREFIX`, which `scan` puts back (see `recover_replaced`).
///
/// A caller must stop the plugin first: Windows refuses both renames while its executable
/// is running.
fn swap_directory(from: &Path, to: &Path) -> Result<(), String> {
    let name = to
        .file_name()
        .ok_or_else(|| msg!(text().invalid_directory_name))?
        .to_string_lossy()
        .into_owned();
    let aside = to.with_file_name(format!("{REPLACED_PREFIX}{name}"));
    let _ = std::fs::remove_dir_all(&aside);
    if let Err(error) = std::fs::rename(to, &aside) {
        return Err(error.to_string());
    }
    if let Err(error) = std::fs::rename(from, to) {
        // Put the installation back rather than leaving the plugin missing.
        let _ = std::fs::rename(&aside, to);
        return Err(error.to_string());
    }
    // Best effort: a leftover aside directory is removed by the next scan.
    let _ = std::fs::remove_dir_all(&aside);
    Ok(())
}

/// Undo a swap that was interrupted between its two renames.
///
/// Nothing else writes these names, so a directory carrying the prefix means an update died
/// mid-swap. If the installation it belongs to is missing, the aside copy is that
/// installation and goes back; if it is present, the update completed and this is the
/// leftover to drop.
fn recover_replaced(root: &Path) {
    for entry in std::fs::read_dir(root).into_iter().flatten().flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(original) = name.strip_prefix(REPLACED_PREFIX) else {
            continue;
        };
        let target = root.join(original);
        if target.exists() {
            let _ = std::fs::remove_dir_all(entry.path());
        } else {
            // Still locked by a process that has not exited; the next scan retries.
            let _ = std::fs::rename(entry.path(), &target);
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
