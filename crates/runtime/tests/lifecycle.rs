#![cfg(feature = "test-worker")]
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
/// A build id, so an install is recognised as an update of the one before it.
fn set_build_id(path: &Path, build_id: &str) {
    let manifest_path = path.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!(build_id);
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
}

/// The installed revision directories of `root`, which an update must not grow.
fn installed_dirs(root: &Path) -> Vec<String> {
    let mut found: Vec<String> = std::fs::read_dir(root)
        .unwrap()
        .flatten()
        .filter(|entry| {
            entry.path().is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
        })
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    found.sort();
    found
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
    // The worker is still sleeping on this one, so the session has a call in flight and an
    // idle pass must leave it alone even though its TTL is 80ms. Asserting that here rather
    // than after the sleep below is what keeps this test about the idle pass: on a busy
    // machine the 110ms wait can outlast the worker's 700ms sleep, and then "it is still
    // loading" says nothing about the reaper.
    assert_eq!(slow.status, "loading");
    let fast = runtime.open(fast_file).await.unwrap();
    runtime.activate(Some(fast.id.clone())).await.unwrap();
    ready(&runtime, &fast.id).await;
    tokio::time::sleep(Duration::from_millis(110)).await;
    runtime.reap().await;
    let remaining = runtime.snapshot().await;
    assert!(
        remaining.sessions.iter().any(|s| s.id == slow.id),
        "the idle pass collected a session that still had a call in flight"
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

/// An update replaces the installed directory and puts the preview back on the new build.
///
/// The preview cannot survive the swap: its process is stopped and the files under it are
/// replaced, so it is cut and re-opened rather than left talking to a build that is gone.
#[tokio::test]
async fn updating_replaces_the_installed_directory_and_puts_the_preview_back() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    set_build_id(&source, "first-build");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let installed = installed_dirs(&root);
    assert_eq!(installed.len(), 1);

    let file = temp.path().join("note.one");
    std::fs::write(&file, "hello").unwrap();
    let before = runtime.open(file.clone()).await.unwrap();
    ready(&runtime, &before.id).await;
    runtime.activate(Some(before.id.clone())).await.unwrap();

    set_build_id(&source, "second-build");
    runtime.install(&source).await.unwrap();

    // Same directory, new contents: an update is not a second copy beside the old one.
    assert_eq!(installed_dirs(&root), installed);
    assert_eq!(
        runtime.snapshot().await.plugins[0].manifest.build_id,
        "second-build"
    );
    // The preview was cut and put back: one session for the same file, on the new build.
    let sessions = runtime.snapshot().await.sessions;
    assert_eq!(sessions.len(), 1);
    assert_ne!(sessions[0].id, before.id);
    assert_eq!(sessions[0].name, before.name);
    // Re-activating is what keeps the preview window on that file: it shows the active
    // session's file, and the session that was on screen no longer exists.
    assert_eq!(
        runtime.snapshot().await.active,
        Some(sessions[0].id.clone())
    );
    ready(&runtime, &sessions[0].id).await;
    runtime.shutdown().await;
}

/// An update must not destroy work the plugin has not committed, and must say why in the
/// plugin's own words.
#[tokio::test]
async fn updating_a_plugin_with_pending_changes_is_refused() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    set_build_id(&source, "first-build");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let installed = installed_dirs(&root);

    let file = temp.path().join("note.one");
    std::fs::write(&file, "hello").unwrap();
    let session = runtime.open(file).await.unwrap();
    ready(&runtime, &session.id).await;
    runtime
        .set_pending(&session.id, true, Some("未保存的编辑".into()))
        .await
        .unwrap();

    set_build_id(&source, "second-build");
    let refusal = runtime.install(&source).await.unwrap_err();
    assert!(refusal.contains("未保存的编辑"), "{refusal}");
    assert!(refusal.contains("更新"), "{refusal}");
    // Nothing moved: same build, same directory, preview untouched.
    assert_eq!(installed_dirs(&root), installed);
    assert_eq!(
        runtime.snapshot().await.plugins[0].manifest.build_id,
        "first-build"
    );
    assert_eq!(runtime.snapshot().await.sessions[0].id, session.id);

    // Once the plugin lets go of the changes, the same install goes through.
    runtime.set_pending(&session.id, false, None).await.unwrap();
    runtime.install(&source).await.unwrap();
    assert_eq!(
        runtime.snapshot().await.plugins[0].manifest.build_id,
        "second-build"
    );
    runtime.shutdown().await;
}

#[tokio::test]
async fn updating_a_peer_protects_drafts_in_all_affected_worker_sessions() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let preview = temp.path().join("preview");
    let editor = temp.path().join("editor");
    package(&preview, "test.preview", "txt");
    package(&editor, "test.editor", "*");
    set_build_id(&preview, "old");
    let runtime = Runtime::new(root).unwrap();
    runtime.install(&preview).await.unwrap();
    runtime.install(&editor).await.unwrap();
    let file = temp.path().join("note.txt");
    let other = temp.path().join("other.md");
    std::fs::write(&file, "original").unwrap();
    std::fs::write(&other, "other").unwrap();
    runtime.open(file).await.unwrap();
    runtime.open(other).await.unwrap();
    let snapshot = runtime.snapshot().await;
    for session in &snapshot.sessions {
        ready(&runtime, &session.id).await;
    }
    let active = snapshot
        .sessions
        .iter()
        .find(|s| s.name == "other.md")
        .unwrap();
    runtime.activate(Some(active.id.clone())).await.unwrap();
    set_build_id(&preview, "new");
    for session in snapshot
        .sessions
        .iter()
        .filter(|s| s.plugin_id == "test.editor")
    {
        runtime
            .set_pending(&session.id, true, Some("未保存草稿".into()))
            .await
            .unwrap();
        let error = runtime.install(&preview).await.unwrap_err();
        assert!(error.contains("未保存草稿"), "{error}");
        assert!(runtime
            .snapshot()
            .await
            .sessions
            .iter()
            .any(|s| s.id == session.id && s.pending));
        runtime.set_pending(&session.id, false, None).await.unwrap();
    }
    runtime.install(&preview).await.unwrap();
    assert!(runtime
        .snapshot()
        .await
        .plugins
        .iter()
        .any(|p| p.manifest.build_id == "new"));
    let after = runtime.snapshot().await;
    let active = after
        .sessions
        .iter()
        .find(|s| Some(&s.id) == after.active.as_ref())
        .unwrap();
    assert_eq!(active.name, "other.md");
    assert_eq!(active.plugin_id, "test.editor");
    runtime.shutdown().await;
}

#[tokio::test]
async fn corrupt_state_recovers_backup_but_never_silently_resets() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.complete_onboarding().await.unwrap();
    runtime.complete_onboarding().await.unwrap();
    std::fs::write(root.join("host-state.json"), b"{broken").unwrap();
    let recovered = Runtime::new(root.clone()).unwrap();
    assert!(recovered.snapshot().await.onboarded);
    std::fs::write(root.join("host-state.json"), b"{broken").unwrap();
    std::fs::write(root.join("host-state.backup.json"), b"{broken").unwrap();
    assert!(Runtime::new(root).is_err());
}

/// A swap that dies between its two renames has to be undone, or the plugin would look
/// uninstalled on the next start even though its files are all there.
#[tokio::test]
async fn an_interrupted_swap_is_put_back() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let installed = installed_dirs(&root);
    assert_eq!(installed.len(), 1);

    // Exactly the state a crash leaves: the installation renamed aside, nothing in its place.
    std::fs::rename(
        root.join(&installed[0]),
        root.join(format!(".replaced-{}", installed[0])),
    )
    .unwrap();
    runtime.scan().await.unwrap();
    assert_eq!(installed_dirs(&root), installed);
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);

    // A leftover beside a healthy installation is dropped rather than counted twice.
    std::fs::create_dir_all(root.join(format!(".replaced-{}", installed[0]))).unwrap();
    runtime.scan().await.unwrap();
    assert_eq!(installed_dirs(&root), installed);
    assert!(root.read_dir().unwrap().flatten().all(|entry| !entry
        .file_name()
        .to_string_lossy()
        .starts_with(".replaced-")));
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
async fn shared_contract_universal_overlay_and_pending_document_retention() {
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
    runtime
        .set_pending(&editor.id, true, Some("未保存的编辑".into()))
        .await
        .unwrap();
    assert!(runtime.enabled("test.editor", false).await.is_err());
    assert!(runtime.uninstall("test.editor").await.is_err());
    tokio::time::sleep(Duration::from_millis(100)).await;
    runtime.reap().await;
    assert_eq!(runtime.snapshot().await.sessions.len(), 3);
    runtime.set_pending(&editor.id, false, None).await.unwrap();
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

/// The first-run plugin chooser is answered once: a fresh state has not seen it, and the
/// answer survives a restart.
#[tokio::test]
async fn the_onboarding_answer_persists() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let runtime = Runtime::new(root.clone()).unwrap();
    assert!(!runtime.snapshot().await.onboarded);
    runtime.complete_onboarding().await.unwrap();
    assert!(runtime.snapshot().await.onboarded);
    // Answering twice is a no-op rather than an error.
    runtime.complete_onboarding().await.unwrap();
    runtime.shutdown().await;

    let restarted = Runtime::new(root).unwrap();
    assert!(restarted.snapshot().await.onboarded);
    restarted.shutdown().await;
}

/// The development reset puts an installation back to what a first launch looks like:
/// nothing installed, nothing remembered, and no package directories left behind.
#[tokio::test]
async fn resetting_to_first_launch_leaves_nothing_installed() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("package");
    configurable_package(&source, "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    runtime.complete_onboarding().await.unwrap();
    runtime
        .set_setting("test.one", "wrap", json!(false))
        .await
        .unwrap();
    runtime.enabled("test.one", false).await.unwrap();
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);

    runtime.reset_to_first_launch().await.unwrap();
    let snapshot = runtime.snapshot().await;
    assert!(snapshot.plugins.is_empty());
    assert!(!snapshot.onboarded);
    // Nothing comes back on the next scan: the directories are gone, not merely retired.
    runtime.scan().await.unwrap();
    let snapshot = runtime.snapshot().await;
    assert!(snapshot.plugins.is_empty());
    assert!(snapshot.warnings.is_empty(), "{:?}", snapshot.warnings);
    // The plugin root holds the state file as well, so this counts package directories.
    let packages = std::fs::read_dir(&root)
        .unwrap()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .count();
    assert_eq!(packages, 0);

    // The remembered choices went with it, so the plugin comes back at its defaults.
    runtime.install(&source).await.unwrap();
    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins.len(), 1);
    assert!(plugins[0].enabled);
    assert_eq!(plugins[0].values["wrap"], json!(true));
    runtime.shutdown().await;
}

/// The reset is refused while a draft is open, so it cannot quietly discard edits.
#[tokio::test]
async fn resetting_to_first_launch_refuses_unsaved_edits() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    configurable_package(&root.join("one"), "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("note.one");
    std::fs::write(&file, "hello").unwrap();
    let session = runtime.open(file).await.unwrap();
    ready(&runtime, &session.id).await;
    runtime
        .set_pending(&session.id, true, Some("未保存的编辑".into()))
        .await
        .unwrap();
    assert!(runtime.reset_to_first_launch().await.is_err());
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    runtime.set_pending(&session.id, false, None).await.unwrap();
    runtime.reset_to_first_launch().await.unwrap();
    assert!(runtime.snapshot().await.plugins.is_empty());
    runtime.shutdown().await;
}

/// Reinstalling from a directory overwrites what is installed, so repeated installs cannot
/// grow the plugin directory at all — not even by one revision.
#[tokio::test]
async fn reinstalling_from_a_directory_overwrites_the_installed_one() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("built");
    package(&source, "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let installed = installed_dirs(&root);
    for _ in 0..3 {
        runtime.install(&source).await.unwrap();
    }
    runtime.reap().await;
    assert_eq!(installed_dirs(&root), installed);
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    runtime.shutdown().await;
}

/// A refusal quotes the plugin, not a hardcoded idea of what an editor does: the host has no
/// way to know whether the uncommitted work is text, a crop or a rotation, and it does not
/// need to — it only needs to say whose work it is and let the plugin name it.
#[tokio::test]
async fn a_refusal_names_the_work_the_plugin_reports() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    package(&root.join("one"), "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.scan().await.unwrap();
    let file = temp.path().join("photo.one");
    std::fs::write(&file, "pixels").unwrap();
    let session = runtime.open(file).await.unwrap();
    ready(&runtime, &session.id).await;

    runtime
        .set_pending(&session.id, true, Some("未应用的裁剪".into()))
        .await
        .unwrap();
    let refusal = runtime.uninstall("test.one").await.unwrap_err();
    // The file is what the user can act on; the plugin is what they clicked.
    assert!(refusal.contains("photo.one"), "{refusal}");
    assert!(refusal.contains("未应用的裁剪"), "{refusal}");
    assert!(refusal.contains("卸载"), "{refusal}");

    // Switching it off and replacing it are the same refusal, word for word.
    assert_eq!(
        runtime.enabled("test.one", false).await.unwrap_err(),
        refusal.replace("卸载", "停用")
    );
    assert_eq!(
        runtime
            .blocking_change(Some("test.one"))
            .await
            .unwrap()
            .reason,
        "未应用的裁剪"
    );
    // A plugin that names nothing is still protected, in the host's neutral words.
    runtime.set_pending(&session.id, true, None).await.unwrap();
    assert_eq!(
        runtime
            .blocking_change(Some("test.one"))
            .await
            .unwrap()
            .reason,
        "尚未提交的变更"
    );
    assert!(runtime.blocking_change(None).await.is_some());
    runtime.set_pending(&session.id, false, None).await.unwrap();
    assert!(runtime.blocking_change(None).await.is_none());
    runtime.shutdown().await;
}

/// An installation from the older scheme — an update that landed beside the old revision —
/// loses the extra copy on the next scan instead of keeping it for the life of the machine.
#[tokio::test]
async fn a_superseded_revision_is_retired_on_the_next_scan() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("installed");
    let source = temp.path().join("package");
    package(&source, "test.one", "one");
    let runtime = Runtime::new(root.clone()).unwrap();
    runtime.install(&source).await.unwrap();
    let installed = installed_dirs(&root);
    assert_eq!(installed.len(), 1);

    // What the older scheme produced: a second directory, a higher revision, newer contents.
    let newer = "test.one-9999999999999".to_owned();
    let copy = root.join(&newer);
    let worker = std::fs::copy(
        root.join(&installed[0]).join("worker.exe"),
        temp.path().join("worker.exe"),
    )
    .unwrap();
    assert!(worker > 0);
    std::fs::create_dir_all(copy.join("ui")).unwrap();
    std::fs::copy(
        root.join(&installed[0]).join("worker.exe"),
        copy.join("worker.exe"),
    )
    .unwrap();
    std::fs::copy(
        root.join(&installed[0]).join("ui/index.html"),
        copy.join("ui/index.html"),
    )
    .unwrap();
    let mut manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(root.join(&installed[0]).join("plugin.json")).unwrap(),
    )
    .unwrap();
    manifest["revision"] = json!(9999999999999u64);
    std::fs::write(copy.join("plugin.json"), manifest.to_string()).unwrap();

    runtime.scan().await.unwrap();
    // The newer copy is the installation; the one it superseded is on its way out.
    assert_eq!(
        runtime.snapshot().await.plugins[0].manifest.revision,
        9999999999999
    );
    runtime.reap().await;
    assert_eq!(installed_dirs(&root), vec![newer]);
    runtime.shutdown().await;
}
