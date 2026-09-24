use crate::i18n::{msg, text, Locale};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

/// One declared plugin setting. The host renders the matching control from this
/// declaration alone, so a plugin never ships form markup of its own.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Setting {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: SettingKind,
    pub label: String,
    #[serde(default)]
    pub help: Option<String>,
    /// Persisted by the host, never rendered: the value is the plugin's own (last volume, last
    /// zoom), so the settings surface should not show a control for it.
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub default: Value,
    /// `number` only.
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
    /// `number` only. Multiplies the stored value for presentation without
    /// changing the value passed to the plugin (for example, 1.0 as 100%).
    #[serde(default)]
    pub display_multiplier: Option<f64>,
    /// `number` only. A short unit drawn inside the input.
    #[serde(default)]
    pub suffix: Option<String>,
    /// `select` only.
    #[serde(default)]
    pub options: Option<Vec<SettingOption>>,
}

/// Setting types understood by this host. An unknown type fails manifest loading
/// so a newer plugin is rejected loudly rather than rendered as a wrong control.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SettingKind {
    Bool,
    Number,
    Select,
    Text,
    Folder,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingOption {
    pub value: String,
    pub label: String,
}

/// The text one language replaces, for a manifest that is shown in more than one.
///
/// Authored beside the declarations it translates rather than in a separate catalogue, so a
/// translator sees the field they are translating and a plugin only writes what it can
/// actually translate: a field left out keeps the base declaration.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManifestText {
    #[serde(default)]
    pub name: Option<String>,
    /// Setting key to its translated wording.
    #[serde(default)]
    pub settings: BTreeMap<String, SettingText>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingText {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub help: Option<String>,
    /// Option value to its translated label, for a `select`.
    #[serde(default)]
    pub options: BTreeMap<String, String>,
}

pub const MAX_SETTINGS: usize = 32;

/// Languages one manifest may translate itself into.
pub const MAX_LOCALES: usize = 16;

/// Whether a declaration is a language tag this host is willing to look up: `zh-CN`, `en`,
/// `pt-BR`. Anything narrower is a lookup that would never match, so it is refused.
fn valid_locale_tag(tag: &str) -> bool {
    (2..=16).contains(&tag.len())
        && tag
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        && !tag.starts_with('-')
        && !tag.ends_with('-')
}

/// A translation is validated as strictly as the declaration it overrides: it is rendered
/// by the same code, and a name that is too long or a setting that does not exist would
/// otherwise show up as a wrong or missing control rather than as a rejected package.
fn validate_i18n(
    manifest_locales: &BTreeMap<String, ManifestText>,
    settings: &[Setting],
) -> Result<(), String> {
    if manifest_locales.len() > MAX_LOCALES {
        return Err(msg!(text().i18n_limit, max = MAX_LOCALES));
    }
    for (tag, messages) in manifest_locales {
        if !valid_locale_tag(tag) {
            return Err(msg!(text().i18n_tag_invalid, tag = tag));
        }
        if messages
            .name
            .as_ref()
            .is_some_and(|name| name.is_empty() || name.chars().count() > 80)
        {
            return Err(msg!(text().i18n_name_invalid, tag = tag));
        }
        for (key, translated) in &messages.settings {
            if !settings.iter().any(|setting| &setting.key == key) {
                return Err(msg!(text().i18n_setting_undeclared, tag = tag, key = key));
            }
            if translated
                .label
                .as_ref()
                .is_some_and(|label| label.is_empty() || label.chars().count() > 80)
            {
                return Err(msg!(text().i18n_label_invalid, tag = tag, key = key));
            }
            if translated
                .help
                .as_ref()
                .is_some_and(|help| help.chars().count() > 400)
            {
                return Err(msg!(text().i18n_help_invalid, tag = tag, key = key));
            }
            if let Some(option_labels) = settings
                .iter()
                .find(|setting| &setting.key == key)
                .and_then(|setting| setting.options.as_ref())
            {
                for (value, label) in &translated.options {
                    if !option_labels.iter().any(|option| &option.value == value) {
                        return Err(msg!(
                            text().i18n_option_undeclared,
                            tag = tag,
                            key = key,
                            value = value
                        ));
                    }
                    if label.is_empty() || label.chars().count() > 80 {
                        return Err(msg!(
                            text().i18n_option_invalid,
                            tag = tag,
                            key = key,
                            value = value
                        ));
                    }
                }
            } else if !translated.options.is_empty() {
                return Err(msg!(text().i18n_options_unexpected, tag = tag, key = key));
            }
        }
    }
    Ok(())
}

impl Setting {
    /// The value a plugin sees when the user has not chosen anything.
    pub fn default_value(&self) -> Value {
        if !self.default.is_null() {
            return self.default.clone();
        }
        match self.kind {
            SettingKind::Bool => Value::Bool(false),
            SettingKind::Number => serde_json::json!(0),
            SettingKind::Select => self
                .options
                .as_ref()
                .and_then(|options| options.first())
                .map(|option| Value::String(option.value.clone()))
                .unwrap_or(Value::Null),
            SettingKind::Text => Value::String(String::new()),
            SettingKind::Folder => Value::String(String::new()),
        }
    }

    /// Coerce a stored or user-supplied value onto this declaration. Returns the
    /// value unchanged when it is already valid.
    pub fn coerce(&self, value: &Value) -> Result<Value, String> {
        match self.kind {
            SettingKind::Bool => value
                .as_bool()
                .map(Value::Bool)
                .ok_or_else(|| msg!(text().coerce_bool, key = self.key)),
            SettingKind::Number => {
                let mut number = value
                    .as_f64()
                    .ok_or_else(|| msg!(text().coerce_number, key = self.key))?;
                if !number.is_finite() {
                    return Err(msg!(text().coerce_finite, key = self.key));
                }
                if let Some(min) = self.min {
                    number = number.max(min);
                }
                if let Some(max) = self.max {
                    number = number.min(max);
                }
                if let Some(step) = self.step.filter(|step| *step > 0.0) {
                    let base = self.min.unwrap_or(0.0);
                    number = base + ((number - base) / step).round() * step;
                }
                Ok(serde_json::json!(number))
            }
            SettingKind::Select => {
                let selected = value
                    .as_str()
                    .ok_or_else(|| msg!(text().coerce_option_string, key = self.key))?;
                let options = self.options.as_deref().unwrap_or_default();
                if !options.iter().any(|option| option.value == selected) {
                    return Err(msg!(text().coerce_option_unknown, key = self.key));
                }
                Ok(Value::String(selected.to_owned()))
            }
            SettingKind::Text => {
                let content = value
                    .as_str()
                    .ok_or_else(|| msg!(text().coerce_text, key = self.key))?;
                if content.chars().count() > 4096 {
                    return Err(msg!(text().coerce_text_too_long, key = self.key));
                }
                Ok(Value::String(content.to_owned()))
            }
            // A folder is a path a native process has to be able to use as it stands, so only
            // an empty string (keep whatever the plugin defaults to) or an absolute path are
            // accepted. A relative one would silently resolve against whatever directory the
            // plugin process happened to start in.
            SettingKind::Folder => {
                let path = value
                    .as_str()
                    .ok_or_else(|| msg!(text().coerce_folder, key = self.key))?;
                if path.chars().count() > 4096 {
                    return Err(msg!(text().coerce_text_too_long, key = self.key));
                }
                if !path.is_empty() && !Path::new(path).is_absolute() {
                    return Err(msg!(text().coerce_folder_absolute, key = self.key));
                }
                Ok(Value::String(path.to_owned()))
            }
        }
    }
}

/// Validate every declaration at load time so later coercion can trust the schema.
fn validate_settings(settings: &[Setting]) -> Result<(), String> {
    if settings.len() > MAX_SETTINGS {
        return Err(msg!(text().settings_limit, max = MAX_SETTINGS));
    }
    let mut seen = std::collections::HashSet::new();
    for setting in settings {
        if setting.key.is_empty()
            || setting.key.len() > 64
            || !setting
                .key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        {
            return Err(msg!(text().setting_key_invalid, key = setting.key));
        }
        if !seen.insert(setting.key.as_str()) {
            return Err(msg!(text().setting_key_duplicate, key = setting.key));
        }
        if setting.label.is_empty() || setting.label.chars().count() > 80 {
            return Err(msg!(text().setting_label_invalid, key = setting.key));
        }
        if setting
            .help
            .as_ref()
            .is_some_and(|h| h.chars().count() > 400)
        {
            return Err(msg!(text().setting_help_invalid, key = setting.key));
        }
        if let Some(multiplier) = setting.display_multiplier {
            if setting.kind != SettingKind::Number || !multiplier.is_finite() || multiplier <= 0.0 {
                return Err(msg!(text().setting_multiplier_invalid, key = setting.key));
            }
        }
        if setting
            .suffix
            .as_ref()
            .is_some_and(|suffix| setting.kind != SettingKind::Number || suffix.chars().count() > 8)
        {
            return Err(msg!(text().setting_suffix_invalid, key = setting.key));
        }
        if !setting.default.is_null() {
            setting
                .coerce(&setting.default)
                .map_err(|e| msg!(text().setting_default_invalid, key = setting.key, error = e))?;
        }
        if setting.kind == SettingKind::Select && setting.options.as_ref().is_none_or(Vec::is_empty)
        {
            return Err(msg!(text().setting_needs_options, key = setting.key));
        }
        if let Some(options) = &setting.options {
            if options.len() > 64 {
                return Err(msg!(text().setting_options_limit, key = setting.key));
            }
            let mut values = std::collections::HashSet::new();
            for option in options {
                if option.value.is_empty()
                    || option.value.chars().count() > 64
                    || option.label.chars().count() > 80
                {
                    return Err(msg!(text().setting_option_invalid, key = setting.key));
                }
                if !values.insert(option.value.as_str()) {
                    return Err(msg!(text().setting_option_duplicate, key = setting.key));
                }
            }
        }
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Capability {
    View,
    Overlay,
    Controls,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Permission {
    ReadFile,
    ReadResources,
    WriteFile,
    Clipboard,
    OpenLink,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivationMode {
    #[default]
    Auto,
    Manual,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activation {
    #[serde(default)]
    pub mode: ActivationMode,
    #[serde(default)]
    pub priority: i32,
}

/// Corner of the free area a panel starts in. Only the starting point: the user drags the
/// panel wherever they want, and that position is what gets remembered.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OverlayAnchor {
    #[default]
    TopRight,
    TopLeft,
    BottomRight,
    BottomLeft,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OverlaySize {
    pub width: u16,
    pub height: u16,
    #[serde(default)]
    pub anchor: OverlayAnchor,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub api: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub file_names: Vec<String>,
    /// Icon name the host looks up in its own set. A name the host does not know
    /// falls back to a generic icon rather than failing the package, so the host
    /// catalogue can grow without invalidating already-published plugins.
    #[serde(default)]
    pub icon: Option<String>,
    pub executable: String,
    pub entry: String,
    pub capabilities: Vec<Capability>,
    #[serde(default)]
    pub overlay: Option<OverlaySize>,
    /// The plugin takes part in the preparation phase: the host builds the preview window but
    /// does not show it until this plugin's view has reported ready, which is also when the
    /// view may state what it needs the window to be. So the window is never shown at one size
    /// and changed under the user's eyes. Its position is not the plugin's to state: that stays
    /// the host's, and so does the size the user chose for themselves.
    #[serde(default)]
    pub prepare: bool,
    #[serde(default)]
    pub activation: Activation,
    #[serde(default)]
    pub provides: Option<String>,
    #[serde(default)]
    pub source_methods: Vec<String>,
    #[serde(default)]
    pub consumes: Option<String>,
    #[serde(default)]
    pub permissions: Vec<Permission>,
    #[serde(default)]
    pub settings: Vec<Setting>,
    /// Text per language, for a plugin shown in more than one. Resolved by the host
    /// against the interface language before anything is drawn.
    #[serde(default)]
    pub i18n: BTreeMap<String, ManifestText>,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub build_id: String,
    /// Platforms this package's native executable runs on, as `os-arch` (for example
    /// `windows-x86_64`). Empty means the package does not restrict itself, which is
    /// also how packages built before this field existed keep loading.
    #[serde(default)]
    pub targets: Vec<String>,
}

/// The target this host runs, spelled the way `targets` declares it. Packaging runs
/// on the build host, so a package built here can only intend this value.
pub const HOST_TARGET: &str = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    "windows-x86_64"
} else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
    "windows-aarch64"
} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "macos-aarch64"
} else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    "macos-x86_64"
} else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "linux-x86_64"
} else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
    "linux-aarch64"
} else {
    "unknown"
};

pub fn valid_target(target: &str) -> bool {
    !target.is_empty()
        && target.len() <= 32
        && target
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
}

impl Manifest {
    /// Whether this host can run the package's executable. A package that declares no
    /// target is not restricted; the installer still only ever runs the binary it
    /// extracted, so the worst case of a wrong declaration is a clear failure to start.
    pub fn runs_here(&self) -> bool {
        self.targets.is_empty() || self.targets.iter().any(|t| t == HOST_TARGET)
    }

    /// The declaration this language replaces, if the plugin wrote one. A tag like `zh-CN`
    /// falls back to a declared `zh`.
    fn text_for(&self, locale: Locale) -> Option<&ManifestText> {
        let tag = locale.tag();
        self.i18n.get(tag).or_else(|| {
            let language = tag.split('-').next().unwrap_or(tag);
            self.i18n.get(language)
        })
    }

    /// The plugin's name in one language, without copying the rest of the declaration.
    ///
    /// A session's label is refreshed from this on every snapshot: a name is shown for as
    /// long as the session lives, so resolving it once, when the session opens, would leave
    /// one plugin speaking the language the application used before it was switched.
    pub fn localized_name(&self, locale: Locale) -> String {
        self.text_for(locale)
            .and_then(|text| text.name.clone())
            .unwrap_or_else(|| self.name.clone())
    }

    /// This manifest with one language's text folded in.
    ///
    /// A language the plugin does not declare, or a field it leaves out, keeps the base
    /// declaration: a plugin only writes what it can actually translate, and a host that
    /// speaks a language the plugin never heard of shows the declared text rather than
    /// nothing. A tag like `zh-CN` falls back to a declared `zh`.
    pub fn localized(&self, locale: Locale) -> Manifest {
        let Some(text) = self.text_for(locale) else {
            return self.clone();
        };
        let mut manifest = self.clone();
        if let Some(name) = &text.name {
            manifest.name = name.clone();
        }
        for setting in &mut manifest.settings {
            let Some(translated) = text.settings.get(&setting.key) else {
                continue;
            };
            if let Some(label) = &translated.label {
                setting.label = label.clone();
            }
            if let Some(help) = &translated.help {
                setting.help = Some(help.clone());
            }
            for option in setting.options.iter_mut().flatten() {
                if let Some(label) = translated.options.get(&option.value) {
                    option.label = label.clone();
                }
            }
        }
        manifest
    }

    pub fn matches(&self, extension: &str) -> bool {
        self.extensions.is_empty()
            || self.extensions.iter().any(|e| {
                e == "*" || e.eq_ignore_ascii_case("all") || e.eq_ignore_ascii_case(extension)
            })
    }
    pub fn has(&self, capability: Capability) -> bool {
        self.capabilities.contains(&capability)
    }

    /// Every declared default, used to fill in what the user has not chosen.
    pub fn default_settings(&self) -> Map<String, Value> {
        self.settings
            .iter()
            .map(|setting| (setting.key.clone(), setting.default_value()))
            .collect()
    }

    /// Overlay stored values on the defaults, dropping anything a newer manifest
    /// no longer declares and coercing anything the schema has tightened.
    pub fn resolve_settings(&self, stored: &Map<String, Value>) -> Map<String, Value> {
        let mut resolved = self.default_settings();
        for setting in &self.settings {
            if let Some(value) = stored.get(&setting.key) {
                if let Ok(value) = setting.coerce(value) {
                    resolved.insert(setting.key.clone(), value);
                }
            }
        }
        resolved
    }

    /// Coerce one incoming value, rejecting keys this plugin does not declare.
    pub fn coerce_setting(&self, key: &str, value: &Value) -> Result<Value, String> {
        let setting = self
            .settings
            .iter()
            .find(|setting| setting.key == key)
            .ok_or_else(|| msg!(text().setting_undeclared, key = key))?;
        setting.coerce(value)
    }
}

#[derive(Clone, Debug)]
pub struct Package {
    pub tool: Option<crate::tool::Tool>,
    pub manifest: Manifest,
    pub directory: PathBuf,
}

pub fn contained(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
        || relative.contains(':')
        || relative.contains('%')
    {
        return Err("Invalid package path".into());
    }
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let target = root.join(path).canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&root) || !target.is_file() {
        return Err("Package path escapes its directory or is not a file".into());
    }
    Ok(target)
}

impl Package {
    pub fn load(directory: &Path) -> Result<Self, String> {
        let raw = std::fs::read(directory.join("plugin.json")).map_err(|e| e.to_string())?;
        if raw.len() > 64 * 1024 {
            return Err("Manifest is too large".into());
        }
        let manifest: Manifest = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        if manifest.api != 1 {
            return Err("Unsupported plugin API".into());
        }
        if manifest.id.is_empty()
            || manifest.id.len() > 80
            || !manifest
                .id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b".-".contains(&c))
        {
            return Err("Invalid plugin id".into());
        }
        if manifest.file_names.len() > 128
            || manifest
                .file_names
                .iter()
                .any(|name| name.is_empty() || name.len() > 128 || name.contains(['/', '\\']))
        {
            return Err("Invalid fileNames declaration".into());
        }
        if manifest.extensions.len() > 256
            || manifest.extensions.iter().any(|e| {
                e.is_empty() || (e != "*" && !e.bytes().all(|c| c.is_ascii_alphanumeric()))
            })
        {
            return Err("Extensions must be nonempty alphanumeric strings".into());
        }
        validate_settings(&manifest.settings)?;
        validate_i18n(&manifest.i18n, &manifest.settings)?;
        if let Some(icon) = &manifest.icon {
            if icon.is_empty()
                || icon.len() > 40
                || !icon
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            {
                return Err("Icon must be a lowercase kebab-case name".into());
            }
        }
        if manifest.targets.len() > 8
            || manifest.targets.iter().enumerate().any(|(index, target)| {
                !valid_target(target) || manifest.targets[..index].contains(target)
            })
        {
            return Err("Invalid target declaration".into());
        }
        contained(directory, &manifest.executable)?;
        contained(directory, &manifest.entry)?;
        // A plugin may own a view and a panel at the same time: they are two mounts of the
        // same entry, and the panel is where things like a search box or an info card live.
        if manifest.capabilities.is_empty()
            || manifest.capabilities.len() > 3
            || manifest
                .capabilities
                .iter()
                .enumerate()
                .any(|(i, c)| manifest.capabilities[..i].contains(c))
        {
            return Err(
                "Declare view, overlay and controls without repeating one, or controls alone"
                    .into(),
            );
        }
        if manifest.has(Capability::Overlay) != manifest.overlay.is_some() {
            return Err("Overlay capability requires an overlay size declaration".into());
        }
        if manifest.prepare && !manifest.has(Capability::View) {
            return Err("A plugin that prepares before the window is shown must own a view".into());
        }
        if let Some(size) = &manifest.overlay {
            if !(120..=1600).contains(&size.width) || !(24..=1200).contains(&size.height) {
                return Err("Overlay content size must be 120..1600 by 24..1200 CSS pixels".into());
            }
        }
        if manifest.provides.is_some() && manifest.consumes.is_some() {
            return Err("A plugin declares provides or consumes, not both".into());
        }
        if manifest.source_methods.len() > 32
            || (!manifest.source_methods.is_empty() && manifest.provides.is_none())
            || manifest.source_methods.iter().any(|method| {
                method.is_empty()
                    || method.len() > 100
                    || matches!(method.as_str(), "open" | "release" | "settings")
            })
        {
            return Err("Invalid source RPC exports".into());
        }
        for contract in [&manifest.provides, &manifest.consumes]
            .into_iter()
            .flatten()
        {
            if contract.is_empty()
                || contract.len() > 100
                || !contract
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b".-/@".contains(&b))
            {
                return Err("Invalid data contract identifier".into());
            }
        }
        Ok(Self {
            tool: crate::tool::load(directory)?,
            manifest,
            directory: directory.canonicalize().map_err(|e| e.to_string())?,
        })
    }
    pub fn key(&self) -> String {
        self.directory.to_string_lossy().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn manifest_with(settings: Value) -> Manifest {
        serde_json::from_value(json!({
            "api": 1,
            "id": "test.plugin",
            "name": "test",
            "version": "1.0.0",
            "extensions": ["txt"],
            "executable": "worker.exe",
            "entry": "ui/index.html", "capabilities": ["view"],
            "settings": settings,
        }))
        .unwrap()
    }

    #[test]
    fn file_matching_supports_omission_all_star_and_case_insensitive_extensions() {
        let mut manifest = manifest_with(json!([]));
        assert!(manifest.matches("TXT"));
        assert!(!manifest.matches("png"));
        for extensions in [vec![], vec!["all".into()], vec!["*".into()]] {
            manifest.extensions = extensions;
            assert!(manifest.matches("pdf"));
            assert!(manifest.matches(""));
        }
        let mut raw = serde_json::to_value(&manifest).unwrap();
        raw.as_object_mut().unwrap().remove("extensions");
        assert!(serde_json::from_value::<Manifest>(raw)
            .unwrap()
            .matches("fbx"));
    }

    #[test]
    fn prevents_traversal_and_absolute_assets() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ok.js"), "").unwrap();
        assert!(contained(dir.path(), "ok.js").is_ok());
        for value in [
            "../ok.js",
            "C:\\Windows\\win.ini",
            "/etc/passwd",
            "x%2f..",
            "ok.js:stream",
        ] {
            assert!(contained(dir.path(), value).is_err(), "{value}");
        }
    }

    #[test]
    fn an_unknown_setting_type_is_rejected_rather_than_rendered_wrong() {
        let error = serde_json::from_value::<Manifest>(json!({
            "api": 1,
            "id": "test.plugin",
            "name": "test",
            "version": "1.0.0",
            "extensions": ["txt"],
            "executable": "worker.exe",
            "entry": "ui/index.html", "capabilities": ["view"],
            "settings": [{"key": "x", "type": "colour", "label": "X"}],
        }))
        .unwrap_err()
        .to_string();
        assert!(error.contains("colour"), "{error}");
    }

    #[test]
    fn defaults_are_derived_when_the_declaration_omits_one() {
        let manifest = manifest_with(json!([
            {"key": "flag", "type": "bool", "label": "Flag"},
            {"key": "count", "type": "number", "label": "Count"},
            {"key": "mode", "type": "select", "label": "Mode", "options": [
                {"value": "a", "label": "A"}, {"value": "b", "label": "B"}
            ]},
            {"key": "note", "type": "text", "label": "Note"},
        ]));
        assert_eq!(
            Value::Object(manifest.default_settings()),
            json!({"flag": false, "count": 0, "mode": "a", "note": ""})
        );
    }

    #[test]
    fn numbers_are_clamped_and_snapped_to_the_declared_step() {
        let manifest = manifest_with(json!([
            {"key": "zoom", "type": "number", "label": "Zoom",
             "default": 1, "min": 0.5, "max": 4, "step": 0.5}
        ]));
        let coerce = |value: Value| manifest.coerce_setting("zoom", &value);
        assert_eq!(coerce(json!(3.7)).unwrap(), json!(3.5));
        assert_eq!(coerce(json!(99)).unwrap(), json!(4.0));
        assert_eq!(coerce(json!(-5)).unwrap(), json!(0.5));
        assert_eq!(coerce(json!(2)).unwrap(), json!(2.0));
        assert!(coerce(json!("big")).is_err());
        assert!(coerce(json!(null)).is_err());
        // JSON cannot carry a non-finite number, so reach the guard directly.
        assert!(coerce(Value::from(f64::INFINITY)).is_err());
        assert!(coerce(Value::from(f64::NAN)).is_err());
    }

    #[test]
    fn a_select_only_accepts_a_declared_option() {
        let manifest = manifest_with(json!([
            {"key": "mode", "type": "select", "label": "Mode", "default": "fast",
             "options": [{"value": "fast", "label": "快"}, {"value": "safe", "label": "稳"}]}
        ]));
        assert_eq!(
            manifest.coerce_setting("mode", &json!("safe")).unwrap(),
            json!("safe")
        );
        assert!(manifest.coerce_setting("mode", &json!("turbo")).is_err());
        assert!(manifest.coerce_setting("mode", &json!(1)).is_err());
    }

    #[test]
    fn undeclared_keys_are_rejected() {
        let manifest = manifest_with(json!([
            {"key": "known", "type": "bool", "label": "Known"}
        ]));
        assert!(manifest.coerce_setting("known", &json!(true)).is_ok());
        assert!(manifest.coerce_setting("unknown", &json!(true)).is_err());
    }

    #[test]
    fn stored_values_survive_a_reload_and_unknown_ones_are_dropped() {
        let manifest = manifest_with(json!([
            {"key": "flag", "type": "bool", "label": "Flag", "default": true},
            {"key": "count", "type": "number", "label": "Count", "default": 2}
        ]));
        // "gone" was stored by an older version of the plugin and is now undeclared.
        // A number always comes back as f64, so 9 is stored as 9.0.
        let stored = json!({"flag": false, "count": 9, "gone": "x"});
        assert_eq!(
            Value::Object(manifest.resolve_settings(stored.as_object().unwrap())),
            json!({"flag": false, "count": 9.0})
        );
    }

    #[test]
    fn a_stored_value_that_no_longer_fits_the_schema_falls_back_to_the_default() {
        let manifest = manifest_with(json!([
            {"key": "mode", "type": "select", "label": "Mode", "default": "safe",
             "options": [{"value": "safe", "label": "稳"}, {"value": "fast", "label": "快"}]},
            {"key": "zoom", "type": "number", "label": "Zoom", "default": 1,
             "min": 1, "max": 2, "step": 1}
        ]));
        // "turbo" is no longer an option, and 9 is outside the tightened range.
        let stored = json!({"mode": "turbo", "zoom": 9});
        assert_eq!(
            Value::Object(manifest.resolve_settings(stored.as_object().unwrap())),
            json!({"mode": "safe", "zoom": 2.0})
        );
    }

    #[test]
    fn a_declaration_is_validated_before_it_can_be_trusted() {
        let cases = [
            // A default that cannot satisfy its own schema.
            json!([{"key": "n", "type": "number", "label": "N", "default": "text"}]),
            // A select with no options.
            json!([{"key": "s", "type": "select", "label": "S", "options": []}]),
            // Duplicate keys.
            json!([
                {"key": "dup", "type": "bool", "label": "A"},
                {"key": "dup", "type": "bool", "label": "B"}
            ]),
            // An invalid key, and one that is too long.
            json!([{"key": "has space", "type": "bool", "label": "A"}]),
            json!([{"key": "a".repeat(65), "type": "bool", "label": "A"}]),
            // A missing label.
            json!([{"key": "k", "type": "bool", "label": ""}]),
            // Duplicate option values.
            json!([{"key": "s", "type": "select", "label": "S", "options": [
                {"value": "a", "label": "A"}, {"value": "a", "label": "B"}
            ]}]),
            // A folder that would resolve against the plugin process at run time.
            json!([{"key": "d", "type": "folder", "label": "D", "default": "frames"}]),
        ];
        for case in cases {
            let manifest = manifest_with(case.clone());
            assert!(
                validate_settings(&manifest.settings).is_err(),
                "expected {case} to be rejected"
            );
        }
        let ok = manifest_with(json!([
            {"key": "good_key-1", "type": "bool", "label": "Good"}
        ]));
        assert!(validate_settings(&ok.settings).is_ok());
    }

    /// A folder setting is the one path the host hands to a native process, so it accepts
    /// the two shapes a declaration can promise and refuses the rest.
    #[test]
    fn a_folder_setting_is_empty_or_absolute() {
        let manifest = manifest_with(json!([
            {"key": "d", "type": "folder", "label": "D"}
        ]));
        assert!(validate_settings(&manifest.settings).is_ok());
        let folder = &manifest.settings[0];
        assert_eq!(folder.default_value(), json!(""));
        assert_eq!(folder.coerce(&json!("")).unwrap(), json!(""));
        let absolute = if cfg!(windows) {
            r"C:\Frames"
        } else {
            "/frames"
        };
        assert_eq!(folder.coerce(&json!(absolute)).unwrap(), json!(absolute));
        assert!(folder.coerce(&json!("frames")).is_err());
        assert!(folder.coerce(&json!(7)).is_err());
    }

    /// A manifest with the given settings and language table, loaded the way a package is.
    fn load_with(settings: Value, i18n: Value) -> Result<Manifest, String> {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("worker.exe"), "").unwrap();
        std::fs::create_dir_all(directory.path().join("ui")).unwrap();
        std::fs::write(directory.path().join("ui/index.html"), "").unwrap();
        std::fs::write(
            directory.path().join("plugin.json"),
            json!({
                "api": 1,
                "id": "test.plugin",
                "name": "测试插件",
                "version": "1.0.0",
                "extensions": ["txt"],
                "executable": "worker.exe",
                "entry": "ui/index.html",
                "capabilities": ["view"],
                "settings": settings,
                "i18n": i18n,
            })
            .to_string(),
        )
        .unwrap();
        Package::load(directory.path()).map(|package| package.manifest)
    }

    /// The settings the language tests translate: one switch and one select.
    fn translatable() -> Value {
        json!([
            {"key": "wrap", "type": "bool", "label": "自动换行", "help": "关闭后不折断。", "default": true},
            {"key": "mode", "type": "select", "label": "模式", "default": "a",
             "options": [{"value": "a", "label": "甲"}, {"value": "b", "label": "乙"}]}
        ])
    }

    #[test]
    fn a_manifest_speaks_the_language_the_host_is_showing() {
        let manifest = load_with(
            translatable(),
            json!({"en": {
                "name": "Test Plugin",
                "settings": {"wrap": {"label": "Wrap long lines"}, "mode": {"options": {"b": "Second"}}}
            }}),
        )
        .unwrap();

        let english = manifest.localized(Locale::En);
        assert_eq!(english.name, "Test Plugin");
        assert_eq!(english.settings[0].label, "Wrap long lines");
        // A field the translation leaves out keeps the declaration: a plugin writes only
        // what it can actually translate.
        assert_eq!(english.settings[0].help.as_deref(), Some("关闭后不折断。"));
        // Options are translated one by one, and the ones left out stay as declared.
        let options = english.settings[1].options.as_ref().unwrap();
        assert_eq!(options[0].label, "甲");
        assert_eq!(options[1].label, "Second");
        // The declaration itself is untouched: this is a copy, not a rewrite.
        assert_eq!(manifest.name, "测试插件");
        assert_eq!(manifest.settings[0].label, "自动换行");
    }

    #[test]
    fn a_language_tag_falls_back_to_its_bare_language_and_then_to_nothing() {
        // Declared as `zh`, asked for as `zh-CN`: the same language, and the host is the
        // side that spells it with a region.
        let bare = load_with(translatable(), json!({"zh": {"name": "简体名"}})).unwrap();
        assert_eq!(bare.localized(Locale::Zh).name, "简体名");

        // Nothing declared for this language: the manifest stands as written, which is
        // what a plugin that never translated itself relies on.
        let manifest = load_with(translatable(), json!({"en": {"name": "Test Plugin"}})).unwrap();
        let chinese = manifest.localized(Locale::Zh);
        assert_eq!(chinese.name, "测试插件");
        assert_eq!(chinese.settings[1].label, "模式");
    }

    #[test]
    fn a_translation_must_name_what_the_manifest_declares() {
        for rejected in [
            // Not a language tag: it could never be looked up.
            json!({"zh_CN": {"name": "x"}}),
            // A name nobody can draw.
            json!({"en": {"name": ""}}),
            // A setting that does not exist, which would translate nothing at all.
            json!({"en": {"settings": {"gone": {"label": "Gone"}}}}),
            // An option the select does not declare, and options on a setting without any.
            json!({"en": {"settings": {"mode": {"options": {"c": "Third"}}}}}),
            json!({"en": {"settings": {"wrap": {"options": {"a": "A"}}}}}),
            // Labels that are empty or too long.
            json!({"en": {"settings": {"wrap": {"label": ""}}}}),
            json!({"en": {"name": "x".repeat(81)}}),
            // More languages than a manifest may carry.
            serde_json::json!({"en": {"name": "x"}, "zh": {"name": "x"}, "fr": {"name": "x"},
                "de": {"name": "x"}, "es": {"name": "x"}, "it": {"name": "x"}, "pt": {"name": "x"},
                "nl": {"name": "x"}, "pl": {"name": "x"}, "sv": {"name": "x"}, "da": {"name": "x"},
                "fi": {"name": "x"}, "no": {"name": "x"}, "cs": {"name": "x"}, "el": {"name": "x"},
                "tr": {"name": "x"}, "ja": {"name": "x"}}),
        ] {
            assert!(
                load_with(translatable(), rejected.clone()).is_err(),
                "expected {rejected} to be rejected"
            );
        }

        // A translation of everything that exists is what a package should carry.
        assert!(load_with(
            translatable(),
            json!({"en": {
                "name": "Test Plugin",
                "settings": {
                    "wrap": {"label": "Wrap long lines", "help": "Off, lines are not folded."},
                    "mode": {"label": "Mode", "options": {"a": "First", "b": "Second"}}
                }
            }}),
        )
        .is_ok());
    }

    #[test]
    fn too_many_settings_are_rejected() {
        let settings: Vec<Value> = (0..MAX_SETTINGS + 1)
            .map(|index| json!({"key": format!("k{index}"), "type": "bool", "label": "K"}))
            .collect();
        let manifest = manifest_with(Value::Array(settings));
        assert!(validate_settings(&manifest.settings).is_err());
    }

    /// Write a package with the given icon and load it through the real entry point.
    fn load_with_icon(icon: Option<Value>) -> Result<Manifest, String> {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("worker.exe"), "").unwrap();
        std::fs::create_dir_all(directory.path().join("ui")).unwrap();
        std::fs::write(directory.path().join("ui/index.html"), "").unwrap();
        let mut value = json!({
            "api": 1,
            "id": "test.plugin",
            "name": "test",
            "version": "1.0.0",
            "extensions": ["txt"],
            "executable": "worker.exe",
            "entry": "ui/index.html", "capabilities": ["view"],
        });
        if let Some(icon) = icon {
            value["icon"] = icon;
        }
        std::fs::write(directory.path().join("plugin.json"), value.to_string()).unwrap();
        Package::load(directory.path()).map(|package| package.manifest)
    }

    #[test]
    fn an_icon_name_is_optional_but_must_be_kebab_case() {
        // Absent is fine, and so is a well-formed name.
        assert!(load_with_icon(None).is_ok());
        assert_eq!(
            load_with_icon(Some(json!("image")))
                .unwrap()
                .icon
                .as_deref(),
            Some("image")
        );
        assert!(load_with_icon(Some(json!("file-text"))).is_ok());
        assert!(load_with_icon(Some(json!("file-text-2"))).is_ok());

        // Anything the host cannot look up cleanly is rejected at load time.
        for bad in [
            json!(""),
            json!("Image"),
            json!("file text"),
            json!("file_text"),
            json!("../../icon"),
            json!("a".repeat(41)),
        ] {
            assert!(
                load_with_icon(Some(bad.clone())).is_err(),
                "{bad} should be rejected"
            );
        }
    }

    #[test]
    fn an_unknown_icon_name_still_loads_so_the_catalogue_can_grow() {
        // The host falls back to a generic icon; an old host must not reject a new plugin.
        let manifest = load_with_icon(Some(json!("some-future-icon"))).unwrap();
        assert_eq!(manifest.icon.as_deref(), Some("some-future-icon"));
    }

    /// Write a package with the given capabilities and overlay declaration.
    fn load_with_capabilities(
        capabilities: Value,
        overlay: Option<Value>,
    ) -> Result<Manifest, String> {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("worker.exe"), "").unwrap();
        std::fs::create_dir_all(directory.path().join("ui")).unwrap();
        std::fs::write(directory.path().join("ui/index.html"), "").unwrap();
        let mut value = json!({
            "api": 1,
            "id": "test.plugin",
            "name": "test",
            "version": "1.0.0",
            "extensions": ["txt"],
            "executable": "worker.exe",
            "entry": "ui/index.html",
            "capabilities": capabilities,
        });
        if let Some(overlay) = overlay {
            value["overlay"] = overlay;
        }
        std::fs::write(directory.path().join("plugin.json"), value.to_string()).unwrap();
        Package::load(directory.path()).map(|package| package.manifest)
    }

    #[test]
    fn one_entry_may_own_both_a_view_and_a_panel() {
        // A plugin that needs a floating surface next to its view (a search box, a tool
        // palette) declares both. They are two mounts of the same entry, not two packages.
        let manifest = load_with_capabilities(
            json!(["view", "overlay", "controls"]),
            Some(json!({"width": 320, "height": 48, "anchor": "bottomRight"})),
        )
        .unwrap();
        assert!(manifest.has(Capability::View));
        assert!(manifest.has(Capability::Overlay));
        assert_eq!(
            manifest.overlay.as_ref().map(|size| size.anchor),
            Some(OverlayAnchor::BottomRight)
        );
    }

    #[test]
    fn a_panel_can_be_as_short_as_its_content_needs() {
        // The floor only has to catch nonsense sizes; a one-row control strip is a
        // legitimate panel and must not be forced to carry dead space.
        let short = load_with_capabilities(
            json!(["overlay"]),
            Some(json!({"width": 340, "height": 36})),
        )
        .unwrap();
        assert_eq!(short.overlay.as_ref().map(|size| size.height), Some(36));
        assert!(load_with_capabilities(
            json!(["overlay"]),
            Some(json!({"width": 340, "height": 20}))
        )
        .is_err());
        assert!(load_with_capabilities(
            json!(["overlay"]),
            Some(json!({"width": 100, "height": 36}))
        )
        .is_err());
    }

    #[test]
    fn a_panel_anchor_defaults_to_the_top_right() {
        let manifest = load_with_capabilities(
            json!(["overlay"]),
            Some(json!({"width": 290, "height": 152})),
        )
        .unwrap();
        assert_eq!(
            manifest.overlay.as_ref().map(|size| size.anchor),
            Some(OverlayAnchor::TopRight)
        );
    }

    #[test]
    fn repeated_capabilities_and_missing_panel_sizes_are_still_rejected() {
        for capabilities in [
            json!(["view", "view"]),
            json!(["overlay", "overlay"]),
            json!(["view", "overlay", "controls", "controls"]),
        ] {
            assert!(
                load_with_capabilities(
                    capabilities.clone(),
                    Some(json!({"width": 200, "height": 100}))
                )
                .is_err(),
                "{capabilities} should be rejected"
            );
        }
        // The overlay capability and its size declaration stay locked together.
        assert!(load_with_capabilities(json!(["overlay"]), None).is_err());
        assert!(load_with_capabilities(
            json!(["view"]),
            Some(json!({"width": 200, "height": 100}))
        )
        .is_err());
        assert!(load_with_capabilities(json!(["view"]), None).is_ok());
        assert!(load_with_capabilities(json!(["controls"]), None).is_ok());
    }

    #[test]
    fn preparing_before_the_window_is_shown_needs_a_view_to_show() {
        // The preparation exists to size the window a view is about to appear in, so a plugin
        // with no view has nothing to prepare. Anything else is accepted, and a package that
        // never mentions it prepares nothing.
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("worker.exe"), "").unwrap();
        std::fs::create_dir_all(directory.path().join("ui")).unwrap();
        std::fs::write(directory.path().join("ui/index.html"), "").unwrap();
        let write = |prepare: bool, capabilities: Value| {
            let mut value = json!({
                "api": 1,
                "id": "test.plugin",
                "name": "test",
                "version": "1.0.0",
                "extensions": ["png"],
                "executable": "worker.exe",
                "entry": "ui/index.html",
                "capabilities": capabilities,
            });
            if prepare {
                value["prepare"] = json!(true);
            }
            std::fs::write(directory.path().join("plugin.json"), value.to_string()).unwrap();
            Package::load(directory.path()).map(|package| package.manifest)
        };
        assert!(write(true, json!(["view"])).unwrap().prepare);
        assert!(!write(false, json!(["view"])).unwrap().prepare);
        assert!(write(true, json!(["controls"])).is_err());
    }
}
