#![cfg(feature = "test-worker")]
//! The market is a shell plus sources: the host ships no packages, a source provides the
//! list, and the artifact each entry names is what gets installed. The mirrors here are
//! local directories, which is the same code path an http mirror takes once the bytes
//! arrive.

use ember_runtime::market::{Market, Source};
use ember_runtime::Runtime;
use serde_json::json;
use std::path::Path;

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

/// A built package whose manifest carries the build id the catalog will index.
fn build(root: &Path, build_id: &str) -> std::path::PathBuf {
    let path = root.join("built/one");
    package(&path, "test.one", "one");
    set_build_id(&path, build_id);
    path
}

fn set_build_id(path: &Path, build_id: &str) {
    let manifest_path = path.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!(build_id);
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
}

/// A market reading one local mirror. A fresh instance is needed after a mirror changes:
/// a read catalog is cached for ten minutes.
fn test_market(root: &Path, mirror: &Path) -> Market {
    Market::new(sources(root, mirror), root.join("cache")).unwrap()
}

fn sources(_root: &Path, mirror: &Path) -> Result<Vec<Source>, String> {
    Ok(vec![Source {
        name: Some("测试源".into()),
        catalog: mirror.join("catalog.json").to_string_lossy().into_owned(),
        base: mirror.to_string_lossy().into_owned(),
    }])
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Pack a package directory the way the release script does: one zip, entry names
/// relative to the package root.
fn zip_tree(directory: &Path) -> Vec<u8> {
    use std::io::Write;
    fn walk(root: &Path, directory: &Path, files: &mut Vec<(String, Vec<u8>)>) {
        for entry in std::fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let name = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                files.push((name, std::fs::read(&path).unwrap()));
            }
        }
    }
    let mut files = Vec::new();
    walk(directory, directory, &mut files);
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in files {
        writer
            .start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&data).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

/// Publish `package` into `mirror` and write the catalog entry indexing it.
fn publish(mirror: &Path, package: &Path, id: &str, build_id: &str, targets: &[&str]) -> String {
    publish_marked(mirror, package, id, build_id, targets, false)
}

fn publish_marked(
    mirror: &Path,
    package: &Path,
    id: &str,
    build_id: &str,
    targets: &[&str],
    recommended: bool,
) -> String {
    std::fs::create_dir_all(mirror).unwrap();
    let artifact = format!("{id}-1.0.0-{build_id}.zip");
    let zip = zip_tree(package);
    std::fs::write(mirror.join(&artifact), &zip).unwrap();
    let catalog = json!({"api":1,"entries":[{
        "id": id,
        "summary": "Published plugin",
        "publisher": "Tests",
        "name": id,
        "extensions": ["one"],
        "icon": "file-text",
        "version": "1.0.0",
        "targets": targets,
        "artifact": artifact,
        "sha256": sha256_hex(&zip),
        "size": zip.len(),
        "buildId": build_id,
        "recommended": recommended,
    }]})
    .to_string();
    std::fs::write(mirror.join("catalog.json"), catalog).unwrap();
    artifact
}

/// A package that declares settings, so installation can be checked for carrying the
/// declaration the settings UI needs.
fn configurable(path: &Path, id: &str) {
    package(path, id, "one");
    let manifest_path = path.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!("market-build");
    manifest["settings"] = json!([
        {"key": "wrap", "type": "bool", "label": "换行", "default": true},
        {"key": "zoom", "type": "number", "label": "缩放", "default": 1,
         "min": 0.5, "max": 4, "step": 0.5},
        {"key": "mode", "type": "select", "label": "模式", "default": "safe",
         "options": [{"value": "safe", "label": "稳"}, {"value": "fast", "label": "快"}]}
    ]);
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
}

#[tokio::test]
async fn published_packages_are_downloaded_verified_and_cached() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    let artifact = publish(&mirror, &source, "test.one", "published-build", &[]);

    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    let list = market.list(&runtime).await.unwrap();
    assert!(list.warnings.is_empty(), "{:?}", list.warnings);
    assert_eq!(list.entries.len(), 1);
    let entry = serde_json::to_value(&list.entries[0]).unwrap();
    assert_eq!(entry["source"]["kind"], "remote");
    assert_eq!(entry["source"]["name"], "测试源");
    assert_eq!(entry["version"], "1.0.0");
    assert_eq!(entry["extensions"], json!(["one"]));
    // Locations are joined with `/`: the field names a location, and Windows accepts a
    // forward slash in a path.
    assert_eq!(
        entry["source"]["urls"][0],
        format!("{}/{}", mirror.to_string_lossy(), artifact)
    );
    assert!(entry["source"]["size"].as_u64().unwrap() > 0);

    // Preparation downloads, checks the bytes against the catalog and unpacks into the
    // content-addressed cache. Nothing is installed yet.
    let prepared = market.prepare("test.one").await.unwrap();
    let cached: serde_json::Value =
        serde_json::from_slice(&std::fs::read(prepared.join("plugin.json")).unwrap()).unwrap();
    assert_eq!(cached["buildId"], "published-build");
    assert!(prepared.starts_with(temp.path().join("cache")));
    assert!(runtime.snapshot().await.plugins.is_empty());

    // The mirror disappearing afterwards must not matter: the artifact is cached, and
    // installing copies the same verified tree.
    std::fs::remove_dir_all(&mirror).unwrap();
    assert_eq!(market.prepare("test.one").await.unwrap(), prepared);
    market.install(&runtime, "test.one").await.unwrap();
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    runtime.shutdown().await;
}

#[tokio::test]
async fn install_update_and_uninstall_follow_the_mirror() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "first-build");
    let mirror = temp.path().join("mirror");
    publish(&mirror, &source, "test.one", "first-build", &[]);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let market = test_market(temp.path(), &mirror);
    let entry = serde_json::to_value(&market.list(&runtime).await.unwrap().entries[0]).unwrap();
    // The market card needs the same icon the installed card uses.
    assert_eq!(entry["icon"], "file-text");
    assert!(entry["installedVersion"].is_null());
    assert_eq!(entry["updateAvailable"], false);
    assert!(market.prepare("unknown.plugin").await.is_err());
    assert!(market.install(&runtime, "unknown.plugin").await.is_err());

    market.install(&runtime, "test.one").await.unwrap();
    let list = market.list(&runtime).await.unwrap();
    assert_eq!(list.entries[0].installed_version.as_deref(), Some("1.0.0"));
    assert!(!list.entries[0].update_available);

    // A rebuild of the same version is a different build, so it shows as an update.
    set_build_id(&source, "second-build");
    publish(&mirror, &source, "test.one", "second-build", &[]);
    let market = test_market(temp.path(), &mirror);
    assert!(market.list(&runtime).await.unwrap().entries[0].update_available);

    // Development follow-up installs it through the same verified path.
    market.sync_development(&runtime).await.unwrap();
    assert_eq!(
        runtime.snapshot().await.plugins[0].manifest.build_id,
        "second-build"
    );
    assert!(!market.list(&runtime).await.unwrap().entries[0].update_available);

    // Uninstalling leaves the market offering it again, and development sync does not
    // put back what the user removed.
    runtime.uninstall("test.one").await.unwrap();
    assert!(runtime.snapshot().await.plugins.is_empty());
    market.sync_development(&runtime).await.unwrap();
    assert!(runtime.snapshot().await.plugins.is_empty());
    let entry = serde_json::to_value(&market.list(&runtime).await.unwrap().entries[0]).unwrap();
    assert!(entry["installedVersion"].is_null());
    runtime.shutdown().await;
}

/// Installing from the market must carry the settings declaration into the installed
/// package, otherwise the settings UI has nothing to render for a freshly installed
/// plugin even though the market copy declares settings.
#[tokio::test]
async fn market_install_carries_the_settings_declaration() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("built/one");
    configurable(&source, "test.one");
    let mirror = temp.path().join("mirror");
    publish(&mirror, &source, "test.one", "market-build", &[]);

    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    market.install(&runtime, "test.one").await.unwrap();

    let plugins = runtime.snapshot().await.plugins;
    assert_eq!(plugins.len(), 1);
    assert_eq!(plugins[0].manifest.settings.len(), 3);
    assert_eq!(plugins[0].manifest.settings[0].key, "wrap");
    // The declared icon name survives installation so the card and the settings tab
    // agree on which icon to draw.
    assert_eq!(plugins[0].manifest.icon.as_deref(), Some("file-text"));
    // And the resolved values are the declared defaults.
    assert_eq!(plugins[0].values["wrap"], json!(true));
    assert_eq!(plugins[0].values["mode"], json!("safe"));
    assert_eq!(plugins[0].values["zoom"].as_f64(), Some(1.0));
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_package_that_does_not_match_the_catalog_is_refused() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    let artifact = publish(&mirror, &source, "test.one", "published-build", &[]);
    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    // The hash covers the bytes, so a mirror serving a different archive than the one
    // the catalog indexes is caught before anything is unpacked.
    std::fs::write(source.join("ui/extra.js"), "// not in the published build").unwrap();
    std::fs::write(mirror.join(&artifact), zip_tree(&source)).unwrap();
    let error = market.prepare("test.one").await.unwrap_err();
    assert!(error.contains("校验失败"), "{error}");

    // Now let the hash match the served bytes while the package declares a different
    // build than the catalog indexes: the transfer is intact, the package is not the one
    // that was asked for.
    set_build_id(&source, "a-different-build");
    let swapped = zip_tree(&source);
    std::fs::write(mirror.join(&artifact), &swapped).unwrap();
    let mut catalog: serde_json::Value =
        serde_json::from_slice(&std::fs::read(mirror.join("catalog.json")).unwrap()).unwrap();
    catalog["entries"][0]["sha256"] = json!(sha256_hex(&swapped));
    catalog["entries"][0]["size"] = json!(swapped.len());
    std::fs::write(mirror.join("catalog.json"), catalog.to_string()).unwrap();

    let error = test_market(temp.path(), &mirror)
        .prepare("test.one")
        .await
        .unwrap_err();
    assert!(error.contains("不是目录记录的那次构建"), "{error}");
    // Nothing that failed a check was left behind for an install to pick up.
    let leftovers = std::fs::read_dir(temp.path().join("cache"))
        .map(|entries| entries.count())
        .unwrap_or(0);
    assert_eq!(leftovers, 0);
    assert!(runtime.snapshot().await.plugins.is_empty());
    runtime.shutdown().await;
}

#[tokio::test]
async fn entries_for_other_platforms_are_skipped_and_reported() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    publish(
        &mirror,
        &source,
        "test.one",
        "published-build",
        &["linux-aarch64"],
    );
    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert_eq!(list.warnings.len(), 1, "{:?}", list.warnings);
    assert!(
        list.warnings[0].contains("linux-aarch64"),
        "{:?}",
        list.warnings
    );
    let error = market.prepare("test.one").await.unwrap_err();
    assert!(error.contains("无法在当前平台"), "{error}");
    runtime.shutdown().await;
}

#[tokio::test]
async fn an_unreachable_or_unreadable_source_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    // A source whose catalog is missing, and one whose catalog is not a catalog: both
    // have to say so rather than leaving an empty market unexplained.
    let missing = temp.path().join("gone");
    let broken = temp.path().join("broken");
    std::fs::create_dir_all(&broken).unwrap();
    std::fs::write(
        broken.join("catalog.json"),
        json!({"api":1,"entries":[{"id":"test.one","summary":"s","publisher":"p"}]}).to_string(),
    )
    .unwrap();
    let market = Market::new(
        Ok(vec![
            Source {
                name: Some("失效源".into()),
                catalog: missing.join("catalog.json").to_string_lossy().into_owned(),
                base: missing.to_string_lossy().into_owned(),
            },
            Source {
                name: Some("残缺源".into()),
                catalog: broken.join("catalog.json").to_string_lossy().into_owned(),
                base: broken.to_string_lossy().into_owned(),
            },
        ]),
        temp.path().join("cache"),
    )
    .unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert_eq!(list.warnings.len(), 2, "{:?}", list.warnings);
    assert!(list.warnings[0].contains("读取市场目录"), "{:?}", list.warnings);
    assert!(list.warnings[1].contains("artifact"), "{:?}", list.warnings);
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_broken_sources_file_is_reported_with_every_listing() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();
    let market = Market::new(
        Err("插件来源配置无效：expected value".into()),
        temp.path().join("cache"),
    )
    .unwrap();
    let list = market.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert_eq!(list.warnings.len(), 1, "{:?}", list.warnings);
    assert!(list.warnings[0].contains("插件来源配置"), "{:?}", list.warnings);
    // And with no sources at all there is nothing to report, just an empty market.
    let empty = Market::new(Ok(Vec::new()), temp.path().join("cache")).unwrap();
    let list = empty.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert!(list.warnings.is_empty(), "{:?}", list.warnings);
    runtime.shutdown().await;
}

#[tokio::test]
async fn entries_that_are_not_installable_are_reported() {
    let temp = tempfile::tempdir().unwrap();
    let mirror = temp.path().join("mirror");
    std::fs::create_dir_all(&mirror).unwrap();
    // One entry carries a hash that is not a sha256, so it cannot be checked against
    // anything and must not be offered silently.
    std::fs::write(
        mirror.join("catalog.json"),
        json!({"api":1,"entries":[{
            "id":"test.one","summary":"s","publisher":"p","artifact":"a.zip",
            "sha256":"not-a-hash","size":1,"version":"1.0.0","buildId":"b",
        }]})
        .to_string(),
    )
    .unwrap();
    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert_eq!(list.warnings.len(), 1, "{:?}", list.warnings);
    assert!(list.warnings[0].contains("test.one"), "{:?}", list.warnings);
    assert!(list.warnings[0].contains("sha256"), "{:?}", list.warnings);
    assert!(list.warnings[0].contains("测试源"), "{:?}", list.warnings);
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_second_source_mirrors_the_same_package() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let first = temp.path().join("mirror-one");
    let second = temp.path().join("mirror-two");
    publish(&first, &source, "test.one", "published-build", &[]);
    // The same artifact on a second mirror, so a failing mirror falls through.
    let artifact = publish(&second, &source, "test.one", "published-build", &[]);
    let market = Market::new(
        Ok(vec![
            Source {
                name: Some("镜像一".into()),
                catalog: first.join("catalog.json").to_string_lossy().into_owned(),
                base: first.to_string_lossy().into_owned(),
            },
            Source {
                name: Some("镜像二".into()),
                catalog: second.join("catalog.json").to_string_lossy().into_owned(),
                base: second.to_string_lossy().into_owned(),
            },
        ]),
        temp.path().join("cache"),
    )
    .unwrap();
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert!(list.warnings.is_empty(), "{:?}", list.warnings);
    // One card, two URLs.
    assert_eq!(list.entries.len(), 1);
    let entry = serde_json::to_value(&list.entries[0]).unwrap();
    let urls = entry["source"]["urls"].as_array().unwrap();
    assert_eq!(urls.len(), 2, "{urls:?}");
    assert_eq!(entry["source"]["name"], "镜像一");

    // The first mirror is gone, so the install has to come from the second.
    std::fs::remove_dir_all(&first).unwrap();
    market.install(&runtime, "test.one").await.unwrap();
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    assert!(temp.path().join("cache").join(
        entry["source"]["sha256"].as_str().unwrap()
    ).is_dir());
    assert!(second.join(&artifact).is_file());
    runtime.shutdown().await;
}

/// The first-run chooser offers what a source suggests, so the flag has to survive the
/// catalog into the market listing.
#[tokio::test]
async fn a_source_can_suggest_plugins_for_a_fresh_installation() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    publish_marked(&mirror, &source, "test.one", "published-build", &[], true);
    let market = test_market(temp.path(), &mirror);
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert_eq!(list.entries.len(), 1);
    assert!(list.entries[0].recommended);
    // A source that marks nothing is still readable; the chooser decides what to do with
    // an empty suggestion list.
    publish_marked(&mirror, &source, "test.one", "published-build", &[], false);
    let market = test_market(temp.path(), &mirror);
    assert!(!market.list(&runtime).await.unwrap().entries[0].recommended);
    runtime.shutdown().await;
}
