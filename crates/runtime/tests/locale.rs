//! The interface language, end to end: what an installed plugin says, what a catalog
//! entry says, and that the choice outlives the process that made it.
//!
//! One test rather than several, and in a file of its own: the language is a single value
//! for the whole process, so a test that changes it cannot run beside another one that
//! reads a message.

use ember_runtime::i18n::Locale;
use ember_runtime::market::{EntrySource, Market, MarketList, Source};
use ember_runtime::Runtime;
use serde_json::json;
use std::path::Path;

/// A package that declares its own text in both languages, as the bundled ones do.
fn package(directory: &Path) {
    std::fs::create_dir_all(directory.join("ui")).unwrap();
    std::fs::write(directory.join("worker.exe"), b"stub").unwrap();
    std::fs::write(directory.join("ui/index.html"), "<p></p>").unwrap();
    std::fs::write(
        directory.join("plugin.json"),
        json!({
            "api": 1,
            "id": "test.one",
            "name": "测试插件",
            "version": "1.0.0",
            "extensions": ["one"],
            "executable": "worker.exe",
            "entry": "ui/index.html",
            "capabilities": ["view"],
            "settings": [
                {"key": "wrap", "type": "bool", "label": "自动换行", "help": "关闭后不折断。", "default": true}
            ],
            "i18n": {"en": {
                "name": "Test Plugin",
                "settings": {"wrap": {"label": "Wrap long lines", "help": "Off, lines are not folded."}}
            }},
        })
        .to_string(),
    )
    .unwrap();
}

/// A catalog indexing that package, with the display text a source publishes for it.
fn mirror(directory: &Path) {
    std::fs::create_dir_all(directory).unwrap();
    std::fs::write(
        directory.join("catalog.json"),
        json!({"api": 1, "entries": [{
            "id": "test.one",
            "summary": "中文摘要",
            "publisher": "Tests",
            "name": "测试插件",
            "i18n": {"en": {"name": "Test Plugin", "summary": "English summary"}},
            "artifact": "test.one-1.0.0-abcdef.zip",
            "sha256": "a".repeat(64),
            "size": 10,
            "version": "1.0.0",
            "buildId": "abcdef",
        }]})
        .to_string(),
    )
    .unwrap();
}

#[tokio::test]
async fn the_interface_language_reaches_plugins_catalogs_and_the_next_run() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let installed = root.join("installed");
    let source = root.join("source/test.one");
    let mirror_root = root.join("mirror");
    package(&source);
    mirror(&mirror_root);

    let runtime = Runtime::new(installed.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let market = Market::new(
        Ok(vec![Source {
            name: Some("测试源".into()),
            catalog: mirror_root
                .join("catalog.json")
                .to_string_lossy()
                .into_owned(),
            base: mirror_root.to_string_lossy().into_owned(),
        }]),
        root.join("cache"),
    )
    .unwrap();

    // Chinese is what the project itself declares, so that is what a fresh installation
    // shows before any window has said otherwise.
    let snapshot = runtime.snapshot().await;
    assert_eq!(snapshot.plugins[0].manifest.name, "测试插件");
    assert_eq!(snapshot.plugins[0].manifest.settings[0].label, "自动换行");
    let listed = market.list(&runtime).await.unwrap();
    assert_eq!(listed.entries[0].name, "测试插件");
    assert_eq!(listed.entries[0].summary, "中文摘要");

    // A window resolves the language and tells the host. From here on everything the host
    // shows uses it: the plugin's own declarations, and the catalog's.
    runtime.set_locale(Some("en".into())).await.unwrap();
    let snapshot = runtime.snapshot().await;
    assert_eq!(snapshot.plugins[0].manifest.name, "Test Plugin");
    assert_eq!(
        snapshot.plugins[0].manifest.settings[0].label,
        "Wrap long lines"
    );
    assert_eq!(
        snapshot.plugins[0].manifest.settings[0].help.as_deref(),
        Some("Off, lines are not folded.")
    );
    // A read catalog is cached, so this also pins that the wording is resolved per
    // request: speaking another language must not need a market refresh.
    let listed = market.list(&runtime).await.unwrap();
    assert_eq!(listed.entries[0].name, "Test Plugin");
    assert_eq!(listed.entries[0].summary, "English summary");

    // A session is labelled with the plugin's name as well, and a session lives on across a
    // language change: one opened while the host spoke English must not stay English after
    // the application is switched back.
    let file = root.join("sample.one");
    std::fs::write(&file, "one").unwrap();
    let session = runtime.open(file).await.unwrap();
    let label = |snapshot: ember_runtime::Snapshot| {
        snapshot
            .sessions
            .iter()
            .find(|session_info| session_info.id == session.id)
            .unwrap()
            .label
            .clone()
    };
    assert_eq!(label(runtime.snapshot().await), "Test Plugin");
    runtime.set_locale(Some("zh-CN".into())).await.unwrap();
    assert_eq!(label(runtime.snapshot().await), "测试插件");
    runtime.set_locale(Some("en".into())).await.unwrap();

    // A source's name is configuration data and is shown the way its author wrote it. The
    // one exception is the source the host contributes itself: that name is the host's own
    // wording, so it is the interface language's to spell — including after a change.
    let catalog = mirror_root
        .join("catalog.json")
        .to_string_lossy()
        .into_owned();
    let local = Market::new(
        Ok(vec![Source {
            name: None,
            catalog: catalog.clone(),
            base: mirror_root.to_string_lossy().into_owned(),
        }]),
        root.join("cache-local"),
    )
    .unwrap()
    .with_local_source(&catalog);
    let source_name = |list: &MarketList| match &list.entries[0].source {
        EntrySource::Remote { name, .. } => name.clone(),
    };
    assert_eq!(
        source_name(&local.list(&runtime).await.unwrap()),
        "Development mirror"
    );
    // A configured source keeps its own name no matter what the interface says.
    assert_eq!(source_name(&market.list(&runtime).await.unwrap()), "测试源");
    runtime.set_locale(Some("zh-CN".into())).await.unwrap();
    assert_eq!(
        source_name(&local.list(&runtime).await.unwrap()),
        "开发镜像"
    );
    runtime.set_locale(Some("en".into())).await.unwrap();

    // The choice belongs to the application, not to the window that made it: the next run
    // has it before anything is on screen.
    let reopened = Runtime::new(installed).unwrap();
    assert_eq!(reopened.locale().await, Locale::En);
    reopened.scan().await.unwrap();
    assert_eq!(
        reopened.snapshot().await.plugins[0].manifest.name,
        "Test Plugin"
    );

    // A tag is a request, not a promise: a language the host does not speak, and one the
    // plugin does not declare, both leave the declaration standing.
    reopened.set_locale(Some("fr".into())).await.unwrap();
    assert_eq!(reopened.locale().await, Locale::En);
    reopened.set_locale(Some("zh-CN".into())).await.unwrap();
    assert_eq!(
        reopened.snapshot().await.plugins[0].manifest.name,
        "测试插件"
    );
}
