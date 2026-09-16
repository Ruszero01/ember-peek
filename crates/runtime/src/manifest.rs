use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Component, Path, PathBuf};

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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingOption {
    pub value: String,
    pub label: String,
}

pub const MAX_SETTINGS: usize = 32;

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
        }
    }

    /// Coerce a stored or user-supplied value onto this declaration. Returns the
    /// value unchanged when it is already valid.
    pub fn coerce(&self, value: &Value) -> Result<Value, String> {
        match self.kind {
            SettingKind::Bool => value
                .as_bool()
                .map(Value::Bool)
                .ok_or_else(|| format!("{} 需要布尔值", self.key)),
            SettingKind::Number => {
                let mut number = value
                    .as_f64()
                    .ok_or_else(|| format!("{} 需要数字", self.key))?;
                if !number.is_finite() {
                    return Err(format!("{} 需要有限数字", self.key));
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
                    .ok_or_else(|| format!("{} 需要字符串选项", self.key))?;
                let options = self.options.as_deref().unwrap_or_default();
                if !options.iter().any(|option| option.value == selected) {
                    return Err(format!("{} 的取值不在选项中", self.key));
                }
                Ok(Value::String(selected.to_owned()))
            }
            SettingKind::Text => {
                let text = value
                    .as_str()
                    .ok_or_else(|| format!("{} 需要文本", self.key))?;
                if text.chars().count() > 4096 {
                    return Err(format!("{} 超出 4096 字符", self.key));
                }
                Ok(Value::String(text.to_owned()))
            }
        }
    }
}

/// Validate every declaration at load time so later coercion can trust the schema.
fn validate_settings(settings: &[Setting]) -> Result<(), String> {
    if settings.len() > MAX_SETTINGS {
        return Err(format!("设置项最多 {MAX_SETTINGS} 个"));
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
            return Err(format!("设置项 key 无效：{}", setting.key));
        }
        if !seen.insert(setting.key.as_str()) {
            return Err(format!("设置项 key 重复：{}", setting.key));
        }
        if setting.label.is_empty() || setting.label.chars().count() > 80 {
            return Err(format!("设置项 {} 的名称无效", setting.key));
        }
        if setting
            .help
            .as_ref()
            .is_some_and(|h| h.chars().count() > 400)
        {
            return Err(format!("设置项 {} 的说明过长", setting.key));
        }
        if let Some(multiplier) = setting.display_multiplier {
            if setting.kind != SettingKind::Number
                || !multiplier.is_finite()
                || multiplier <= 0.0
            {
                return Err(format!("设置项 {} 的显示倍率无效", setting.key));
            }
        }
        if setting.suffix.as_ref().is_some_and(|suffix| {
            setting.kind != SettingKind::Number || suffix.chars().count() > 8
        }) {
            return Err(format!("设置项 {} 的单位无效", setting.key));
        }
        if !setting.default.is_null() {
            setting
                .coerce(&setting.default)
                .map_err(|e| format!("设置项 {} 的默认值无效：{e}", setting.key))?;
        }
        if setting.kind == SettingKind::Select && setting.options.as_ref().is_none_or(Vec::is_empty)
        {
            return Err(format!("设置项 {} 需要 options", setting.key));
        }
        if let Some(options) = &setting.options {
            if options.len() > 64 {
                return Err(format!("设置项 {} 的选项过多", setting.key));
            }
            let mut values = std::collections::HashSet::new();
            for option in options {
                if option.value.is_empty()
                    || option.value.chars().count() > 64
                    || option.label.chars().count() > 80
                {
                    return Err(format!("设置项 {} 的选项无效", setting.key));
                }
                if !values.insert(option.value.as_str()) {
                    return Err(format!("设置项 {} 的选项重复", setting.key));
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
    WriteFile,
    Clipboard,
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
            .ok_or_else(|| format!("插件未声明设置项 {key}"))?;
        setting.coerce(value)
    }
}

#[derive(Clone, Debug)]
pub struct Package {
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
            || manifest
                .targets
                .iter()
                .enumerate()
                .any(|(index, target)| {
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
}
