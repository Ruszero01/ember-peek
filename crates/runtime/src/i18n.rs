//! Text the native side has to produce in the user's language.
//!
//! The interface language belongs to the window, but not all of it can be written there:
//! the host builds its tray menu, opens native dialogs, titles its windows and answers
//! errors long before a window is on screen, and error text it returns is shown verbatim.
//! So the active language lives here, as one process-wide value — an application has one
//! user and one language, and the alternative is threading a `Locale` through every
//! function that can fail — and every message that can reach a user is looked up rather
//! than written out.
//!
//! `text!` declares both languages side by side and requires both, so a message can never
//! have a translation missing. It also emits `ALL`, which is what the checks below walk,
//! so a new message cannot slip past them either.
//!
//! What stays out: log lines (diagnostics, not interface), and messages about a *package's*
//! declaration being malformed — `Package::load`, artifact extraction shapes. Those are
//! author-facing the way a compiler error is, and they were English before this module
//! existed.

use std::sync::atomic::{AtomicU8, Ordering};

/// The interface languages this build speaks.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Locale {
    Zh = 0,
    En = 1,
}

impl Default for Locale {
    /// The project's own language: what a caller that never sets one gets, which is also
    /// what every test that does not care about language assumes.
    fn default() -> Self {
        Locale::Zh
    }
}

impl Locale {
    /// The locale a BCP-47 tag asks for. Anything that is not Chinese reads as English,
    /// which is the best this build can do for a language it does not have.
    pub fn from_tag(tag: &str) -> Self {
        if tag.trim().to_ascii_lowercase().starts_with("zh") {
            Locale::Zh
        } else {
            Locale::En
        }
    }

    /// The tag this locale is written as, and the one plugin views are handed.
    pub fn tag(self) -> &'static str {
        match self {
            Locale::Zh => "zh-CN",
            Locale::En => "en",
        }
    }
}

static ACTIVE: AtomicU8 = AtomicU8::new(Locale::Zh as u8);

/// Set the language every subsequent message is written in.
pub fn set_locale(locale: Locale) {
    ACTIVE.store(locale as u8, Ordering::Relaxed);
}

/// The language in force.
pub fn locale() -> Locale {
    if ACTIVE.load(Ordering::Relaxed) == Locale::En as u8 {
        Locale::En
    } else {
        Locale::Zh
    }
}

/// The messages of the language in force.
pub fn text() -> &'static Text {
    match locale() {
        Locale::Zh => &ZH,
        Locale::En => &EN,
    }
}

/// The action a refusal is about. A named action rather than a word the caller passes in,
/// because where English needs "uninstall" Chinese needs 卸载 and only this module has both.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Refusal {
    Uninstall,
    Disable,
    Update,
    Reset,
    Return,
}

/// Substitute `{name}` placeholders. An unfilled placeholder is left in place: a missing
/// value should look wrong rather than read as an empty gap.
pub fn fill(template: &str, values: &[(&str, String)]) -> String {
    let mut out = template.to_string();
    for (key, value) in values {
        out = out.replace(&format!("{{{key}}}"), value);
    }
    out
}

/// `fill` with the placeholders written as named arguments, which is how every
/// parameterized message is built:
///
/// ```text
/// msg!(t.package_too_large, limit = limit)
/// ```
macro_rules! msg {
    ($template:expr $(, $key:ident = $value:expr)* $(,)?) => {
        $crate::i18n::fill($template, &[$( (stringify!($key), format!("{}", $value)) ),*])
    };
}
// Reachable as `i18n::msg` wherever a message needs one.
pub(crate) use msg;

macro_rules! text {
    ($( $field:ident : $zh:expr, $en:expr ; )*) => {
        /// Every message the host can show a user, in one language.
        pub struct Text {
            $(pub $field: &'static str,)*
        }
        static ZH: Text = Text { $($field: $zh,)* };
        static EN: Text = Text { $($field: $en,)* };
        /// Every message as (field, Chinese, English), for the checks that have to see all
        /// of them; generated here so it cannot fall out of step with the table.
        #[cfg(test)]
        pub(crate) const ALL: &[(&str, &str, &str)] = &[ $( (stringify!($field), $zh, $en), )* ];
    };
}

text! {
    // Separators: languages punctuate lists differently, and a sentence built by joining
    // parts has to be joined the way the language does it.
    list_separator: "、", ", ";
    semicolon: "；", "; ";
    file_error: "{file}：{error}", "{file}: {error}";

    // Tray, windows and native dialogs. The brand name is not translated and is
    // written at the call site.
    tray_settings: "设置", "Settings";
    tray_reset: "重置为首次启动", "Reset to first launch";
    tray_quit: "退出", "Quit";
    window_settings_title: "Ember Peek · 设置", "Ember Peek · Settings";
    dialog_reset_failed: "无法重置为首次启动", "Could not reset to first launch";
    dialog_pending_title: "有未保存的编辑", "Unsaved edits";
    dialog_pending_note: "退出将丢弃所有未保存的编辑，是否继续？", "Quitting discards every unsaved edit. Continue?";
    dialog_pick_folder: "选择目录", "Choose a folder";
    dialog_pick_package: "选择插件包", "Choose a plugin package";
    dialog_pick_file: "打开文件", "Open file";
    dev_source_name: "开发镜像", "Development mirror";

    // Plugin activation and settings.
    pending_fallback: "尚未提交的变更", "unsaved changes";
    refusal: "“{file}”有{reason}，请先保存或放弃后再{verb}", "\"{file}\" has {reason}; save or discard it before you {verb}";
    refusal_uninstall: "卸载", "uninstall";
    refusal_disable: "停用", "disable";
    refusal_update: "更新", "update";
    refusal_reset: "重置", "reset";
    refusal_return: "返回", "go back";
    plugins_changed: "插件列表已改变，请刷新后重试", "The plugin list changed; refresh and try again";
    too_many_plugins: "插件数量过多", "Too many plugins";
    priority_range: "优先级应在 -1000 到 1000 之间", "Priority must be between -1000 and 1000";
    setting_undeclared: "插件未声明设置项 {key}", "The plugin declares no setting {key}";

    // Host state file.
    state_corrupt: "宿主状态损坏或不可读：{error}；备份也不可用：{backup}。原文件已保留。", "Host state is corrupt or unreadable: {error}; the backup is unusable too: {backup}. The original file was kept.";
    state_invalid: "宿主状态无效，拒绝覆盖：{error}", "Refusing to overwrite host state that is invalid: {error}";
    state_unreadable: "读取原状态失败，拒绝覆盖：{error}", "Refusing to overwrite host state that cannot be read: {error}";

    // Installing, updating and repairing a package.
    invalid_version: "插件版本无效：{error}", "Invalid plugin version: {error}";
    installed_invalid_version: "已安装插件版本无效：{error}", "The installed plugin's version is invalid: {error}";
    downgrade: "拒绝将插件从 {installed} 降级到 {incoming}", "Refusing to downgrade the plugin from {installed} to {incoming}";
    swap_failed: "无法替换插件目录：{error}", "Could not replace the plugin directory: {error}";
    reopen_failed: "插件已更新，但预览没有恢复：{failures}", "The plugin was updated, but the previews did not come back: {failures}";
    invalid_directory_name: "插件目录名无效", "Invalid plugin directory name";

    // Sessions and contribution composition.
    open_failed: "打开文件失败：{error}", "Could not open the file: {error}";
    pick_file: "请选择一个文件", "Choose a file";
    updating: "插件正在更新，请稍后重试", "A plugin is being updated; try again in a moment";
    unsupported_extension: "没有已启用的插件支持 .{extension}，请安装相应插件", "No enabled plugin handles .{extension}; install one for this format";
    too_many_per_file: "一个文件最多同时加载 32 个插件，请停用部分插件", "At most 32 plugins can load one file; disable some";
    too_many_sessions: "已有 16 个文件会话仍在加载或包含未保存编辑，请等待加载完成或保存编辑", "16 file sessions are still loading or contain unsaved edits; wait for loading to finish or save your edits";
    too_many_instances: "后台插件实例已达 64 个，请保存草稿或等待回收", "64 plugin instances are already running in the background; save your drafts or wait for recycling";
    missing_source: "缺少兼容解析源 {contract}（当前源：{current}）", "No compatible data source {contract} (current source: {current})";
    source_failed: "解析源失败：{error}", "The data source failed: {error}";
    no_source: "没有可用的解析源", "No data source available";
    source_expired: "解析源已过期", "The data source expired";
    no_contract: "该插件没有共享数据契约", "This plugin has no shared data contract";
    plugin_disabled: "插件已停用", "The plugin is disabled";

    // The host's own toolbar actions. They belong to no plugin, so their text lives here.
    open_default_missing: "没有正在预览的文件", "No file is being previewed";
    open_default_failed: "无法用默认应用打开该文件：{error}", "Could not open the file with its default app: {error}";

    // Session lookups the host answers while a view is talking to it.
    session_expired: "会话已过期", "The session expired";
    session_not_ready: "会话尚未就绪", "The session is not ready yet";
    unknown_plugin: "未知插件", "Unknown plugin";
    worker_expired: "插件进程已退出", "The plugin process is gone";
    permission_undeclared: "插件未声明该权限", "The plugin does not declare that permission";
    reserved_method: "该方法是宿主保留的", "That method is reserved by the host";
    too_many_calls: "并发插件调用过多", "Too many plugin calls at once";
    source_method_unexported: "解析源没有导出该方法", "The data source does not export that method";
    navigation_too_large: "阅读位置数据超过 4 KiB", "Navigation state is over 4 KiB";
    view_timeout: "插件视图初始化超过 120 秒", "Plugin view initialization exceeded 120 seconds";

    // Setting declarations and coercion.
    settings_limit: "设置项最多 {max} 个", "A plugin may declare at most {max} settings";
    setting_key_invalid: "设置项 key 无效：{key}", "Invalid setting key: {key}";
    setting_key_duplicate: "设置项 key 重复：{key}", "Duplicate setting key: {key}";
    setting_label_invalid: "设置项 {key} 的名称无效", "Setting {key} has an invalid label";
    setting_help_invalid: "设置项 {key} 的说明过长", "Setting {key} has too long a help text";
    setting_multiplier_invalid: "设置项 {key} 的显示倍率无效", "Setting {key} has an invalid display multiplier";
    setting_suffix_invalid: "设置项 {key} 的单位无效", "Setting {key} has an invalid unit";
    setting_default_invalid: "设置项 {key} 的默认值无效：{error}", "Setting {key} has an invalid default: {error}";
    setting_needs_options: "设置项 {key} 需要 options", "Setting {key} needs options";
    setting_options_limit: "设置项 {key} 的选项过多", "Setting {key} has too many options";
    setting_option_invalid: "设置项 {key} 的选项无效", "Setting {key} has an invalid option";
    setting_option_duplicate: "设置项 {key} 的选项重复", "Setting {key} has duplicate options";
    coerce_bool: "{key} 需要布尔值", "{key} needs a boolean";
    coerce_number: "{key} 需要数字", "{key} needs a number";
    coerce_finite: "{key} 需要有限数字", "{key} needs a finite number";
    coerce_option_string: "{key} 需要字符串选项", "{key} needs one of its string options";
    coerce_option_unknown: "{key} 的取值不在选项中", "{key} is not one of the declared options";
    coerce_text: "{key} 需要文本", "{key} needs text";
    coerce_text_too_long: "{key} 超出 4096 字符", "{key} is over 4096 characters";
    coerce_folder: "{key} 需要文件夹路径", "{key} needs a folder path";
    coerce_folder_absolute: "{key} 需要绝对路径，或留空表示不指定", "{key} needs an absolute path, or an empty value for none";

    // A manifest that translates itself.
    i18n_limit: "插件最多声明 {max} 种语言", "A plugin may declare at most {max} languages";
    i18n_tag_invalid: "插件声明的语言标签无效：{tag}", "Invalid language tag in the manifest: {tag}";
    i18n_name_invalid: "{tag} 声明的插件名称无效", "The {tag} name is empty or too long";
    i18n_setting_undeclared: "{tag} 的翻译引用了未声明的设置项：{key}", "The {tag} translation names an undeclared setting: {key}";
    i18n_label_invalid: "{tag} 中 {key} 的名称无效", "The {tag} label for {key} is empty or too long";
    i18n_help_invalid: "{tag} 中 {key} 的说明过长", "The {tag} help text for {key} is too long";
    i18n_option_undeclared: "{tag} 中 {key} 的翻译引用了未声明的选项：{value}", "The {tag} translation of {key} names an undeclared option: {value}";
    i18n_option_invalid: "{tag} 中 {key} 的选项 {value} 名称无效", "The {tag} option label {value} of {key} is empty or too long";
    i18n_options_unexpected: "{tag} 中 {key} 没有可翻译的选项", "The {tag} translation of {key} labels options that do not exist";

    // Plugin sources.
    sources_read_failed: "读取插件来源配置失败 {path}：{error}", "Could not read the plugin source configuration at {path}: {error}";
    sources_too_large: "插件来源配置超过 64 KiB", "The plugin source configuration is over 64 KiB";
    sources_invalid: "插件来源配置无效：{error}", "Invalid plugin source configuration: {error}";
    sources_api: "不支持的插件来源配置版本", "Unsupported plugin source configuration version";
    sources_limit: "插件来源最多 {max} 个", "At most {max} plugin sources";
    sources_empty: "尚未配置插件来源，请先配置官方 OSS 地址", "No plugin source is configured; set one up first";
    source_field_invalid: "市场来源 {label} 的 {field} 无效：{value}", "Source {label} has an invalid {field}: {value}";
    source_field_scheme: "市场来源 {label} 的 {field} 必须是 http(s) 地址、file:// 或绝对路径：{value}", "Source {label} needs {field} to be an http(s) URL, a file:// URL or an absolute path: {value}";
    client_failed: "无法初始化下载客户端：{error}", "Could not start the download client: {error}";

    // Reading a catalog.
    catalog_read_failed: "读取市场目录 {catalog} 失败：{error}", "Could not read the catalog at {catalog}: {error}";
    catalog_http: "读取市场目录 {catalog} 失败：HTTP {status}", "Could not read the catalog at {catalog}: HTTP {status}";
    catalog_interrupted: "读取市场目录 {catalog} 中断：{error}", "Reading the catalog at {catalog} was interrupted: {error}";
    catalog_too_large: "市场目录 {catalog} 超过 1 MiB", "The catalog at {catalog} is over 1 MiB";
    catalog_stale: "{error}（沿用上次读取到的目录）", "{error} (keeping the last catalog that was read)";
    catalog_signed: "该市场目录声明了签名（{algorithm}），但当前版本尚未实现签名校验，因此拒绝使用它；请改用未签名的目录，或等待签名支持", "This catalog declares a signature ({algorithm}), but this version does not implement signature checks, so it is refused; use an unsigned catalog or wait for signature support";
    shape_unknown: "形状未知", "unknown shape";
    entry_artifact_invalid: "目录中的 artifact 名无效：{artifact}", "Invalid artifact name in the catalog: {artifact}";
    entry_sha_invalid: "目录条目 {id} 的 sha256 无效", "Catalog entry {id} has an invalid sha256";
    entry_size_invalid: "目录条目 {id} 的 size 无效", "Catalog entry {id} has an invalid size";
    entry_build_invalid: "目录条目 {id} 的 buildId 无效", "Catalog entry {id} has an invalid buildId";
    entry_version_invalid: "目录条目 {id} 的 version 无效", "Catalog entry {id} has an invalid version";
    entry_duplicate_hash: "插件 {id} 在来源 {first} 与 {second} 声明的 sha256 不一致，已忽略后者", "Plugin {id} declares different sha256 in {first} and {second}; the latter was ignored";
    target_skipped: "{name} 面向 {targets}，已跳过（当前平台 {host}）", "{name} targets {targets} and was skipped (this platform is {host})";
    target_unsupported: "该插件面向 {targets}，无法在当前平台（{host}）运行", "This plugin targets {targets} and cannot run on this platform ({host})";
    package_target_unsupported: "插件包面向 {targets}，无法在当前平台（{host}）运行", "The package targets {targets} and cannot run on this platform ({host})";

    // Checking a package against the catalog.
    not_in_catalog: "插件不在市场目录中", "The plugin is not in any catalog";
    package_hash_mismatch: "{url}：插件包校验失败，sha256 不符", "{url}: the package failed verification; its sha256 does not match";
    package_size_mismatch: "{url}：插件包大小与目录记录不符", "{url}: the package size does not match the catalog";
    package_id_mismatch: "插件包内的插件是 {found}，与目录中的 {expected} 不符", "The package contains plugin {found}, not {expected} as the catalog says";
    package_build_mismatch: "插件包内容不是目录记录的那次构建：包内 {found}，目录 {expected}", "The package is not the build the catalog records: {found} inside, {expected} in the catalog";
    package_version_mismatch: "插件包版本与目录记录不符：包内 {found}，目录 {expected}", "The package version does not match the catalog: {found} inside, {expected} in the catalog";
    download_failed: "下载插件包失败：{failures}", "Could not download the plugin package: {failures}";
    cache_write_failed: "无法写入插件缓存：{error}", "Could not write to the plugin cache: {error}";

    // Downloading and unpacking.
    download_error: "下载失败：{error}", "Download failed: {error}";
    download_http: "下载失败：HTTP {status}", "Download failed: HTTP {status}";
    download_interrupted: "下载中断：{error}", "The download was interrupted: {error}";
    package_read_failed: "读取插件包失败 {path}：{error}", "Could not read the plugin package at {path}: {error}";
    package_too_large: "插件包超过 {limit} MiB 上限", "The plugin package is over the {limit} MiB limit";
    package_not_zip: "插件包不是可读的 zip：{error}", "The plugin package is not a readable zip: {error}";
    package_empty: "插件包是空的", "The plugin package is empty";
    package_no_files: "插件包里没有文件", "The plugin package contains no files";
    package_no_manifest: "插件包缺少 plugin.json", "The plugin package has no plugin.json";
    package_too_many_entries: "插件包条目超过 {limit} 个", "The plugin package has more than {limit} entries";
    entry_read_failed: "读取插件包条目失败：{error}", "Could not read a package entry: {error}";
    entry_encrypted: "插件包条目已加密：{name}", "The package entry is encrypted: {name}";
    entry_duplicate: "插件包存在重复条目：{name}", "The package repeats an entry: {name}";
    entry_path_escapes: "插件包条目名越界：{name}", "A package entry escapes its directory: {name}";
    entry_symlink: "插件包不允许符号链接：{name}", "The package may not contain symlinks: {name}";
    entry_not_file: "插件包条目不是普通文件：{name}", "A package entry is not a regular file: {name}";
    entry_extract_failed: "解包 {name} 失败：{error}", "Could not unpack {name}: {error}";
    entry_write_failed: "写入 {name} 失败：{error}", "Could not write {name}: {error}";
    write_failed: "无法写入 {name}：{error}", "Could not write {name}: {error}";
}

impl Text {
    /// The verb a refusal uses for the action being refused.
    pub fn verb(&self, action: Refusal) -> &'static str {
        match action {
            Refusal::Uninstall => self.refusal_uninstall,
            Refusal::Disable => self.refusal_disable,
            Refusal::Update => self.refusal_update,
            Refusal::Reset => self.refusal_reset,
            Refusal::Return => self.refusal_return,
        }
    }

    /// The sentence every path that refuses to destroy uncommitted work uses, so
    /// uninstalling, disabling, replacing and quitting all explain it the same way.
    pub fn refusal(&self, file: &str, reason: &str, action: Refusal) -> String {
        fill(
            self.refusal,
            &[
                ("file", file.to_owned()),
                ("reason", reason.to_owned()),
                ("verb", self.verb(action).to_owned()),
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tag_selects_the_language_and_unknown_ones_read_as_english() {
        assert_eq!(Locale::from_tag("zh-CN"), Locale::Zh);
        assert_eq!(Locale::from_tag("zh-Hant-TW"), Locale::Zh);
        assert_eq!(Locale::from_tag("en-US"), Locale::En);
        // Nothing else is claimed: a language this build does not have falls back to the
        // one its reader is most likely to understand.
        assert_eq!(Locale::from_tag("fr"), Locale::En);
        assert_eq!(Locale::from_tag(""), Locale::En);
    }

    #[test]
    fn every_message_is_written_in_both_languages() {
        assert!(!ALL.is_empty());
        for (field, zh, en) in ALL {
            assert!(!zh.is_empty(), "{field} has no Chinese text");
            assert!(!en.is_empty(), "{field} has no English text");
            // A translation that is a copy of the source is usually a message somebody
            // forgot to translate; only the two separators are punctuation, not words.
            assert!(
                zh != en || matches!(*field, "list_separator" | "semicolon"),
                "{field} is the same in both languages"
            );
        }
    }

    #[test]
    fn placeholders_match_between_languages() {
        // A message whose placeholders differ between languages renders a raw `{name}` in
        // one of them, which is the bug a table like this exists to prevent.
        for (field, zh, en) in ALL {
            let mut left = placeholders(zh);
            let mut right = placeholders(en);
            left.sort();
            right.sort();
            assert_eq!(left, right, "{field} has different placeholders");
        }
    }

    #[test]
    fn a_refusal_names_the_file_the_reason_and_the_action() {
        let zh = text_with(Locale::Zh);
        let sentence = zh.refusal("a.txt", "未保存的编辑", Refusal::Uninstall);
        assert!(sentence.contains("a.txt") && sentence.contains("未保存的编辑"));
        assert!(sentence.contains("卸载"));
        let en = text_with(Locale::En);
        let sentence = en.refusal("a.txt", "unsaved changes", Refusal::Return);
        assert!(sentence.contains("a.txt") && sentence.contains("unsaved changes"));
        assert!(sentence.contains("go back"));
    }

    #[test]
    fn placeholders_are_filled_and_unknown_ones_are_left_alone() {
        assert_eq!(
            fill("{a} and {b}", &[("a", "1".to_owned())]),
            "1 and {b}".to_string()
        );
        assert_eq!(msg!("{a}/{b}", a = 1, b = "x"), "1/x");
    }

    #[test]
    fn setting_the_language_changes_what_the_host_says() {
        // The one piece of global state here, so it is worth pinning down. Restored
        // afterwards because the other tests assume the default.
        let before = locale();
        set_locale(Locale::En);
        assert!(text().unknown_plugin.contains("Unknown"));
        set_locale(Locale::Zh);
        assert!(text().unknown_plugin.contains("未知"));
        set_locale(before);
    }

    fn text_with(locale: Locale) -> &'static Text {
        match locale {
            Locale::Zh => &ZH,
            Locale::En => &EN,
        }
    }

    fn placeholders(message: &str) -> Vec<String> {
        let mut names = Vec::new();
        let mut rest = message;
        while let Some(start) = rest.find('{') {
            let Some(end) = rest[start..].find('}') else {
                break;
            };
            names.push(rest[start + 1..start + end].to_owned());
            rest = &rest[start + end + 1..];
        }
        names
    }
}
