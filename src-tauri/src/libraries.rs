//! Libraries for generated plugins, pulled from an npm-compatible registry.
//!
//! The workshop is the fallback for formats no first-party plugin covers, so what it can build
//! must not be limited to what this repository happens to ship. A library therefore arrives the
//! way it does in any other project — named, pinned and fetched from a registry — with three
//! rules that keep the result honest: nothing from a package is ever executed, what reaches the
//! plugin is a single file the page can import on its own, and the version, its integrity hash
//! and its licence travel with the package in `dependencies.json`.
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha512};
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    time::Duration,
};

/// Where packages come from unless the machine names a mirror. An internal or offline network
/// is the only reason to change it, which is why it is an environment variable and not a
/// setting: the source of a plugin's libraries is not something to click past.
const DEFAULT_REGISTRY: &str = "https://registry.npmjs.org";
const REGISTRY_VARIABLE: &str = "EMBER_LIBRARY_REGISTRY";
/// A source tarball: generous for one, and small enough to bound a mistyped package name.
const MAX_TARBALL: usize = 64 * 1024 * 1024;
const MAX_UNPACKED: u64 = 256 * 1024 * 1024;
const MAX_ENTRIES: usize = 20_000;
/// One vendored file. A bundled build is a few hundred kilobytes; a wasm decoder a few more.
const MAX_FILE: usize = 16 * 1024 * 1024;
const MAX_LICENCE: usize = 256 * 1024;
const MAX_VENDOR_FILES: usize = 256;
/// How many files a listing shows. A package can hold thousands; the model needs the ones a
/// page would import, and the rest is noise it pays for.
const MAX_LISTING: usize = 120;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
    pub package: String,
    pub version: String,
    pub integrity: String,
    /// The entry point the package declares for itself, when it declares one.
    pub entry: Option<String>,
    pub licence: Option<String>,
    pub files: Vec<CatalogueFile>,
    /// How many files the package holds in total, so a bounded listing is not mistaken for
    /// the whole thing.
    pub total: usize,
    pub notes: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CatalogueFile {
    pub path: String,
    pub bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Vendored {
    pub package: String,
    pub version: String,
    pub integrity: String,
    pub files: Vec<VendoredFile>,
    pub licence: Option<String>,
    pub notes: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VendoredFile {
    /// Where it came from inside the package.
    pub path: String,
    /// The name it carries in `ui/vendor/`.
    pub name: String,
    pub bytes: usize,
}

struct Resolved {
    version: String,
    tarball: Option<String>,
    integrity: String,
    notes: Vec<String>,
}

/// The local copy of everything pulled so far: `<workshop>/libraries/<package>/<version>/`.
/// A second task asking for the same version reads this instead of the network, so generation
/// keeps working on a machine that is offline once a library has been used.
pub struct Libraries {
    root: PathBuf,
    registry: String,
    client: reqwest::Client,
    holds: tokio::sync::Mutex<()>,
}

impl Libraries {
    pub fn new(root: PathBuf, registry: Option<String>) -> Self {
        let registry = registry
            .or_else(|| std::env::var(REGISTRY_VARIABLE).ok())
            .unwrap_or_else(|| DEFAULT_REGISTRY.to_owned());
        let client = reqwest::Client::builder()
            // Fetching a tarball from wherever the registry points is not a decision this
            // should delegate: a library source is a fixed, known place.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self {
            root,
            registry: registry.trim_end_matches('/').to_owned(),
            client,
            holds: tokio::sync::Mutex::new(()),
        }
    }

    /// What a package holds, without taking anything: enough for the model to choose the one
    /// file a page can import.
    pub async fn catalogue(
        &self,
        package: &str,
        version: Option<&str>,
    ) -> Result<Catalogue, String> {
        let resolved = self.resolve(package, version).await?;
        let directory = self.ensure(package, &resolved).await?;
        let mut notes = resolved.notes.clone();
        let (entry, package_notes) = declared_entry(&directory);
        notes.extend(package_notes);
        let licence = licence_path(&directory);
        let (files, total) = listing(&directory);
        if total > files.len() {
            notes.push(format!(
                "包里共 {total} 个文件，这里按 dist/ 优先列出 {} 个",
                files.len()
            ));
        }
        Ok(Catalogue {
            package: package.to_owned(),
            version: resolved.version,
            integrity: resolved.integrity,
            entry,
            licence,
            files,
            total,
            notes,
        })
    }

    /// Copies named package files into a plugin's `ui/vendor/`. A single self-contained build
    /// keeps the compact legacy filename; a multi-file ESM build keeps its package-relative
    /// tree so its own relative imports continue to resolve in the browser.
    pub async fn vendor(
        &self,
        package: &str,
        version: Option<&str>,
        files: &[String],
        destination: &Path,
    ) -> Result<Vendored, String> {
        let resolved = self.resolve(package, version).await?;
        let directory = self.ensure(package, &resolved).await?;
        let mut notes = resolved.notes.clone();
        if files.len() > MAX_VENDOR_FILES {
            return Err(format!("一次最多取用 {MAX_VENDOR_FILES} 个库文件"));
        }
        let mut prepared = Vec::new();
        for wanted in files {
            let (relative, relative_name) = inside_file(wanted)?;
            let source = directory.join(&relative);
            let metadata = std::fs::symlink_metadata(&source)
                .map_err(|_| format!("{wanted}：这个包里没有这个文件（大小写也算）"))?;
            if !metadata.is_file() {
                return Err(format!("{wanted}：这是目录，不是文件"));
            }
            if metadata.len() > MAX_FILE as u64 {
                return Err(format!("{wanted}：文件超过 16 MiB，页面里用不起来"));
            }
            let bytes = std::fs::read(&source).map_err(|error| format!("{wanted}：{error}"))?;
            prepared.push((relative, relative_name, bytes));
        }
        let selected: HashSet<String> = prepared
            .iter()
            .map(|(_, relative, _)| relative.clone())
            .collect();
        let preserve_tree = prepared.len() > 1;
        let namespace = store_name(package);
        let mut vendored = Vec::new();
        for (relative, relative_name, bytes) in prepared {
            let name = if preserve_tree {
                format!("{namespace}/{relative_name}")
            } else {
                Path::new(&relative_name)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or(&relative_name)
                    .to_owned()
            };
            match import_verdict(&bytes, &relative_name, &selected) {
                Some(Verdict::Foreign(specifier)) => return Err(format!(
                    "{relative_name}：这个文件还 import 了 {specifier}；裸包名不能在预览页解析，请改用浏览器构建"
                )),
                Some(Verdict::Missing(missing)) => return Err(format!(
                    "{relative_name}：还需要包内文件 {missing}；把它加入同一次 add_dependency 的 files"
                )),
                Some(Verdict::Script { commonjs: true, .. }) => notes.push(format!(
                    "{name} 是 CommonJS 构建：浏览器里没有 require 与 module，请换一个 ESM 构建"
                )),
                Some(Verdict::Script { global: Some(global), .. }) => notes.push(format!(
                    "{name} 没有 export：它是脚本构建（UMD/IIFE），用 import './vendor/{name}' 触发副作用，再从全局 {global} 读它的接口"
                )),
                Some(Verdict::Script { global: None, .. }) => notes.push(format!(
                    "{name} 没有 export：它是脚本构建（UMD/IIFE），用 import 触发副作用，再从它挂上的全局变量读它的接口"
                )),
                None => {}
            }
            let target = destination.join(&name);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            ember_file_store::atomic_write(&target, &bytes)
                .map_err(|error| format!("{name}：{error}"))?;
            vendored.push(VendoredFile {
                path: relative.to_string_lossy().replace('\\', "/"),
                name,
                bytes: bytes.len(),
            });
        }
        let licence = match licence_path(&directory) {
            Some(path) => {
                let bytes = read_capped(&directory.join(&path), MAX_LICENCE)?;
                let leaf = format!("{}-LICENSE.txt", namespace.trim_start_matches('@'));
                let name = if preserve_tree {
                    format!("{namespace}/{leaf}")
                } else {
                    leaf
                };
                let target = destination.join(&name);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                ember_file_store::atomic_write(&target, &bytes)
                    .map_err(|error| format!("{name}：{error}"))?;
                Some(name)
            }
            None => {
                notes.push("这个包里没有许可证文件，请在总结里说明来源与授权".into());
                None
            }
        };
        Ok(Vendored {
            package: package.to_owned(),
            version: resolved.version,
            integrity: resolved.integrity,
            files: vendored,
            licence,
            notes,
        })
    }

    /// The version, tarball and integrity hash a request resolves to.
    ///
    /// A version is pinned or absent: a range would make the same task produce different
    /// packages on different days, which is exactly what `dependencies.json` exists to prevent.
    /// A pinned version that is already unpacked on this machine is answered from the store
    /// without asking the registry at all, and a request for the latest version falls back to
    /// what is cached when the registry cannot be reached.
    async fn resolve(&self, package: &str, version: Option<&str>) -> Result<Resolved, String> {
        if !valid_package(package) {
            return Err(format!("{package}：不是合法的 npm 包名"));
        }
        let wanted = version.map(str::trim).filter(|value| !value.is_empty());
        let wanted = match wanted {
            None | Some("latest") => None,
            Some(value) if exact_version(value) => Some(value.to_owned()),
            Some(value) => {
                return Err(format!("{value}：版本要写确切值（例如 0.5.4），不支持范围或标签"))
            }
        };
        if let Some(pinned) = wanted.as_deref() {
            if let Some(held) = self.held(package, pinned) {
                return Ok(held);
            }
        }
        let registry = reqwest::Url::parse(&self.registry)
            .ok()
            .filter(trusted_source)
            .ok_or_else(|| {
                format!(
                    "取库源 {}({REGISTRY_VARIABLE}) 不是 HTTPS 地址；本机镜像仅限 localhost",
                    self.registry
                )
            })?;
        let url = format!("{}/{}", self.registry, package.replace('/', "%2F"));
        let response = match self
            .client
            .get(&url)
            .header("accept", "application/vnd.npm.install-v1+json")
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                // A cached copy is what makes generation work offline; the model is told which
                // version it got, so a stale one is never a silent surprise.
                if let Some(held) = self.newest_held(package) {
                    let mut held = held;
                    held.notes.push(format!(
                        "（未联网：用的是本机已缓存的 {}@{}）",
                        package, held.version
                    ));
                    return Ok(held);
                }
                return Err(unreachable_source(&url, &error));
            }
        };
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(format!("{package}：取库源上没有这个包"));
        }
        if !response.status().is_success() {
            return Err(format!("{package}：取库源返回 {}", response.status()));
        }
        let body = response
            .bytes()
            .await
            .map_err(|error| format!("{package}：读取包元数据失败（{error}）"))?;
        if body.len() > 8 * 1024 * 1024 {
            return Err(format!("{package}：包元数据异常地大，已放弃"));
        }
        let document: Value =
            serde_json::from_slice(&body).map_err(|_| format!("{package}：源返回的不是包元数据"))?;
        let version = match wanted {
            Some(value) => value,
            None => document["dist-tags"]["latest"]
                .as_str()
                .ok_or_else(|| format!("{package}：源没有给出 latest 版本"))?
                .to_owned(),
        };
        let published = document["versions"].get(&version).ok_or_else(|| {
            format!(
                "{package}：没有版本 {version}；最近的版本有 {}",
                recent_versions(&document).join(" ")
            )
        })?;
        let tarball = published["dist"]["tarball"]
            .as_str()
            .ok_or_else(|| format!("{package}@{version}：源没有给出下载地址"))?
            .to_owned();
        let integrity = published["dist"]["integrity"]
            .as_str()
            .ok_or_else(|| format!("{package}@{version}：源没有给出完整性哈希，不能取用"))?
            .to_owned();
        if !integrity.starts_with("sha512-") {
            return Err(format!(
                "{package}@{version}：只接受 sha512 完整性哈希（源给的是 {integrity}）"
            ));
        }
        let location = reqwest::Url::parse(&tarball)
            .map_err(|_| format!("{package}@{version}：下载地址无效"))?;
        if location.scheme() != registry.scheme() || location.host_str() != registry.host_str() {
            return Err(format!(
                "{package}@{version}：下载地址不在取库源上（{}），已拒绝",
                location.host_str().unwrap_or("?")
            ));
        }
        Ok(Resolved {
            version,
            tarball: Some(tarball),
            integrity,
            notes: Vec::new(),
        })
    }

    /// What the store already holds for one version of one package, if anything.
    fn held(&self, package: &str, version: &str) -> Option<Resolved> {
        let directory = self.root.join(store_name(package)).join(version);
        let record = std::fs::read(directory.join(".complete")).ok()?;
        let document: Value = serde_json::from_slice(&record).ok()?;
        let integrity = document["integrity"].as_str()?.to_owned();
        Some(Resolved {
            version: version.to_owned(),
            tarball: document["tarball"].as_str().map(str::to_owned),
            integrity,
            notes: Vec::new(),
        })
    }

    /// The newest version this machine has of a package: the answer when there is no network
    /// but the library was used before.
    fn newest_held(&self, package: &str) -> Option<Resolved> {
        let entries = std::fs::read_dir(self.root.join(store_name(package))).ok()?;
        let versions: Vec<String> = entries
            .flatten()
            .filter(|entry| entry.path().join(".complete").is_file())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .collect();
        let newest = versions
            .into_iter()
            .max_by(|left, right| version_order(left).cmp(&version_order(right)))?;
        self.held(package, &newest)
    }

    /// The unpacked package, from the local copy when it is already there. Only one fetch runs
    /// at a time; the extraction lands next to the version it belongs to and is marked complete
    /// last, so an interrupted download is never mistaken for a usable one.
    async fn ensure(&self, package: &str, resolved: &Resolved) -> Result<PathBuf, String> {
        let directory = self.root.join(store_name(package)).join(&resolved.version);
        let marked = directory.join(".complete");
        if marked.is_file() {
            return Ok(directory.join("package"));
        }
        let _hold = self.holds.lock().await;
        if marked.is_file() {
            return Ok(directory.join("package"));
        }
        let tarball = resolved
            .tarball
            .clone()
            .ok_or("这个版本没有可下载的地址，本机也没有缓存")?;
        let bytes = self.download(&tarball).await?;
        verify(&bytes, &resolved.integrity)?;
        let staging = self.root.join(format!(".unpacking-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&staging);
        // The tarball's own `package/` prefix is what `unpack` strips, so this is the directory
        // the package's files are written into and the one that becomes the store's copy.
        std::fs::create_dir_all(staging.join("package")).map_err(|e| e.to_string())?;
        unpack(&bytes, &staging.join("package"))?;
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        std::fs::rename(staging.join("package"), directory.join("package"))
            .map_err(|e| format!("{package}：无法落地已解包的包（{e}）"))?;
        // The marker is what makes the copy reusable offline, so it carries the two facts a
        // later run would otherwise have to ask the registry for.
        let marker = serde_json::to_vec(&serde_json::json!({
            "integrity": resolved.integrity,
            "tarball": tarball,
        }))
        .map_err(|error| error.to_string())?;
        ember_file_store::atomic_write(&marked, &marker).map_err(|error| error.to_string())?;
        let _ = std::fs::remove_dir_all(&staging);
        Ok(directory.join("package"))
    }

    async fn download(&self, url: &str) -> Result<Vec<u8>, String> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| unreachable_source(url, &error))?;
        if !response.status().is_success() {
            return Err(format!("下载 {url} 失败：源返回 {}", response.status()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_TARBALL as u64)
        {
            return Err("这个包的体积超过 64 MiB，已放弃".into());
        }
        let body = response
            .bytes()
            .await
            .map_err(|error| format!("下载 {url} 中断（{error}）"))?;
        if body.len() > MAX_TARBALL {
            return Err("这个包的体积超过 64 MiB，已放弃".into());
        }
        Ok(body.to_vec())
    }
}

/// A source may be HTTPS, or plain HTTP when it is this machine: the same rule the provider
/// endpoint follows, so a local mirror can be used for development without weakening anything.
fn trusted_source(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
}

fn unreachable_source(url: &str, error: &reqwest::Error) -> String {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| url.to_owned());
    if error.is_timeout() {
        format!("连接 {host} 超时：取库需要联网，或已装好这个版本后重试")
    } else {
        format!("无法连接 {host}：取库需要联网（{error}）")
    }
}

/// npm's own rules, minus the parts that only matter for names people read.
fn valid_package(name: &str) -> bool {
    if name.is_empty() || name.len() > 214 || name.starts_with('.') || name.starts_with('_') {
        return false;
    }
    let (scope, bare) = match name.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, bare)) => (Some(scope), bare),
            None => return false,
        },
        None => (None, name),
    };
    if let Some(scope) = scope {
        if scope.is_empty() || !scope.bytes().all(name_character) {
            return false;
        }
    }
    !bare.is_empty() && bare.bytes().all(name_character)
}

fn name_character(byte: u8) -> bool {
    byte.is_ascii_lowercase()
        || byte.is_ascii_digit()
        || b"-_.~".contains(&byte)
}

fn exact_version(version: &str) -> bool {
    let mut parts = version.splitn(3, '.');
    let (Some(major), Some(minor), Some(patch)) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let patch = patch
        .split(['-', '+'])
        .next()
        .unwrap_or_default();
    [major, minor, patch]
        .iter()
        .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

fn recent_versions(document: &Value) -> Vec<String> {
    let Some(versions) = document["versions"].as_object() else {
        return Vec::new();
    };
    versions
        .keys()
        .rev()
        .take(6)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

/// Version numbers as sortable keys: a cache decides between versions on the machine alone, so
/// this only has to be right about the numeric parts it can see.
fn version_order(version: &str) -> Vec<u64> {
    version
        .split(['-', '+'])
        .next()
        .unwrap_or_default()
        .split('.')
        .map(|part| part.parse().unwrap_or(0))
        .collect()
}

/// The integrity hash the source declared, checked against what actually arrived. A mismatch
/// is not repaired and not reported as a warning: the bytes are dropped.
fn verify(tarball: &[u8], integrity: &str) -> Result<(), String> {
    let expected = integrity
        .strip_prefix("sha512-")
        .ok_or_else(|| "只接受 sha512 完整性哈希".to_owned())?;
    let actual = base64::engine::general_purpose::STANDARD.encode(Sha512::digest(tarball));
    if actual == expected {
        return Ok(());
    }
    Err("下载内容与源给出的哈希不一致，已丢弃；请重试或换一个取库源".into())
}

/// Writes the tarball's `package/` tree under `into`. Nothing is executed, directories are
/// created by the writes themselves, and any entry that is not a plain file inside `package/`
/// — a link, a device, an absolute path, a `..` — ends the extraction.
fn unpack(tarball: &[u8], into: &Path) -> Result<(), String> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(tarball));
    let entries = archive
        .entries()
        .map_err(|error| format!("解包失败：{error}"))?;
    let mut count = 0usize;
    let mut unpacked = 0u64;
    for entry in entries {
        let mut entry = entry.map_err(|error| format!("解包失败：{error}"))?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        count += 1;
        if count > MAX_ENTRIES {
            return Err("包里文件太多，已放弃".into());
        }
        unpacked += entry.header().size().unwrap_or(0);
        if unpacked > MAX_UNPACKED {
            return Err("包解压后超过 256 MiB，已放弃".into());
        }
        let path = entry.path().map_err(|_| "包里有无法解析的路径".to_owned())?;
        let target = into.join(inside_package(&path)?);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut file = std::fs::File::create(&target).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut file).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// The path an entry has inside `package/`, refusing anything that could leave it.
fn inside_package(path: &Path) -> Result<PathBuf, String> {
    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => relative.push(part),
            _ => return Err(format!("包里出现不安全的路径：{}", path.display())),
        }
    }
    relative
        .strip_prefix("package")
        .ok()
        .filter(|rest| !rest.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| "包的目录结构不是 npm 打包的样子".to_owned())
}

/// A file the model asked for, checked as a package-relative path. Directory structure is
/// retained when several files form one browser module graph.
fn inside_file(wanted: &str) -> Result<(PathBuf, String), String> {
    let wanted = wanted.trim().trim_start_matches("./");
    let wanted = wanted.strip_prefix("package/").unwrap_or(wanted);
    let path = Path::new(wanted);
    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => relative.push(part),
            _ => return Err(format!("{wanted}：只能写包内的相对路径")),
        }
    }
    let parts: Vec<_> = relative.iter().filter_map(|part| part.to_str()).collect();
    if parts.is_empty()
        || parts.iter().any(|part| {
            part.is_empty()
                || part.len() > 128
                || part.starts_with('.')
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
        })
    {
        return Err(format!("{wanted}：路径不适合放进 ui/vendor/"));
    }
    let name = relative.to_string_lossy().replace('\\', "/");
    Ok((relative, name))
}

enum Verdict {
    /// The file imports something by name, which the page cannot resolve.
    Foreign(String),
    /// A relative import is browser-safe, but its target was not selected for vendoring.
    Missing(String),
    /// The file has nothing to import: either a script build that exposes itself, or
    /// CommonJS, which the browser has no `require` or `module` for.
    Script {
        commonjs: bool,
        global: Option<String>,
    },
}

/// Whether the page can import this file, and what to expect when it can. Anything imported by
/// name is a dependency the page has no way to resolve, so it is refused with what to do
/// instead. A file that neither imports nor exports anything is a script build: usable, but
/// only for its side effects, so it is worth saying where to read its interface from rather
/// than letting the model guess why nothing was exported.
fn import_verdict(bytes: &[u8], name: &str, selected: &HashSet<String>) -> Option<Verdict> {
    if !matches!(name.rsplit('.').next(), Some("js" | "mjs" | "cjs")) {
        return None;
    }
    let source = String::from_utf8_lossy(bytes);
    let commonjs = source.contains("module.exports") || source.contains("require(");
    let allocator = oxc_allocator::Allocator::default();
    let parsed = oxc_parser::Parser::new(&allocator, &source, oxc_span::SourceType::mjs()).parse();
    if parsed.panicked || !parsed.errors.is_empty() {
        return Some(Verdict::Script {
            commonjs,
            global: None,
        });
    }
    use oxc_ast::ast::{Expression, Statement};
    let mut exported = false;
    let mut module = false;
    for statement in &parsed.program.body {
        let dependency = match statement {
            Statement::ImportDeclaration(import) => {
                module = true;
                Some(import.source.value.as_str())
            }
            Statement::ExportAllDeclaration(export) => {
                module = true;
                exported = true;
                Some(export.source.value.as_str())
            }
            Statement::ExportNamedDeclaration(export) => match &export.source {
                Some(source) => {
                    module = true;
                    exported = true;
                    Some(source.value.as_str())
                }
                None => {
                    exported = true;
                    None
                }
            },
            Statement::ExportDefaultDeclaration(_) => {
                exported = true;
                None
            }
            Statement::ExpressionStatement(statement) => {
                if let Expression::ImportExpression(import) = &statement.expression {
                    module = true;
                    match &import.source {
                        Expression::StringLiteral(literal) => Some(literal.value.as_str()),
                        _ => return Some(Verdict::Foreign("(动态表达式)".to_owned())),
                    }
                } else {
                    None
                }
            }
            _ => None,
        };
        if let Some(specifier) = dependency {
            if !specifier.starts_with('.') {
                return Some(Verdict::Foreign(specifier.to_owned()));
            }
            let Some(relative) = relative_import(name, specifier) else {
                return Some(Verdict::Foreign(specifier.to_owned()));
            };
            if !selected.contains(&relative) {
                return Some(Verdict::Missing(relative));
            }
        }
    }
    if exported || module {
        return None;
    }
    Some(Verdict::Script {
        commonjs,
        global: exposed_global(&source),
    })
}

fn relative_import(from: &str, specifier: &str) -> Option<String> {
    let specifier = specifier.split(['?', '#']).next()?;
    let mut parts: Vec<&str> = from.split('/').collect();
    parts.pop();
    for part in specifier.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            value if value.starts_with('.') => return None,
            value => parts.push(value),
        }
    }
    Some(parts.join("/"))
}

/// The name a script build most likely puts its interface under, for a note that tells the
/// model where to look.
fn exposed_global(source: &str) -> Option<String> {
    for prefix in ["globalThis.", "window.", "self.", "global."] {
        let Some(at) = source.find(prefix) else {
            continue;
        };
        let name: String = source[at + prefix.len()..]
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || *character == '_' || *character == '$'
            })
            .collect();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}

/// The package's own idea of its entry point, which is the file to import unless the format
/// needs a different build.
fn declared_entry(directory: &Path) -> (Option<String>, Vec<String>) {
    let Ok(bytes) = std::fs::read(directory.join("package.json")) else {
        return (None, Vec::new());
    };
    let Ok(document) = serde_json::from_slice::<Value>(&bytes) else {
        return (None, Vec::new());
    };
    let mut notes = Vec::new();
    for field in ["module", "browser", "main"] {
        if let Some(value) = document[field].as_str() {
            if directory.join(value).is_file() {
                if field != "module" && document["module"].is_string() && field == "browser" {
                    notes.push("这个包同时给了 module 与 browser 入口，浏览器用的通常是 module".into());
                }
                return (Some(value.to_owned()), notes);
            }
        }
    }
    (None, notes)
}

fn licence_path(directory: &Path) -> Option<String> {
    let entries = std::fs::read_dir(directory).ok()?;
    let mut found: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| {
            let upper = name.to_ascii_uppercase();
            ["LICENSE", "LICENCE", "COPYING", "NOTICE"]
                .iter()
                .any(|prefix| upper.starts_with(prefix))
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

/// A bounded view of what the package holds, ranked by what a page is most likely to import:
/// a bundled build under `dist/` first, then files next to the manifest, then the rest.
fn listing(directory: &Path) -> (Vec<CatalogueFile>, usize) {
    let mut all = Vec::new();
    collect(directory, directory, &mut all);
    let total = all.len();
    let mut ranked = all
        .into_iter()
        .filter(|(path, _)| !path.ends_with(".map"))
        .collect::<Vec<_>>();
    ranked.sort_by_key(|(path, bytes)| {
        let rank = if path.starts_with("dist/") || path.starts_with("build/") {
            0
        } else if !path.contains('/') {
            1
        } else {
            2
        };
        (
            rank,
            std::cmp::Reverse(importable(path)),
            *bytes,
            path.clone(),
        )
    });
    let files = ranked
        .into_iter()
        .take(MAX_LISTING)
        .map(|(path, bytes)| CatalogueFile { path, bytes })
        .collect();
    (files, total)
}

fn importable(path: &str) -> bool {
    matches!(path.rsplit('.').next(), Some("js" | "mjs" | "wasm" | "cjs"))
}

fn collect(root: &Path, directory: &Path, files: &mut Vec<(String, u64)>) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.is_dir() {
            collect(root, &path, files);
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        files.push((
            relative.to_string_lossy().replace('\\', "/"),
            metadata.len(),
        ));
    }
}

/// Reads a file up to a limit, so a package cannot decide how much memory the host spends on
/// one of its own files.
fn read_capped(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err(format!("{} 超过 {} KiB", path.display(), limit / 1024));
    }
    Ok(bytes)
}

/// A package name as a directory name: one path segment, and never something Windows would
/// refuse.
fn store_name(package: &str) -> String {
    package.replace('/', "+")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Mutex,
        },
    };

    /// A package as npm ships one: the files under a top-level `package/`, gzipped.
    fn tarball(files: &[(&str, &str)]) -> Vec<u8> {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        for (name, contents) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(contents.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, format!("package/{name}"), contents.as_bytes())
                .unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap()
    }

    fn integrity_of(bytes: &[u8]) -> String {
        format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(Sha512::digest(bytes))
        )
    }

    /// A registry that answers what a test put in it, and records what was asked for. It runs
    /// until the test is over, so a test can check that a second call did *not* reach it.
    struct Registry {
        base: String,
        asked: Arc<Mutex<Vec<String>>>,
        stop: Arc<AtomicBool>,
        thread: Option<std::thread::JoinHandle<()>>,
    }

    impl Registry {
        fn start(package: &str, version: &str, bytes: Vec<u8>) -> Self {
            Self::start_advertising(package, version, bytes, integrity_of)
        }

        fn start_advertising(
            package: &str,
            version: &str,
            bytes: Vec<u8>,
            integrity: impl Fn(&[u8]) -> String + Send + 'static,
        ) -> Self {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
            let asked = Arc::new(Mutex::new(Vec::new()));
            let stop = Arc::new(AtomicBool::new(false));
            let document = serde_json::to_vec(&serde_json::json!({
                "dist-tags": {"latest": version},
                "versions": {version: {
                    "version": version,
                    "dist": {
                        "tarball": format!("{base}/{package}-{version}.tgz"),
                        "integrity": integrity(&bytes),
                    },
                }},
            }))
            .unwrap();
            let archive = format!("{package}-{version}.tgz");
            let thread = {
                let asked = asked.clone();
                let stop = stop.clone();
                let package = package.to_owned();
                std::thread::spawn(move || loop {
                    if stop.load(Ordering::SeqCst) {
                        return;
                    }
                    let Ok((mut stream, _)) = listener.accept() else {
                        std::thread::sleep(Duration::from_millis(5));
                        continue;
                    };
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut chunk = [0u8; 1024];
                    while let Ok(count) = stream.read(&mut chunk) {
                        if count == 0 {
                            break;
                        }
                        request.extend_from_slice(&chunk[..count]);
                        if request.windows(4).any(|window| window == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let line = String::from_utf8_lossy(&request);
                    let path = line
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or_default()
                        .to_owned();
                    asked.lock().unwrap().push(path.clone());
                    let (kind, body) = if path.ends_with(&archive) {
                        ("application/octet-stream", bytes.clone())
                    } else {
                        ("application/json", document.clone())
                    };
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    stream.write_all(head.as_bytes()).unwrap();
                    stream.write_all(&body).unwrap();
                    let _ = stream.flush();
                    let _ = package.len();
                })
            };
            Self {
                base,
                asked,
                stop,
                thread: Some(thread),
            }
        }

        fn store(&self, root: &Path) -> Libraries {
            Libraries::new(root.to_path_buf(), Some(self.base.clone()))
        }

        fn asked(&self) -> Vec<String> {
            self.asked.lock().unwrap().clone()
        }
    }

    impl Drop for Registry {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }

    fn package_bytes() -> Vec<u8> {
        tarball(&[
            ("package.json", r#"{"name":"mp4box","version":"0.5.4","module":"dist/mp4box.all.js"}"#),
            ("LICENSE", "MIT-ish test licence"),
            ("dist/mp4box.all.js", "export const MP4Box = 1;\n"),
            ("src/isofile.js", "export const internal = 2;\n"),
        ])
    }

    #[tokio::test]
    async fn a_package_is_listed_and_its_build_lands_in_the_plugin() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start("mp4box", "0.5.4", package_bytes());
        let libraries = registry.store(&temp.path().join("libraries"));
        let catalogue = libraries.catalogue("mp4box", None).await.unwrap();
        assert_eq!(catalogue.version, "0.5.4");
        assert_eq!(catalogue.entry.as_deref(), Some("dist/mp4box.all.js"));
        assert_eq!(catalogue.licence.as_deref(), Some("LICENSE"));
        let paths: Vec<&str> = catalogue.files.iter().map(|file| file.path.as_str()).collect();
        // A bundled build is offered before the sources it was built from.
        assert_eq!(paths.first().copied(), Some("dist/mp4box.all.js"), "{paths:?}");
        assert!(paths.contains(&"src/isofile.js"), "{paths:?}");
        // The listing is what a page can import, and it is bounded and honest about the rest.
        assert_eq!(catalogue.total, 4);
        let vendor = temp.path().join("v1/ui/vendor");
        let vendored = libraries
            .vendor("mp4box", Some("0.5.4"), &["dist/mp4box.all.js".into()], &vendor)
            .await
            .unwrap();
        assert_eq!(vendored.version, "0.5.4");
        assert_eq!(vendored.files[0].name, "mp4box.all.js");
        assert_eq!(
            std::fs::read_to_string(vendor.join("mp4box.all.js")).unwrap(),
            "export const MP4Box = 1;\n"
        );
        // The licence travels with the copy the plugin redistributes.
        assert_eq!(vendored.licence.as_deref(), Some("mp4box-LICENSE.txt"));
        assert_eq!(
            std::fs::read_to_string(vendor.join("mp4box-LICENSE.txt")).unwrap(),
            "MIT-ish test licence"
        );
        assert!(registry.asked().iter().any(|path| path == "/mp4box"));
    }

    #[tokio::test]
    async fn a_pinned_version_that_is_already_here_needs_no_registry() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("libraries");
        let registry = Registry::start("mp4box", "0.5.4", package_bytes());
        let vendor = temp.path().join("ui/vendor");
        registry
            .store(&root)
            .vendor("mp4box", Some("0.5.4"), &["dist/mp4box.all.js".into()], &vendor)
            .await
            .unwrap();
        let asked = registry.asked().len();
        // A source that cannot be reached at all: the second call has to be answered from the
        // store, which is what keeps a repeat run working on a machine that is offline.
        let offline = Libraries::new(root, Some("http://127.0.0.1:9".into()));
        let again = offline
            .vendor("mp4box", Some("0.5.4"), &["dist/mp4box.all.js".into()], &vendor)
            .await
            .unwrap();
        assert_eq!(again.files[0].name, "mp4box.all.js");
        assert_eq!(registry.asked().len(), asked);
        // And asking for the latest version falls back to what is here, saying so.
        let latest = offline.catalogue("mp4box", None).await.unwrap();
        assert_eq!(latest.version, "0.5.4");
        assert!(latest.notes.iter().any(|note| note.contains("未联网")), "{:?}", latest.notes);
    }

    #[tokio::test]
    async fn a_tarball_that_does_not_match_its_hash_is_dropped() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start_advertising("mp4box", "0.5.4", package_bytes(), |_| {
            format!(
                "sha512-{}",
                base64::engine::general_purpose::STANDARD.encode(Sha512::digest(b"something else"))
            )
        });
        let vendor = temp.path().join("ui/vendor");
        let error = registry
            .store(&temp.path().join("libraries"))
            .vendor("mp4box", Some("0.5.4"), &["dist/mp4box.all.js".into()], &vendor)
            .await
            .expect_err("a mismatched tarball must be refused");
        assert!(error.contains("哈希不一致"), "{error}");
        assert!(!vendor.join("mp4box.all.js").exists());
    }

    #[tokio::test]
    async fn a_file_the_page_could_not_import_is_refused_with_what_to_do() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start(
            "mp4box",
            "0.5.4",
            tarball(&[
                ("package.json", r#"{"name":"mp4box"}"#),
                ("dist/parts.js", "import { x } from 'three';\nexport const y = x;\n"),
                ("dist/legacy.js", "(function (global) { global.MP4Box = 1; })(this);\n"),
                ("dist/common.cjs", "module.exports = require('mp4box');\n"),
            ]),
        );
        let libraries = registry.store(&temp.path().join("libraries"));
        let vendor = temp.path().join("ui/vendor");
        let error = libraries
            .vendor("mp4box", None, &["dist/parts.js".into()], &vendor)
            .await
            .expect_err("a file with a bare import cannot work in the page");
        assert!(error.contains("three"), "{error}");
        assert!(error.contains("dist/"), "{error}");
        // A script build is usable for its side effects; the model is told how, not left to guess.
        let script = libraries
            .vendor("mp4box", None, &["dist/legacy.js".into()], &vendor)
            .await
            .unwrap();
        assert!(
            script
                .notes
                .iter()
                .any(|note| note.contains("UMD") && note.contains("MP4Box")),
            "{:?}",
            script.notes
        );
        let commonjs = libraries
            .vendor("mp4box", None, &["dist/common.cjs".into()], &vendor)
            .await
            .unwrap();
        assert!(
            commonjs.notes.iter().any(|note| note.contains("require")),
            "{:?}",
            commonjs.notes
        );
    }

    #[tokio::test]
    async fn a_multi_file_esm_build_keeps_its_relative_module_tree() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start(
            "mesh-reader",
            "1.2.3",
            tarball(&[
                (
                    "package.json",
                    r#"{"name":"mesh-reader","module":"dist/index.js"}"#,
                ),
                ("LICENSE", "MIT"),
                ("dist/index.js", "export { parse } from './parser.js';\n"),
                (
                    "dist/parser.js",
                    "export const parse = bytes => bytes.length;\n",
                ),
            ]),
        );
        let vendor = temp.path().join("ui/vendor");
        let libraries = registry.store(&temp.path().join("libraries"));
        let missing = libraries
            .vendor("mesh-reader", None, &["dist/index.js".into()], &vendor)
            .await
            .expect_err("an incomplete module graph must explain the missing file");
        assert!(missing.contains("dist/parser.js"), "{missing}");
        let vendored = libraries
            .vendor(
                "mesh-reader",
                Some("1.2.3"),
                &["dist/index.js".into(), "dist/parser.js".into()],
                &vendor,
            )
            .await
            .unwrap();
        assert_eq!(vendored.files[0].name, "mesh-reader/dist/index.js");
        assert_eq!(vendored.files[1].name, "mesh-reader/dist/parser.js");
        assert!(vendor.join("mesh-reader/dist/index.js").is_file());
        assert!(vendor.join("mesh-reader/dist/parser.js").is_file());
        assert_eq!(
            vendored.licence.as_deref(),
            Some("mesh-reader/mesh-reader-LICENSE.txt")
        );
    }

    #[tokio::test]
    async fn a_request_that_leaves_the_package_or_the_registry_is_refused() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start("mp4box", "0.5.4", package_bytes());
        let vendor = temp.path().join("ui/vendor");
        for wanted in ["../../evil.js", "C:/Windows/evil.js", "dist/../../evil.js"] {
            let error = registry
                .store(&temp.path().join("libraries"))
                .vendor("mp4box", None, &[wanted.into()], &vendor)
                .await
                .expect_err("a path outside the package must be refused");
            assert!(error.contains("相对路径"), "{wanted}: {error}");
        }
        // Paths inside a tarball are held to the same rule.
        assert!(inside_package(Path::new("../evil.js")).is_err());
        assert!(inside_package(Path::new("package/../../evil.js")).is_err());
        assert!(inside_package(Path::new("elsewhere/file.js")).is_err());
        assert_eq!(
            inside_package(Path::new("package/dist/a.js")).unwrap(),
            PathBuf::from("dist/a.js")
        );
        // Only a trusted source is used, and a bad package name never becomes a URL.
        let plain = Libraries::new(temp.path().into(), Some("http://mirror.example".into()));
        assert!(plain.catalogue("mp4box", None).await.is_err());
        for name in ["../mp4box", "MP4Box", "mp4box/../x", "@scope", ""] {
            assert!(!valid_package(name), "{name}");
        }
        assert!(valid_package("mp4box") && valid_package("@scope/name"));
    }

    #[tokio::test]
    async fn versions_are_pinned_and_an_unknown_one_lists_what_exists() {
        let temp = tempfile::tempdir().unwrap();
        let registry = Registry::start("mp4box", "2.0.0", package_bytes());
        let libraries = registry.store(&temp.path().join("libraries"));
        let error = libraries
            .catalogue("mp4box", Some("9.9.9"))
            .await
            .expect_err("an unknown version must be refused");
        assert!(error.contains("没有版本 9.9.9"), "{error}");
        for range in ["^0.5.4", "~0.5.4", "*", "0.5"] {
            let error = libraries
                .catalogue("mp4box", Some(range))
                .await
                .expect_err("a range is not a pin");
            assert!(error.contains("确切值"), "{range}: {error}");
        }
        assert!(exact_version("0.5.4") && exact_version("1.0.0-rc.1") && !exact_version("^0.5.4"));
    }
}
