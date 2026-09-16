use crate::{
    artifact,
    manifest::{Package, HOST_TARGET},
    Runtime,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

/// Remote catalogs are refetched after this. The settings window keeps polling
/// `market_list` while it is open, so refreshing a catalog must not happen per call.
/// A failed read is cached for the same period, which bounds how often an unreachable
/// source can delay the market at all.
const CATALOG_TTL: Duration = Duration::from_secs(600);
const CATALOG_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_SOURCES: usize = 8;
const MAX_ENTRIES: usize = 256;
const MAX_CATALOG_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct Market {
    /// Bundled catalog and the packages shipped beside it: the offline baseline.
    pub root: PathBuf,
    /// Content-addressed cache for downloaded packages, keyed by artifact sha256.
    pub cache: PathBuf,
    client: reqwest::Client,
    remote: Arc<Mutex<RemoteIndex>>,
}

/// Catalogs read from the configured sources, with the warnings from reading them.
#[derive(Default)]
struct RemoteIndex {
    fetched: Vec<RemoteCatalog>,
    warnings: Vec<String>,
    at: Option<Instant>,
}

#[derive(Clone)]
struct RemoteCatalog {
    catalog: String,
    entries: Vec<Listing>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    api: u32,
    /// Where to look beyond what this host ships with.
    #[serde(default)]
    sources: Vec<SourceDeclaration>,
    /// Reserved for catalog signatures. Parsed only to be refused; see
    /// `check_signature` for why that is the honest behaviour today.
    #[serde(default)]
    signature: Option<Value>,
    entries: Vec<Listing>,
}

/// One place a published catalog can be fetched from. The catalog and the artifacts
/// it names are declared together, so moving a mirror does not mean rewriting entries.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceDeclaration {
    /// The catalog to read: an http(s) URL, a `file://` URL, or an absolute path.
    catalog: String,
    /// Prefix the catalog's artifact names are resolved against.
    base: String,
    #[serde(default)]
    name: Option<String>,
}

impl SourceDeclaration {
    /// What to call this source in a message or on a market card.
    fn label(&self) -> String {
        self.name.clone().unwrap_or_else(|| self.catalog.clone())
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listing {
    id: String,
    summary: String,
    publisher: String,
    /// Local copy shipped beside the catalog.
    #[serde(default)]
    directory: Option<String>,
    #[serde(default)]
    targets: Vec<String>,
    /// Published artifact. The catalog is the index, so it carries what a market card
    /// needs before anything is downloaded: the display fields, and the build identity
    /// the download is confirmed against afterwards.
    #[serde(default)]
    artifact: Option<String>,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    build_id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    extensions: Option<Vec<String>>,
    #[serde(default)]
    icon: Option<String>,
}

/// A catalog entry resolved into what the host can actually do with it.
struct Offering {
    id: String,
    name: String,
    version: String,
    build_id: Option<String>,
    extensions: Vec<String>,
    icon: Option<String>,
    summary: String,
    publisher: String,
    targets: Vec<String>,
    local: Option<LocalCopy>,
    remote: Option<Remote>,
}

/// A package shipped with the host, installable without a network.
struct LocalCopy {
    directory: PathBuf,
    build_id: String,
}

/// A published artifact and the mirrors serving it, in priority order.
#[derive(Clone)]
struct Remote {
    urls: Vec<String>,
    sha256: String,
    size: u64,
    build_id: String,
    /// Display name of the source, falling back to where its catalog lives.
    name: String,
    catalog: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketList {
    pub entries: Vec<Entry>,
    /// Sources that could not be read, surfaced rather than a market that is quietly
    /// missing entries.
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub source: Source,
    pub id: String,
    pub name: String,
    pub version: String,
    pub extensions: Vec<String>,
    /// Declared icon name, so the market card matches the installed card.
    pub icon: Option<String>,
    pub summary: String,
    pub publisher: String,
    pub installed_version: Option<String>,
    pub update_available: bool,
}

/// Where an entry comes from. Tagged so another provider only adds a variant.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    /// Shipped with the host, installed from a local directory.
    Local { location: String },
    /// Downloaded from a published catalog and checked against its hashes.
    Remote {
        name: String,
        catalog: String,
        urls: Vec<String>,
        sha256: String,
        size: u64,
    },
}

impl Market {
    pub fn new(root: PathBuf, cache: PathBuf) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|error| format!("无法初始化下载客户端：{error}"))?;
        Ok(Self {
            root,
            cache,
            client,
            remote: Arc::new(Mutex::new(RemoteIndex::default())),
        })
    }

    /// The bundled catalog: the offline baseline that ships with the host.
    fn read_bundled(&self) -> Result<(Vec<SourceDeclaration>, Vec<Offering>), String> {
        let root = self
            .root
            .canonicalize()
            .map_err(|e| format!("插件市场尚未构建：{e}"))?;
        let bytes = std::fs::read(root.join("catalog.json"))
            .map_err(|e| format!("读取插件市场失败：{e}"))?;
        let catalog = parse_catalog(&bytes)?;
        let mut offerings = Vec::new();
        let mut ids = HashSet::new();
        for listing in catalog.entries {
            if !ids.insert(listing.id.clone()) {
                return Err("Market package id mismatch or duplicate".into());
            }
            // A catalog whose entries carry no bundled copy is a published catalog
            // being read as the bundled one: nothing here can be installed.
            let Some(bundled) = &listing.directory else {
                continue;
            };
            let relative = Path::new(bundled);
            if relative
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
                || bundled.contains(':')
            {
                return Err("Invalid market package path".into());
            }
            let directory = root
                .join(relative)
                .canonicalize()
                .map_err(|e| e.to_string())?;
            if !directory.starts_with(&root) {
                return Err("Market package escapes its directory".into());
            }
            let package = Package::load(&directory)?;
            if package.manifest.id != listing.id {
                return Err("Market package id mismatch or duplicate".into());
            }
            let manifest = package.manifest;
            offerings.push(Offering {
                id: listing.id,
                name: manifest.name,
                version: manifest.version,
                build_id: Some(manifest.build_id.clone()),
                extensions: manifest.extensions,
                icon: manifest.icon,
                summary: listing.summary,
                publisher: listing.publisher,
                targets: listing.targets,
                local: Some(LocalCopy {
                    directory,
                    build_id: manifest.build_id,
                }),
                remote: None,
            });
        }
        Ok((catalog.sources, offerings))
    }

    /// Every catalog the bundled catalog points at. A source that fails falls back to
    /// what it last returned, so a network blip does not empty the market.
    async fn remote_offerings(
        &self,
        declarations: &[SourceDeclaration],
    ) -> (Vec<Offering>, Vec<String>) {
        if declarations.is_empty() {
            return (Vec::new(), Vec::new());
        }
        let mut index = self.remote.lock().await;
        if let Some(at) = index.at {
            if at.elapsed() < CATALOG_TTL {
                return (
                    build_remote_offerings(declarations, &index.fetched).0,
                    index.warnings.clone(),
                );
            }
        }
        let previous = index.fetched.clone();
        let mut fetched = Vec::new();
        let mut warnings = Vec::new();
        for declaration in declarations {
            if let Err(error) = validate_source(declaration) {
                warnings.push(error);
                continue;
            }
            match read_source(&self.client, declaration).await {
                Ok(entries) => fetched.push(RemoteCatalog {
                    catalog: declaration.catalog.clone(),
                    entries,
                }),
                Err(error) => match previous.iter().find(|c| c.catalog == declaration.catalog) {
                    Some(cached) => {
                        fetched.push(cached.clone());
                        warnings.push(format!("{error}（沿用上次读取到的目录）"));
                    }
                    None => warnings.push(error),
                },
            }
        }
        let (offerings, unreadable) = build_remote_offerings(declarations, &fetched);
        warnings.extend(unreadable);
        index.at = Some(Instant::now());
        index.fetched = fetched;
        index.warnings = warnings.clone();
        (offerings, warnings)
    }

    async fn offerings(&self) -> Result<(Vec<Offering>, Vec<String>), String> {
        let (declarations, bundled) = self.read_bundled()?;
        let (remote, mut warnings) = self.remote_offerings(&declarations).await;
        let merged = merge(bundled, remote, &mut warnings);
        Ok((merged, warnings))
    }

    pub async fn list(&self, runtime: &Runtime) -> Result<MarketList, String> {
        let (offerings, mut warnings) = self.offerings().await?;
        let snapshot = runtime.snapshot().await;
        let mut entries = Vec::new();
        for offering in offerings {
            if !runs_here(&offering.targets) {
                warnings.push(format!(
                    "{} 面向 {}，已跳过（当前平台 {HOST_TARGET}）",
                    offering.name,
                    offering.targets.join("、")
                ));
                continue;
            }
            let installed = snapshot
                .plugins
                .iter()
                .find(|plugin| plugin.manifest.id == offering.id);
            let update_available = installed.is_some_and(|installed| {
                installed.manifest.version != offering.version
                    || installed.manifest.build_id.as_str()
                        != offering.build_id.as_deref().unwrap_or_default()
            });
            let source = match &offering.remote {
                Some(remote) => Source::Remote {
                    name: remote.name.clone(),
                    catalog: remote.catalog.clone(),
                    urls: remote.urls.clone(),
                    sha256: remote.sha256.clone(),
                    size: remote.size,
                },
                None => Source::Local {
                    location: offering
                        .local
                        .as_ref()
                        .map(|copy| copy.directory.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                },
            };
            entries.push(Entry {
                source,
                id: offering.id,
                name: offering.name,
                version: offering.version,
                extensions: offering.extensions,
                icon: offering.icon,
                summary: offering.summary,
                publisher: offering.publisher,
                installed_version: installed.map(|plugin| plugin.manifest.version.clone()),
                update_available,
            });
        }
        Ok(MarketList { entries, warnings })
    }

    /// Resolve an entry to an installable package directory. Everything that can be
    /// checked before the installer runs happens here, so installing only ever copies a
    /// tree that was already verified.
    pub async fn prepare(&self, id: &str) -> Result<PathBuf, String> {
        let (offerings, _) = self.offerings().await?;
        let offering = offerings
            .into_iter()
            .find(|offering| offering.id == id)
            .ok_or("插件不在市场目录中")?;
        if !runs_here(&offering.targets) {
            return Err(format!(
                "该插件面向 {}，无法在当前平台（{HOST_TARGET}）运行",
                offering.targets.join("、")
            ));
        }
        if let Some(remote) = &offering.remote {
            return self.materialize(remote, &offering).await;
        }
        offering
            .local
            .map(|copy| copy.directory)
            .ok_or_else(|| "插件不在市场目录中".to_string())
    }

    /// Download, verify and unpack a published package, reusing the cache when the
    /// same artifact was already fetched.
    async fn materialize(&self, remote: &Remote, offering: &Offering) -> Result<PathBuf, String> {
        let cached = self.cache.join(&remote.sha256);
        if cached.is_dir() {
            match confirm(&cached, offering) {
                Ok(()) => return Ok(cached),
                // A cache entry that no longer matches the catalog is worse than no
                // cache at all: it would fail every install from here on. Drop it and
                // fetch the artifact again.
                Err(_) => {
                    let _ = std::fs::remove_dir_all(&cached);
                }
            }
        }
        let mut failure = String::new();
        let mut body = None;
        for url in &remote.urls {
            match artifact::fetch(&self.client, url).await {
                Ok(bytes) => {
                    body = Some(bytes);
                    break;
                }
                Err(error) => failure = error,
            }
        }
        let Some(bytes) = body else {
            return Err(format!("下载插件包失败：{failure}"));
        };
        // The artifact hash proves the transfer against the catalog; the identity check
        // after unpacking proves the contents are the build the catalog named.
        let actual = artifact::sha256_hex(&bytes);
        if actual != remote.sha256 {
            return Err(format!(
                "插件包校验失败：目录声明 {}，实际 {actual}",
                remote.sha256
            ));
        }
        if bytes.len() as u64 != remote.size {
            return Err(format!(
                "插件包大小与目录记录不符：目录声明 {} 字节，实际 {} 字节",
                remote.size,
                bytes.len()
            ));
        }
        std::fs::create_dir_all(&self.cache).map_err(|e| e.to_string())?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        let staging = self
            .cache
            .join(format!(".unpack-{}-{stamp}", std::process::id()));
        // `extract` removes the directory itself when it fails, so a partial tree is
        // never left where an install could pick it up.
        artifact::extract(&bytes, &staging)?;
        if let Err(error) = confirm(&staging, offering) {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(error);
        }
        match std::fs::rename(&staging, &cached) {
            Ok(()) => Ok(cached),
            // Another download of the same artifact finished first. Its directory holds
            // the same content, so it is a better answer than failing.
            Err(_) if cached.is_dir() => {
                let _ = std::fs::remove_dir_all(&staging);
                confirm(&cached, offering)?;
                Ok(cached)
            }
            Err(error) => {
                let _ = std::fs::remove_dir_all(&staging);
                Err(format!("无法写入插件缓存：{error}"))
            }
        }
    }

    pub async fn install(&self, runtime: &Runtime, id: &str) -> Result<(), String> {
        runtime.install(&self.prepare(id).await?).await
    }

    pub async fn sync_development(&self, runtime: &Runtime) -> Result<(), String> {
        let (_, offerings) = self.read_bundled()?;
        let snapshot = runtime.snapshot().await;
        for offering in offerings {
            let Some(copy) = offering.local else { continue };
            let rebuilt = snapshot.plugins.iter().any(|installed| {
                installed.manifest.id == offering.id
                    && !installed.manifest.build_id.is_empty()
                    && installed.manifest.build_id != copy.build_id
            });
            if rebuilt {
                runtime.update_development(&copy.directory).await?;
            }
        }
        Ok(())
    }
}

fn parse_catalog(bytes: &[u8]) -> Result<Catalog, String> {
    if bytes.len() > MAX_CATALOG_BYTES {
        return Err("Market catalog exceeds 1 MiB".into());
    }
    let catalog: Catalog = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if catalog.api != 1 || catalog.entries.len() > MAX_ENTRIES {
        return Err("Invalid market catalog".into());
    }
    check_signature(catalog.signature.as_ref())?;
    if catalog.sources.len() > MAX_SOURCES {
        return Err("Invalid market sources".into());
    }
    Ok(catalog)
}

/// Reserved for catalog signatures.
///
/// Nothing verifies them yet, so a catalog that declares one is refused instead of
/// being trusted. An unsigned catalog states the current model honestly, while a
/// signed one that nobody checks would be a promise the host does not keep. The
/// release signing work replaces this function; until then, refusing is the only
/// honest answer.
fn check_signature(signature: Option<&Value>) -> Result<(), String> {
    match signature {
        None => Ok(()),
        Some(value) => {
            let algorithm = value
                .get("algorithm")
                .and_then(Value::as_str)
                .unwrap_or("形状未知");
            Err(format!(
                "该市场目录声明了签名（{algorithm}），但当前版本尚未实现签名校验，\
                 因此拒绝使用它；请改用未签名的目录，或等待签名支持"
            ))
        }
    }
}

fn validate_source(declaration: &SourceDeclaration) -> Result<(), String> {
    for (label, value) in [
        ("catalog", &declaration.catalog),
        ("base", &declaration.base),
    ] {
        if value.is_empty()
            || value.len() > 2048
            || value.chars().any(|c| c.is_control() || c.is_whitespace())
        {
            return Err(format!("市场来源的 {label} 无效：{value}"));
        }
        // A relative location would resolve against whatever directory the host
        // happens to run in, which is not a mirror anyone can rely on.
        if !artifact::is_http(value)
            && !value.starts_with("file://")
            && !Path::new(value).is_absolute()
        {
            return Err(format!(
                "市场来源的 {label} 必须是 http(s) 地址、file:// 或绝对路径：{value}"
            ));
        }
    }
    Ok(())
}

async fn read_source(
    client: &reqwest::Client,
    declaration: &SourceDeclaration,
) -> Result<Vec<Listing>, String> {
    let bytes = if artifact::is_http(&declaration.catalog) {
        let mut response = client
            .get(&declaration.catalog)
            .timeout(CATALOG_TIMEOUT)
            .send()
            .await
            .map_err(|error| format!("读取市场目录 {} 失败：{error}", declaration.catalog))?;
        if !response.status().is_success() {
            return Err(format!(
                "读取市场目录 {} 失败：HTTP {}",
                declaration.catalog,
                response.status()
            ));
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("读取市场目录 {} 中断：{error}", declaration.catalog))?
        {
            if body.len() + chunk.len() > MAX_CATALOG_BYTES {
                return Err(format!("市场目录 {} 超过 1 MiB", declaration.catalog));
            }
            body.extend_from_slice(&chunk);
        }
        body
    } else {
        std::fs::read(local_catalog_path(&declaration.catalog))
            .map_err(|error| format!("读取市场目录 {} 失败：{error}", declaration.catalog))?
    };
    Ok(parse_catalog(&bytes)?.entries)
}

/// `file:///C:/mirror/catalog.json` and `C:\mirror\catalog.json` are the same file.
fn local_catalog_path(location: &str) -> PathBuf {
    let text = location.strip_prefix("file://").unwrap_or(location);
    match text.strip_prefix('/') {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => PathBuf::from(text),
    }
}

fn build_remote_offerings(
    declarations: &[SourceDeclaration],
    catalogs: &[RemoteCatalog],
) -> (Vec<Offering>, Vec<String>) {
    let mut offerings = Vec::new();
    let mut warnings = Vec::new();
    for declaration in declarations {
        let Some(catalog) = catalogs.iter().find(|c| c.catalog == declaration.catalog) else {
            continue;
        };
        for listing in &catalog.entries {
            match remote_offering(listing, declaration) {
                Ok(offering) => offerings.push(offering),
                // An entry the host cannot read is reported rather than dropped: a
                // market silently missing a plugin is the failure this path exists to
                // avoid.
                Err(error) => warnings.push(format!("{}：{error}", declaration.label())),
            }
        }
    }
    (offerings, warnings)
}

fn remote_offering(listing: &Listing, declaration: &SourceDeclaration) -> Result<Offering, String> {
    let missing = |field: &str| format!("目录条目 {} 缺少 {field}", listing.id);
    let artifact_name = listing
        .artifact
        .clone()
        .ok_or_else(|| missing("artifact"))?;
    let sha256 = listing.sha256.clone().ok_or_else(|| missing("sha256"))?;
    let size = listing.size.ok_or_else(|| missing("size"))?;
    let version = listing.version.clone().ok_or_else(|| missing("version"))?;
    let build_id = listing.build_id.clone().ok_or_else(|| missing("buildId"))?;
    if sha256.len() != 64
        || !sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(format!("目录条目 {} 的 sha256 无效", listing.id));
    }
    if size == 0 || size > artifact::MAX_ARTIFACT_BYTES {
        return Err(format!("目录条目 {} 的 size 无效", listing.id));
    }
    if build_id.is_empty() || build_id.len() > 128 {
        return Err(format!("目录条目 {} 的 buildId 无效", listing.id));
    }
    Ok(Offering {
        id: listing.id.clone(),
        name: listing.name.clone().unwrap_or_else(|| listing.id.clone()),
        version,
        build_id: Some(build_id.clone()),
        extensions: listing.extensions.clone().unwrap_or_default(),
        icon: listing.icon.clone(),
        summary: listing.summary.clone(),
        publisher: listing.publisher.clone(),
        targets: listing.targets.clone(),
        local: None,
        remote: Some(Remote {
            urls: vec![artifact_url(&declaration.base, &artifact_name)?],
            sha256,
            size,
            build_id,
            name: declaration.label(),
            catalog: declaration.catalog.clone(),
        }),
    })
}

/// An artifact name is a plain file name inside the mirror's base, so a catalog cannot
/// point the host at a directory its source did not declare.
fn artifact_url(base: &str, artifact: &str) -> Result<String, String> {
    if artifact.is_empty()
        || artifact.len() > 200
        || artifact.starts_with('.')
        || !artifact.ends_with(".zip")
        || artifact.contains(['/', '\\', ':', '?', '#'])
    {
        return Err(format!("目录中的 artifact 名无效：{artifact}"));
    }
    let base = base.strip_suffix('/').unwrap_or(base);
    Ok(format!("{base}/{artifact}"))
}

/// Published entries replace the copy shipped with the host, except when both are the
/// same build: then the bundled copy is used as-is and nothing is downloaded. The
/// published catalog is the update channel for a shipped baseline, so a mirror that
/// lags behind shows a visible older version instead of silently substituting files.
fn merge(
    bundled: Vec<Offering>,
    remote: Vec<Offering>,
    warnings: &mut Vec<String>,
) -> Vec<Offering> {
    let mut merged = bundled;
    for candidate in remote {
        let Some(existing) = merged.iter_mut().find(|entry| entry.id == candidate.id) else {
            merged.push(candidate);
            continue;
        };
        let next = candidate
            .remote
            .clone()
            .expect("a remote offering always carries its artifact");
        match existing.remote.as_mut() {
            // The same artifact from another mirror: keep every URL so a failing mirror
            // falls through to the next one.
            Some(current) if current.sha256 == next.sha256 => current.urls.extend(next.urls),
            Some(current) => warnings.push(format!(
                "插件 {} 在来源 {} 与 {} 声明的 sha256 不一致，已忽略后者",
                candidate.id, current.name, next.name
            )),
            None => {
                if existing
                    .local
                    .as_ref()
                    .is_some_and(|copy| copy.build_id == next.build_id)
                {
                    continue;
                }
                let local = existing.local.take();
                *existing = Offering { local, ..candidate };
            }
        }
    }
    merged
}

fn runs_here(targets: &[String]) -> bool {
    targets.is_empty() || targets.iter().any(|target| target == HOST_TARGET)
}

/// Confirm that an unpacked package is the one the catalog indexed. The artifact hash
/// already proved the bytes; this proves the contents declare the same identity, so a
/// package fetched for one entry cannot be passed off as another.
fn confirm(directory: &Path, offering: &Offering) -> Result<(), String> {
    let manifest = Package::load(directory)?.manifest;
    if manifest.id != offering.id {
        return Err(format!(
            "插件包内的插件是 {}，与目录中的 {} 不符",
            manifest.id, offering.id
        ));
    }
    if let Some(expected) = &offering.build_id {
        if !expected.is_empty() && manifest.build_id != *expected {
            return Err(format!(
                "插件包内容不是目录记录的那次构建：包内 {}，目录 {expected}",
                manifest.build_id
            ));
        }
    }
    if manifest.version != offering.version {
        return Err(format!(
            "插件包版本与目录记录不符：包内 {}，目录 {}",
            manifest.version, offering.version
        ));
    }
    if !manifest.runs_here() {
        return Err(format!(
            "插件包面向 {}，无法在当前平台（{HOST_TARGET}）运行",
            manifest.targets.join("、")
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn declaration() -> SourceDeclaration {
        SourceDeclaration {
            catalog: "file:///C:/mirror/catalog.json".into(),
            base: "file:///C:/mirror".into(),
            name: Some("测试源".into()),
        }
    }

    fn offering(id: &str, version: &str, build_id: &str, local: bool, remote: bool) -> Offering {
        Offering {
            id: id.into(),
            name: "One".into(),
            version: version.into(),
            build_id: Some(build_id.into()),
            extensions: vec!["one".into()],
            icon: None,
            summary: format!("{version} summary"),
            publisher: "Tests".into(),
            targets: Vec::new(),
            local: local.then(|| LocalCopy {
                directory: PathBuf::from("market/one"),
                build_id: build_id.into(),
            }),
            remote: remote.then(|| Remote {
                urls: vec![format!("https://host/one-{build_id}.zip")],
                sha256: "a".repeat(64),
                size: 10,
                build_id: build_id.into(),
                name: "测试源".into(),
                catalog: "https://host/catalog.json".into(),
            }),
        }
    }

    #[test]
    fn resolves_artifact_names_inside_the_declared_base() {
        assert_eq!(
            artifact_url("https://host/plugins", "ember.text-1.0.0-abc.zip").unwrap(),
            "https://host/plugins/ember.text-1.0.0-abc.zip"
        );
        assert_eq!(
            artifact_url("file:///C:/mirror/", "a.zip").unwrap(),
            "file:///C:/mirror/a.zip"
        );
        for name in ["../a.zip", "/a.zip", "sub/a.zip", "a.txt", "", "a.zip?x=1"] {
            assert!(artifact_url("https://host/plugins", name).is_err(), "{name}");
        }
    }

    #[test]
    fn refuses_a_catalog_that_claims_a_signature() {
        let unsigned = json!({"api": 1, "entries": []}).to_string();
        assert!(parse_catalog(unsigned.as_bytes()).is_ok());
        let signed =
            json!({"api": 1, "signature": {"algorithm": "ed25519", "value": "abc"}, "entries": []})
                .to_string();
        let error = parse_catalog(signed.as_bytes())
            .err()
            .expect("a signed catalog must be refused");
        assert!(error.contains("ed25519"), "{error}");
    }

    #[test]
    fn requires_sources_to_name_a_real_location() {
        assert!(validate_source(&declaration()).is_ok());
        for (catalog, base) in [
            ("https://host/catalog.json", "mirror"),
            ("", "https://host"),
            ("https://host/catalog.json", "https://host/a b"),
        ] {
            let broken = SourceDeclaration {
                catalog: catalog.into(),
                base: base.into(),
                name: None,
            };
            assert!(validate_source(&broken).is_err(), "{catalog} {base}");
        }
    }

    #[test]
    fn reads_both_spellings_of_a_local_location() {
        assert_eq!(
            local_catalog_path("file:///C:/mirror/catalog.json"),
            PathBuf::from("C:/mirror/catalog.json")
        );
        assert_eq!(
            local_catalog_path("D:\\mirror\\catalog.json"),
            PathBuf::from("D:\\mirror\\catalog.json")
        );
    }

    #[test]
    fn a_published_build_replaces_the_bundled_copy() {
        // The same build is already bundled, so nothing is downloaded.
        let mut warnings = Vec::new();
        let same = merge(
            vec![offering("test.one", "1.0.0", "bundled", true, false)],
            vec![offering("test.one", "2.0.0", "bundled", false, true)],
            &mut warnings,
        );
        assert!(same[0].remote.is_none());
        assert_eq!(same[0].version, "1.0.0");
        assert!(warnings.is_empty());

        // A different build is what the market offers, and the bundled copy stays as
        // the offline fallback.
        let mut warnings = Vec::new();
        let newer = merge(
            vec![offering("test.one", "1.0.0", "bundled", true, false)],
            vec![offering("test.one", "2.0.0", "published", false, true)],
            &mut warnings,
        );
        assert_eq!(newer[0].version, "2.0.0");
        assert!(newer[0].local.is_some());
        assert!(warnings.is_empty());

        // A second mirror for the same artifact contributes another URL instead of a
        // duplicate card.
        let mut warnings = Vec::new();
        let mirrored = merge(
            Vec::new(),
            vec![
                offering("test.one", "2.0.0", "published", false, true),
                offering("test.one", "2.0.0", "published", false, true),
            ],
            &mut warnings,
        );
        assert_eq!(mirrored.len(), 1);
        assert_eq!(mirrored[0].remote.as_ref().unwrap().urls.len(), 2);

        // Mirrors that disagree about the hash are a conflict, not a choice.
        let mut conflicting = offering("test.one", "2.0.0", "published", false, true);
        conflicting.remote.as_mut().unwrap().sha256 = "b".repeat(64);
        let mut warnings = Vec::new();
        let conflicted = merge(
            vec![offering("test.one", "2.0.0", "published", false, true)],
            vec![conflicting],
            &mut warnings,
        );
        assert_eq!(conflicted.len(), 1);
        assert_eq!(conflicted[0].remote.as_ref().unwrap().urls.len(), 1);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn filters_entries_that_cannot_run_here() {
        assert!(runs_here(&[]));
        assert!(runs_here(&[HOST_TARGET.to_string()]));
        assert!(!runs_here(&["linux-aarch64".to_string()]));
    }

    #[test]
    fn rejects_an_index_entry_that_is_not_self_contained() {
        let complete = json!({
            "id": "test.one", "summary": "s", "publisher": "p",
            "artifact": "a.zip", "sha256": "a".repeat(64), "size": 10,
            "version": "1.0.0", "buildId": "b",
        });
        let listing: Listing = serde_json::from_value(complete.clone()).unwrap();
        assert!(remote_offering(&listing, &declaration()).is_ok());
        for field in ["artifact", "sha256", "size", "version", "buildId"] {
            let mut broken = complete.clone();
            broken.as_object_mut().unwrap().remove(field);
            let listing: Listing = serde_json::from_value(broken).unwrap();
            assert!(
                remote_offering(&listing, &declaration()).is_err(),
                "{field} was optional"
            );
        }
        // A hash that is not a lowercase sha256 cannot be compared against anything.
        let mut upper = complete.clone();
        upper["sha256"] = json!("A".repeat(64));
        let listing: Listing = serde_json::from_value(upper).unwrap();
        assert!(remote_offering(&listing, &declaration()).is_err());
    }
}
