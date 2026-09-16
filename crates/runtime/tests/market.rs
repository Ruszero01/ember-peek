#![cfg(feature = "test-worker")]
//! Published-package distribution: a catalog read from a mirror, an artifact
//! downloaded and checked against it, and the install only ever copying a tree that
//! was already verified. Mirrors here are local directories, which is the same code
//! path an http mirror takes once the bytes arrive.

use ember_runtime::market::Market;
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
    let manifest_path = path.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!(build_id);
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
    path
}

/// A market laid out the way the host builds it: a bundled catalog beside a cache for
/// downloaded packages.
fn test_market(root: &Path) -> Market {
    Market::new(root.join("market"), root.join("cache")).unwrap()
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
    }]})
    .to_string();
    std::fs::write(mirror.join("catalog.json"), catalog).unwrap();
    artifact
}

fn write_bundled(root: &Path, catalog: serde_json::Value) {
    std::fs::create_dir_all(root.join("market")).unwrap();
    std::fs::write(root.join("market/catalog.json"), catalog.to_string()).unwrap();
}

/// A bundled catalog that ships no packages and points at one mirror.
fn bundled_pointing_at(mirror: &Path, entries: serde_json::Value) -> serde_json::Value {
    json!({
        "api": 1,
        "sources": [{
            "catalog": mirror.join("catalog.json").to_string_lossy(),
            "base": mirror.to_string_lossy(),
            "name": "测试源",
        }],
        "entries": entries,
    })
}

fn bundled_entry() -> serde_json::Value {
    json!({"id": "test.one", "directory": "one", "summary": "Bundled plugin", "publisher": "Tests"})
}

#[tokio::test]
async fn published_packages_are_downloaded_verified_and_cached() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    let artifact = publish(&mirror, &source, "test.one", "published-build", &[]);
    write_bundled(temp.path(), bundled_pointing_at(&mirror, json!([])));

    let market = test_market(temp.path());
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
    // content-addressed cache.
    let prepared = market.prepare("test.one").await.unwrap();
    let cached: serde_json::Value =
        serde_json::from_slice(&std::fs::read(prepared.join("plugin.json")).unwrap()).unwrap();
    assert_eq!(cached["buildId"], "published-build");
    assert!(prepared.starts_with(temp.path().join("cache")));

    // The mirror disappearing afterwards must not matter: the artifact is cached, and
    // installing copies the same verified tree.
    std::fs::remove_dir_all(&mirror).unwrap();
    assert_eq!(market.prepare("test.one").await.unwrap(), prepared);
    market.install(&runtime, "test.one").await.unwrap();
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_package_that_does_not_match_the_catalog_is_refused() {
    let temp = tempfile::tempdir().unwrap();
    let source = build(temp.path(), "published-build");
    let mirror = temp.path().join("mirror");
    let artifact = publish(&mirror, &source, "test.one", "published-build", &[]);
    write_bundled(temp.path(), bundled_pointing_at(&mirror, json!([])));
    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    // The hash covers the bytes, so a mirror serving a different archive than the one
    // the catalog indexes is caught before anything is unpacked.
    std::fs::write(source.join("ui/extra.js"), "// not in the published build").unwrap();
    std::fs::write(mirror.join(&artifact), zip_tree(&source)).unwrap();
    let error = market.prepare("test.one").await.unwrap_err();
    assert!(error.contains("校验失败"), "{error}");

    // Now let the hash match the served bytes while the package declares a different
    // build than the catalog indexes: the transfer is intact, the package is not the
    // one that was asked for. A fresh market is used because a read catalog is cached
    // for ten minutes, so the rewritten one would not be seen otherwise.
    let mut other: serde_json::Value =
        serde_json::from_slice(&std::fs::read(source.join("plugin.json")).unwrap()).unwrap();
    other["buildId"] = json!("a-different-build");
    std::fs::write(source.join("plugin.json"), other.to_string()).unwrap();
    let swapped = zip_tree(&source);
    std::fs::write(mirror.join(&artifact), &swapped).unwrap();
    let mut catalog: serde_json::Value =
        serde_json::from_slice(&std::fs::read(mirror.join("catalog.json")).unwrap()).unwrap();
    catalog["entries"][0]["sha256"] = json!(sha256_hex(&swapped));
    catalog["entries"][0]["size"] = json!(swapped.len());
    std::fs::write(mirror.join("catalog.json"), catalog.to_string()).unwrap();

    let market = test_market(temp.path());
    let error = market.prepare("test.one").await.unwrap_err();
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
    write_bundled(temp.path(), bundled_pointing_at(&mirror, json!([])));
    let market = test_market(temp.path());
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
async fn an_unreachable_source_is_reported_without_emptying_the_market() {
    let temp = tempfile::tempdir().unwrap();
    package(&temp.path().join("market/one"), "test.one", "one");
    let missing = temp.path().join("gone");
    write_bundled(
        temp.path(),
        json!({
            "api": 1,
            "sources": [{
                "catalog": missing.join("catalog.json").to_string_lossy(),
                "base": missing.to_string_lossy(),
            }],
            "entries": [bundled_entry()],
        }),
    );
    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert_eq!(list.entries.len(), 1);
    assert_eq!(list.warnings.len(), 1, "{:?}", list.warnings);
    assert!(
        list.warnings[0].contains("读取市场目录"),
        "{:?}",
        list.warnings
    );
    // The bundled entry still installs with its source unreachable.
    market.install(&runtime, "test.one").await.unwrap();
    assert_eq!(runtime.snapshot().await.plugins.len(), 1);
    runtime.shutdown().await;
}

#[tokio::test]
async fn an_entry_the_host_cannot_read_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let mirror = temp.path().join("mirror");
    std::fs::create_dir_all(&mirror).unwrap();
    // One entry names no artifact and one carries a hash that is not a sha256. Neither
    // can become something installable, and both have to say why.
    std::fs::write(
        mirror.join("catalog.json"),
        json!({"api":1,"entries":[
            {"id":"test.one","summary":"s","publisher":"p"},
            {"id":"test.two","summary":"s","publisher":"p","artifact":"a.zip",
             "sha256":"not-a-hash","size":1,"version":"1.0.0","buildId":"b"},
        ]})
        .to_string(),
    )
    .unwrap();
    write_bundled(temp.path(), bundled_pointing_at(&mirror, json!([])));
    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert!(list.entries.is_empty());
    assert_eq!(list.warnings.len(), 2, "{:?}", list.warnings);
    assert!(
        list.warnings.iter().any(|warning| warning.contains("test.one")),
        "{:?}",
        list.warnings
    );
    assert!(
        list.warnings.iter().any(|warning| warning.contains("sha256")),
        "{:?}",
        list.warnings
    );
    runtime.shutdown().await;
}

#[tokio::test]
async fn a_bundled_copy_is_used_when_the_published_build_is_the_same() {
    let temp = tempfile::tempdir().unwrap();
    let local = temp.path().join("market/one");
    package(&local, "test.one", "one");
    let manifest_path = local.join("plugin.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["buildId"] = json!("shared-build");
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();

    // Publish the identical build, so the market has nothing newer to offer.
    let mirror = temp.path().join("mirror");
    publish(&mirror, &local, "test.one", "shared-build", &[]);
    write_bundled(
        temp.path(),
        bundled_pointing_at(&mirror, json!([bundled_entry()])),
    );
    let market = test_market(temp.path());
    let runtime = Runtime::new(temp.path().join("installed")).unwrap();

    let list = market.list(&runtime).await.unwrap();
    assert_eq!(list.entries.len(), 1);
    // The bundled copy is what gets used: no download for a build already here.
    let entry = serde_json::to_value(&list.entries[0]).unwrap();
    assert_eq!(entry["source"]["kind"], "local");
    let prepared = market.prepare("test.one").await.unwrap();
    assert_eq!(prepared, local.canonicalize().unwrap());
    assert!(!temp.path().join("cache").exists());
    runtime.shutdown().await;
}
