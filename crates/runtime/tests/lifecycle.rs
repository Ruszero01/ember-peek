#![cfg(feature = "test-worker")]
use ember_runtime::market::Market;
use ember_runtime::Runtime;
use serde_json::json;
use std::{
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};

fn package(path: &Path, id: &str, extension: &str) {
    std::fs::create_dir_all(path.join("ui")).unwrap();
    std::fs::copy(
        env!("CARGO_BIN_EXE_runtime-test-worker"),
        path.join("worker.exe"),
    )
    .unwrap();
    std::fs::write(path.join("ui/index.html"), "<canvas></canvas>").unwrap();
    std::fs::write(path.join("plugin.json"), json!({"api":1,"id":id,"name":id,"version":"1.0.0","extensions":[extension],"icon":"file-text","executable":"worker.exe","entry":"ui/index.html","capabilities":["view"],"permissions":["readFile"]}).to_string()).unwrap();
}
async fn ready(runtime: &Arc<Runtime>, id: &str) {
    let start = Instant::now();
    loop {
        let snapshot = runtime.snapshot().await;
        let session = snapshot.sessions.iter().find(|s| s.id == id).unwrap();
        if session.status == "ready" {
            runtime.complete_view(id, None).await.unwrap();
            return;
        }
        assert_ne!(session.status, "error", "{:?}", session.error);
        assert!(start.elapsed() < Duration::from_secs(5));
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

/// A market laid out the way the host builds it: a bundled catalog beside a cache for
/// downloaded packages.
fn test_market(root: &Path) -> Market {
    Market::new(root.join("market"), root.join("cache")).unwrap()
}

#[tokio::test]
async fn matching_plugins_compose_and_switch_without_reopening() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    package(&root.join("alpha"), "test.alpha", "txt");
    package(&root.join("beta"), "test.beta", "txt");
    let runtime = Runtime::new(root).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("note.txt");
    std::fs::write(&file, "hello").unwrap();
    let first = runtime.open(file.clone()).await.unwrap();
    let snapshot = runtime.snapshot().await;
    assert_eq!(snapshot.sessions.len(), 2);
    let second = snapshot
        .sessions
        .iter()
        .find(|s| s.id != first.id)
        .unwrap()
        .clone();
    assert_eq!(first.file_id, second.file_id);
    ready(&runtime, &first.id).await;
    ready(&runtime, &second.id).await;
    let data = runtime.session_data(&second.id).await.unwrap();
    runtime.activate(Some(second.id.clone())).await.unwrap();
    assert_eq!(runtime.open(file.clone()).await.unwrap().id, second.id);
    assert_eq!(runtime.session_data(&second.id).await.unwrap(), data);
    runtime.enabled(&second.plugin_id, false).await.unwrap();
    assert_eq!(runtime.snapshot().await.active, Some(first.id.clone()));
    runtime.enabled(&first.plugin_id, false).await.unwrap();
    assert!(runtime.open(file).await.is_err());
    runtime.shutdown().await;
}

#[tokio::test]
async fn switching_types_does_not_cancel_loading_and_idle_workers_are_collected() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    package(&root.join("one"), "test.one", "one");
    package(&root.join("two"), "test.two", "two");
    let runtime = Runtime::with_ttl(root, Duration::from_millis(80)).unwrap();
    runtime.scan().await.unwrap();
    let slow_file = temp.path().join("slow.one");
    let fast_file = temp.path().join("fast.two");
    std::fs::write(&slow_file, "slow").unwrap();
    std::fs::write(&fast_file, "fast").unwrap();
    let slow = runtime.open(slow_file.clone()).await.unwrap();
    runtime.activate(Some(slow.id.clone())).await.unwrap();
    let fast = runtime.open(fast_file).await.unwrap();
    runtime.activate(Some(fast.id.clone())).await.unwrap();
    ready(&runtime, &fast.id).await;
    tokio::time::sleep(Duration::from_millis(110)).await;
    runtime.reap().await;
    assert_eq!(
        runtime
            .snapshot()
            .await
            .sessions
            .iter()
            .find(|s| s.id == slow.id)
            .unwrap()
            .status,
        "loading"
    );
    ready(&runtime, &slow.id).await;
    assert_eq!(runtime.snapshot().await.active, Some(fast.id.clone()));
    let reused = runtime.open(slow_file).await.unwrap();
    assert_eq!(reused.id, slow.id);
    let pid = runtime.session_data(&slow.id).await.unwrap()["pid"].clone();
    assert_eq!(
        runtime
            .call(&slow.id, "custom-op", json!({"x":1}))
            .await
            .unwrap()["pid"],
        pid
    );
    runtime.activate(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(110)).await;
    runtime.reap().await;
    let snapshot = runtime.snapshot().await;
    assert!(snapshot.sessions.is_empty());
    assert!(snapshot.plugins.iter().all(|p| p.process_ids.is_empty()));
    runtime.shutdown().await;
}

#[tokio::test]
async fn same_plugin_multiplexes_and_recovers_from_a_process_crash() {
    let temp = tempfile::tempdir().unwrap();
    package(&temp.path().join("installed/one"), "test.one", "one");
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    runtime.scan().await.unwrap();
    let slow_path = temp.path().join("slow.one");
    let fast_path = temp.path().join("fast.one");
    std::fs::write(&slow_path, "slow").unwrap();
    std::fs::write(&fast_path, "fast").unwrap();
    let slow = runtime.open(slow_path).await.unwrap();
    let fast = runtime.open(fast_path).await.unwrap();
    ready(&runtime, &fast.id).await;
    assert_eq!(
        runtime
            .snapshot()
            .await
            .sessions
            .iter()
            .find(|s| s.id == slow.id)
            .unwrap()
            .status,
        "loading"
    );
    ready(&runtime, &slow.id).await;
    let pid = runtime.session_data(&fast.id).await.unwrap()["pid"].clone();
    assert_eq!(pid, runtime.session_data(&slow.id).await.unwrap()["pid"]);
    assert!(runtime.call(&fast.id, "crash", json!(null)).await.is_err());
    let recovered = runtime.call(&fast.id, "new-op", json!(null)).await.unwrap();
    assert_ne!(pid, recovered["pid"]);
    runtime.shutdown().await;
}

#[tokio::test]
async fn installing_unknown_format_and_retiring_inflight_plugin_needs_no_host_changes() {
    let temp = tempfile::tempdir().unwrap();
    let runtime =
        Runtime::with_ttl(temp.path().join("installed"), Duration::from_millis(80)).unwrap();
    let file = temp.path().join("model.NEWFORMAT");
    std::fs::write(&file, "slow").unwrap();
    assert!(runtime.open(file.clone()).await.is_err());
    let source = temp.path().join("package");
    package(&source, "independent.model", "newformat");
    runtime.install(&source).await.unwrap();
    let session = runtime.open(file.clone()).await.unwrap();
    runtime.uninstall("independent.model").await.unwrap();
    runtime.scan().await.unwrap();
    assert!(runtime.snapshot().await.plugins.is_empty());
    assert!(runtime.open(file).await.is_err());
    ready(&runtime, &session.id).await;
    assert_eq!(
        runtime.session_data(&session.id).await.unwrap()["echo"]["session"],
        session.id
    );
    tokio::time::sleep(Duration::from_millis(110)).await;
    runtime.reap().await;
    assert!(runtime.snapshot().await.sessions.is_empty());
    runtime.shutdown().await;
}

#[tokio::test]
async fn disabled_plugin_has_no_builtin_fallback_and_assets_are_scoped() {
    let temp = tempfile::tempdir().unwrap();
    package(&temp.path().join("installed/text"), "test.text", "txt");
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("file.txt");
    std::fs::write(&file, "fast").unwrap();
    runtime.enabled("test.text", false).await.unwrap();
    assert!(runtime.open(file.clone()).await.is_err());
    runtime.enabled("test.text", true).await.unwrap();
    let session = runtime.open(file).await.unwrap();
    ready(&runtime, &session.id).await;
    assert!(runtime.asset(&session.id, "ui/index.html").await.is_ok());
    assert!(runtime
        .asset(&session.id, "../host-state.json")
        .await
        .is_err());
    assert!(runtime
        .asset("wrong-session", "ui/index.html")
        .await
        .is_err());
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_view_still_initializing_is_not_idle() {
    let temp = tempfile::tempdir().unwrap();
    package(&temp.path().join("installed/one"), "test.one", "one");
    let runtime =
        Runtime::with_ttl(temp.path().join("installed"), Duration::from_millis(20)).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("fast.one");
    std::fs::write(&file, "fast").unwrap();
    let session = runtime.open(file).await.unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while runtime.snapshot().await.sessions[0].status != "ready" {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    runtime.reap().await;
    assert_eq!(runtime.snapshot().await.sessions.len(), 1);
    runtime.complete_view(&session.id, None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    runtime.reap().await;
    assert!(runtime.snapshot().await.sessions.is_empty());
    runtime.shutdown().await;
}

#[tokio::test]
async fn reinstalling_a_disabled_plugin_brings_it_back_enabled() {
    // Disabling describes the installed package, so uninstalling must drop it too.
    // Otherwise a reinstall returns a plugin that is silently switched off, and the
    // UI offers no explanation for why the format it handles still will not open.
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    runtime.install(&source).await.unwrap();
    runtime.enabled("test.one", false).await.unwrap();
    assert!(!runtime.snapshot().await.plugins[0].enabled);

    runtime.uninstall("test.one").await.unwrap();
    runtime.install(&source).await.unwrap();

    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins.len(), 1);
    assert!(
        plugins[0].enabled,
        "a reinstalled plugin must not come back disabled"
    );
    // And the file it handles opens again.
    let file = temp.path().join("note.one");
    std::fs::write(&file, "hello").unwrap();
    runtime.open(file).await.unwrap();
    runtime.shutdown().await;
}

#[tokio::test]
async fn updating_a_package_preserves_inflight_old_revision() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    runtime.install(&source).await.unwrap();
    let file = temp.path().join("slow.one");
    std::fs::write(&file, "slow").unwrap();
    let previous = runtime.open(file.clone()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(2)).await;
    runtime.install(&source).await.unwrap();
    let next = runtime.open(file).await.unwrap();
    assert_ne!(previous.revision, next.revision);
    assert_ne!(previous.id, next.id);
    runtime.activate(Some(next.id.clone())).await.unwrap();
    ready(&runtime, &previous.id).await;
    ready(&runtime, &next.id).await;
    assert_ne!(
        runtime.session_data(&previous.id).await.unwrap()["pid"],
        runtime.session_data(&next.id).await.unwrap()["pid"]
    );
    assert_eq!(runtime.snapshot().await.active, Some(next.id));
    runtime.shutdown().await;
}

#[tokio::test]
async fn marketplace_install_update_and_uninstall_are_real_package_operations() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("market/one");
    package(&source, "test.one", "one");
    let manifest_path = source.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!("first-build");
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
    std::fs::write(temp.path().join("market/catalog.json"), json!({"api":1,"entries":[{"id":"test.one","directory":"one","summary":"Test plugin","publisher":"Tests"}]}).to_string()).unwrap();
    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    assert!(market.list(&runtime).await.unwrap().entries[0]
        .installed_version
        .is_none());
    // The market card needs the same icon the installed card uses.
    assert_eq!(
        market.list(&runtime).await.unwrap().entries[0]
            .icon
            .as_deref(),
        Some("file-text")
    );
    // Preparation validates the local source without installing anything.
    let prepared = market.prepare("test.one").await.unwrap();
    assert_eq!(prepared, source.canonicalize().unwrap());
    assert!(runtime.snapshot().await.plugins.is_empty());
    let entries = market.list(&runtime).await.unwrap().entries;
    let entry = serde_json::to_value(&entries[0]).unwrap();
    assert_eq!(entry["source"]["kind"], "local");
    assert_eq!(entry["source"]["location"], prepared.to_string_lossy().as_ref());
    assert!(market.prepare("unknown.plugin").await.is_err());
    market.install(&runtime, "test.one").await.unwrap();
    assert!(market.list(&runtime).await.unwrap().entries[0]
        .installed_version
        .is_some());
    assert!(!market.list(&runtime).await.unwrap().entries[0].update_available);
    manifest["buildId"] = json!("second-build");
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
    assert!(market.list(&runtime).await.unwrap().entries[0].update_available);
    market.sync_development(&runtime).await.unwrap();
    assert!(!market.list(&runtime).await.unwrap().entries[0].update_available);
    runtime.uninstall("test.one").await.unwrap();
    market.sync_development(&runtime).await.unwrap();
    assert!(runtime.snapshot().await.plugins.is_empty());
    assert!(market.install(&runtime, "unknown.plugin").await.is_err());
    runtime.shutdown().await;
}

/// Installing from the market must carry the settings declaration into the installed
/// package, otherwise the settings UI has nothing to render for a freshly installed
/// plugin even though the market copy declares settings.
#[tokio::test]
async fn market_install_carries_the_settings_declaration() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("market/one");
    configurable_package(&source, "test.one", "one");
    let manifest_path = source.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!("market-build");
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
    std::fs::write(
        temp.path().join("market/catalog.json"),
        json!({"api":1,"entries":[{"id":"test.one","directory":"one","summary":"Test plugin","publisher":"Tests"}]})
            .to_string(),
    )
    .unwrap();

    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    market.install(&runtime, "test.one").await.unwrap();

    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins.len(), 1);
    // The declarations the UI needs are present after installation.
    assert_eq!(plugins[0].manifest.settings.len(), 3);
    assert_eq!(plugins[0].manifest.settings[0].key, "wrap");
    assert_eq!(plugins[0].manifest.settings[0].label, "换行");
    // The declared icon name survives installation so the card and the settings tab
    // agree on which icon to draw.
    assert_eq!(plugins[0].manifest.icon.as_deref(), Some("file-text"));
    // And the resolved values are the declared defaults.
    assert_eq!(plugins[0].values["wrap"], json!(true));
    assert_eq!(plugins[0].values["mode"], json!("safe"));
    assert_eq!(plugins[0].values["zoom"].as_f64(), Some(1.0));
    runtime.shutdown().await;
}

/// A package that declares two settings, so the whole declaration -> store -> plugin
/// path can be exercised through the echo the test worker replies with.
fn configurable_package(path: &Path, id: &str, extension: &str) {
    std::fs::create_dir_all(path.join("ui")).unwrap();
    std::fs::copy(
        env!("CARGO_BIN_EXE_runtime-test-worker"),
        path.join("worker.exe"),
    )
    .unwrap();
    std::fs::write(path.join("ui/index.html"), "<canvas></canvas>").unwrap();
    std::fs::write(
        path.join("plugin.json"),
        json!({
            "api": 1,
            "id": id,
            "name": id,
            "version": "1.0.0",
            "extensions": [extension],
            "icon": "file-text",
            "executable": "worker.exe",
            "entry": "ui/index.html", "capabilities": ["view"],
            "settings": [
                {"key": "wrap", "type": "bool", "label": "换行", "default": true},
                {"key": "zoom", "type": "number", "label": "缩放",
                 "default": 1, "min": 0.5, "max": 4, "step": 0.5},
                {"key": "mode", "type": "select", "label": "模式", "default": "safe",
                 "options": [{"value": "safe", "label": "稳"}, {"value": "fast", "label": "快"}]}
            ]
        })
        .to_string(),
    )
    .unwrap();
}

#[tokio::test]
async fn plugin_settings_round_trip_through_storage_and_reach_the_plugin() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    configurable_package(&root.join("one"), "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.scan().await.unwrap();

    // Declared defaults are what the UI renders before anything is stored.
    // Compared field by field: serde_json keeps `1` and `1.0` distinct, and a
    // declared number default is stored as written, not silently widened.
    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins[0].values["wrap"], json!(true));
    assert_eq!(plugins[0].values["mode"], json!("safe"));
    assert_eq!(plugins[0].values["zoom"].as_f64(), Some(1.0));
    assert_eq!(plugins[0].values, plugins[0].defaults);

    // Values are coerced onto the declaration: 99 clamps to max, 3.7 snaps to the step.
    runtime
        .set_setting("test.one", "wrap", json!(false))
        .await
        .unwrap();
    runtime
        .set_setting("test.one", "zoom", json!(3.7))
        .await
        .unwrap();
    runtime
        .set_setting("test.one", "mode", json!("fast"))
        .await
        .unwrap();
    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins[0].values["wrap"], json!(false));
    assert_eq!(plugins[0].values["zoom"], json!(3.5));
    assert_eq!(plugins[0].values["mode"], json!("fast"));

    // Undeclared keys and values that fail the schema never reach storage.
    assert!(runtime
        .set_setting("test.one", "nope", json!(1))
        .await
        .is_err());
    assert!(runtime
        .set_setting("test.one", "mode", json!("turbo"))
        .await
        .is_err());
    assert!(runtime
        .set_setting("unknown.plugin", "wrap", json!(true))
        .await
        .is_err());
    assert_eq!(
        runtime.snapshot().await.plugins[0].values["mode"],
        json!("fast")
    );

    // The plugin sees the resolved values on open.
    let file = temp.path().join("doc.one");
    std::fs::write(&file, "hello").unwrap();
    let session = runtime.open(file.clone()).await.unwrap();
    ready(&runtime, &session.id).await;
    let echoed = runtime.session_data(&session.id).await.unwrap();
    assert_eq!(echoed["echo"]["settings"]["wrap"], json!(false));
    assert_eq!(echoed["echo"]["settings"]["zoom"], json!(3.5));
    assert_eq!(echoed["echo"]["settings"]["mode"], json!("fast"));

    // Changing a setting with a live session succeeds (the worker accepts the
    // `settings` notification) and updates storage without disturbing the session.
    runtime
        .set_setting("test.one", "zoom", json!(2))
        .await
        .unwrap();
    assert_eq!(runtime.snapshot().await.sessions[0].id, session.id);
    assert_eq!(
        runtime.snapshot().await.plugins[0].values["zoom"],
        json!(2.0)
    );

    // Stored values survive a fresh runtime over the same directory.
    runtime.shutdown().await;
    let restarted = Runtime::new(root.clone()).unwrap();
    restarted.scan().await.unwrap();
    let plugins = restarted.snapshot().await.plugins;
    assert_eq!(plugins[0].values["wrap"], json!(false));
    assert_eq!(plugins[0].values["zoom"], json!(2.0));
    assert_eq!(plugins[0].values["mode"], json!("fast"));

    // Returning a setting to its default drops the override, so a later default
    // change is picked up instead of being shadowed forever.
    restarted
        .set_setting("test.one", "wrap", json!(true))
        .await
        .unwrap();
    restarted
        .set_setting("test.one", "mode", json!("safe"))
        .await
        .unwrap();
    let state: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join("host-state.json")).unwrap()).unwrap();
    assert_eq!(state["settings"]["test.one"], json!({"zoom": 2.0}));
    restarted.shutdown().await;
}

#[tokio::test]
async fn shared_contract_universal_overlay_and_dirty_document_retention() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    for (folder, id) in [
        ("source", "test.source"),
        ("editor", "test.editor"),
        ("overlay", "test.overlay"),
    ] {
        let directory = root.join(folder);
        package(&directory, id, "txt");
        let path = directory.join("plugin.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        match folder {
            "source" => manifest["provides"] = json!("test.text/1"),
            "editor" => manifest["consumes"] = json!("test.text/1"),
            _ => {
                manifest.as_object_mut().unwrap().remove("extensions");
                manifest["capabilities"] = json!(["overlay"]);
                manifest["overlay"] = json!({"width": 290, "height": 152});
            }
        }
        std::fs::write(path, manifest.to_string()).unwrap();
    }
    let runtime = Runtime::with_ttl(root, Duration::from_millis(60)).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("note.txt");
    std::fs::write(&file, "data").unwrap();
    runtime.open(file).await.unwrap();
    let sessions = runtime.snapshot().await.sessions;
    assert_eq!(sessions.len(), 3);
    for session in &sessions {
        ready(&runtime, &session.id).await;
    }
    let source = sessions
        .iter()
        .find(|s| s.plugin_id == "test.source")
        .unwrap();
    let editor = sessions
        .iter()
        .find(|s| s.plugin_id == "test.editor")
        .unwrap();
    assert_eq!(
        runtime.source_data(&editor.id).await.unwrap()["data"],
        runtime.session_data(&source.id).await.unwrap()
    );
    assert_eq!(
        runtime.session_data(&source.id).await.unwrap()["parseCount"],
        1
    );
    assert_eq!(
        runtime.session_data(&editor.id).await.unwrap()["parseCount"],
        0
    );
    runtime.activate(Some(editor.id.clone())).await.unwrap();
    runtime.activate(Some(source.id.clone())).await.unwrap();
    assert_eq!(
        runtime.session_data(&source.id).await.unwrap()["parseCount"],
        1
    );
    assert!(runtime
        .source_call(&editor.id, "undeclared-method", json!(null))
        .await
        .is_err());
    runtime.activate(None).await.unwrap();
    runtime.dirty(&editor.id, true).await.unwrap();
    assert!(runtime.enabled("test.editor", false).await.is_err());
    assert!(runtime.uninstall("test.editor").await.is_err());
    tokio::time::sleep(Duration::from_millis(100)).await;
    runtime.reap().await;
    assert_eq!(runtime.snapshot().await.sessions.len(), 3);
    runtime.dirty(&editor.id, false).await.unwrap();
    runtime.reap().await;
    assert!(runtime.snapshot().await.sessions.is_empty());
    runtime.shutdown().await;
}

#[tokio::test]
async fn repeated_saved_revisions_do_not_exhaust_file_slots() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    package(&root.join("text"), "test.text", "txt");
    let runtime = Runtime::new(root).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("note.txt");
    std::fs::write(&file, "initial").unwrap();
    for index in 0..20 {
        let session = runtime.open(file.clone()).await.unwrap();
        ready(&runtime, &session.id).await;
        assert_eq!(runtime.snapshot().await.sessions.len(), 1);
        runtime.invalidate(&session.file_id).await;
        std::fs::write(&file, format!("saved {index}")).unwrap();
    }
    runtime.shutdown().await;
}

#[tokio::test]
async fn activation_priority_manual_fallback_and_persistence() {
    use ember_runtime::manifest::{Activation, ActivationMode};
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    package(&root.join("preview"), "test.preview", "txt");
    package(&root.join("editor"), "test.editor", "txt");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.scan().await.unwrap();
    runtime
        .set_activation(
            "test.editor",
            Activation {
                mode: ActivationMode::Manual,
                priority: 100,
            },
        )
        .await
        .unwrap();
    let file = temp.path().join("file.txt");
    std::fs::write(&file, "hello").unwrap();
    let preview = runtime.open(file.clone()).await.unwrap();
    assert_eq!(preview.plugin_id, "test.preview");
    let editor = runtime
        .snapshot()
        .await
        .sessions
        .into_iter()
        .find(|s| s.plugin_id == "test.editor")
        .unwrap();
    runtime.activate(Some(editor.id)).await.unwrap();
    assert_eq!(
        runtime.open(file.clone()).await.unwrap().plugin_id,
        "test.preview"
    );
    runtime.enabled("test.preview", false).await.unwrap();
    assert_eq!(
        runtime.open(file.clone()).await.unwrap().plugin_id,
        "test.editor"
    );
    runtime.enabled("test.preview", true).await.unwrap();
    runtime
        .set_activation(
            "test.editor",
            Activation {
                mode: ActivationMode::Auto,
                priority: 100,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        runtime.open(file.clone()).await.unwrap().plugin_id,
        "test.editor"
    );
    let restored = Runtime::new(root).unwrap();
    restored.scan().await.unwrap();
    assert_eq!(
        restored
            .snapshot()
            .await
            .plugins
            .iter()
            .find(|p| p.manifest.id == "test.editor")
            .unwrap()
            .manifest
            .activation
            .priority,
        100
    );
    runtime.shutdown().await;
    restored.shutdown().await;
}

#[tokio::test]
async fn shared_navigation_survives_revision_but_isolates_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    for (name, id) in [("preview", "test.preview"), ("editor", "test.editor")] {
        let directory = root.join(name);
        package(&directory, id, "txt");
        let path = directory.join("plugin.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        manifest["provides"] = json!("test.text/1");
        std::fs::write(path, manifest.to_string()).unwrap();
    }
    let runtime = Runtime::new(root).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("one.txt");
    std::fs::write(&file, "one").unwrap();
    let first = runtime.open(file.clone()).await.unwrap();
    let other = runtime
        .snapshot()
        .await
        .sessions
        .into_iter()
        .find(|s| s.id != first.id)
        .unwrap();
    let position = json!({"line": 37, "column": 0});
    runtime
        .view_state(&first.id, Some(position.clone()))
        .await
        .unwrap();
    assert_eq!(runtime.view_state(&other.id, None).await.unwrap(), position);
    assert!(runtime
        .view_state(&other.id, Some(json!("x".repeat(5000))))
        .await
        .is_err());
    let second_file = temp.path().join("two.txt");
    std::fs::write(&second_file, "two").unwrap();
    let second = runtime.open(second_file).await.unwrap();
    assert!(runtime
        .view_state(&second.id, None)
        .await
        .unwrap()
        .is_null());
    std::fs::write(&file, "a changed revision").unwrap();
    let revised = runtime.open(file).await.unwrap();
    assert_ne!(first.file_id, revised.file_id);
    assert_eq!(
        runtime.view_state(&revised.id, None).await.unwrap(),
        position
    );
    runtime.shutdown().await;
}
