use crate::{
    artifact,
    manifest::{Package, HOST_TARGET},
    Runtime,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

/// Catalogs are refetched after this. The settings window keeps polling `market_list`
/// while it is open, so refreshing a source must not happen per request. A failed read is
/// cached for the same period, which bounds how often an unreachable source can delay the
/// market at all.
const CATALOG_TTL: Duration = Duration::from_secs(600);
const CATALOG_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_SOURCES: usize = 8;
const MAX_ENTRIES: usize = 256;
const MAX_CATALOG_BYTES: usize = 1024 * 1024;

/// One place published packages come from. Every plugin is an independent package, so
/// the host ships none of them: a source is a catalog plus the prefix its artifact names
/// resolve against, and the market is the only way a plugin gets installed.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    /// Shown on the market card and in messages. Falls back to the catalog location.
    #[serde(default)]
    pub name: Option<String>,
    /// The catalog to read: an http(s) URL, a `file://` URL, or an absolute path.
    pub catalog: String,
    /// Prefix the catalog's artifact names are resolved against.
    pub base: String,
}

impl Source {
    /// What to call this source in a message or on a market card.
    fn label(&self) -> String {
        self.name.clone().unwrap_or_else(|| self.catalog.clone())
    }
}

/// The sources file a host reads at startup.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceConfig {
    api: u32,
    sources: Vec<Source>,
}

/// Read and check a sources file into the list a `Market` takes.
pub fn read_sources(path: &Path) -> Result<Vec<Source>, String> {
    let bytes = std::fs::read(path)
        .map_err(|error| format!("读取插件来源配置失败 {}：{error}", path.display()))?;
    if bytes.len() > 64 * 1024 {
        return Err("插件来源配置超过 64 KiB".into());
    }
    let config: SourceConfig =
        serde_json::from_slice(&bytes).map_err(|error| format!("插件来源配置无效：{error}"))?;
    if config.api != 1 {
        return Err("不支持的插件来源配置版本".into());
    }
    if config.sources.len() > MAX_SOURCES {
        return Err(format!("插件来源最多 {MAX_SOURCES} 个"));
    }
    Ok(config.sources)
}

#[derive(Clone)]
pub struct Market {
    sources: Vec<Source>,
    /// Content-addressed cache for downloaded packages, keyed by artifact sha256.
    cache: PathBuf,
    /// Whatever was wrong with the sources file, reported with every listing so a
    /// misconfiguration does not look like an empty market.
    config_warning: Option<String>,
    client: reqwest::Client,
    remote: Arc<Mutex<RemoteIndex>>,
}

/// Catalogs read from the configured sources, with the warnings from reading them.
#[derive(Default)]
struct RemoteIndex {
    fetched: Vec<RemoteCatalog>,
    /// Everything worth reporting, computed with the catalogs so a cached listing says
    /// the same thing a fresh one does.
    warnings: Vec<String>,
    at: Option<Instant>,
}

#[derive(Clone)]
struct RemoteCatalog {
    source: Source,
    entries: Vec<Listing>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    api: u32,
    /// Reserved for catalog signatures. Parsed only to be refused; see `check_signature`
    /// for why that is the honest behaviour today.
    #[serde(default)]
    signature: Option<Value>,
    entries: Vec<Listing>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listing {
    id: String,
    summary: String,
    publisher: String,
    /// Published artifact. The catalog is the index, so it carries what a market card
    /// needs before anything is downloaded: the display fields, and the build identity
    /// the download is confirmed against afterwards.
    artifact: String,
    sha256: String,
    size: u64,
    version: String,
    build_id: String,
    #[serde(default)]
    targets: Vec<String>,
    /// Suggested by the source for a fresh installation, so the first-run chooser can
    /// offer a few basics instead of the whole catalog.
    #[serde(default)]
    recommended: bool,
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
    extensions: Vec<String>,
    icon: Option<String>,
    summary: String,
    publisher: String,
    targets: Vec<String>,
    recommended: bool,
    remote: Remote,
}

/// A published artifact and the mirrors serving it, in priority order.
#[derive(Clone)]
struct Remote {
    urls: Vec<String>,
    sha256: String,
    size: u64,
    build_id: String,
    /// Display name of the source the entry came from.
    name: String,
    catalog: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketList {
    pub entries: Vec<Entry>,
    /// Sources that could not be read, entries that could not be turned into something
    /// installable, and packages that do not run here. Surfaced rather than a market
    /// that is quietly missing plugins.
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub source: EntrySource,
    pub id: String,
    pub name: String,
    pub version: String,
    pub extensions: Vec<String>,
    /// Declared icon name, so the market card matches the installed card.
    pub icon: Option<String>,
    pub summary: String,
    pub publisher: String,
    /// Suggested for a fresh installation.
    pub recommended: bool,
    pub installed_version: Option<String>,
    pub update_available: bool,
}

/// Where an entry comes from. Tagged so another provider only adds a variant.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EntrySource {
    /// Downloaded from a catalog and checked against its hashes.
    Remote {
        name: String,
        catalog: String,
        urls: Vec<String>,
        sha256: String,
        size: u64,
    },
}

impl Market {
    /// `sources` is whatever the host managed to read: a broken sources file is handed in
    /// as its error so the market can report it instead of looking merely empty.
    pub fn new(sources: Result<Vec<Source>, String>, cache: PathBuf) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|error| format!("无法初始化下载客户端：{error}"))?;
        let (sources, config_warning) = match sources {
            Ok(sources) => (sources, None),
            Err(error) => (Vec::new(), Some(error)),
        };
        Ok(Self {
            sources,
            cache,
            config_warning,
            client,
            remote: Arc::new(Mutex::new(RemoteIndex::default())),
        })
    }

    /// Every configured source, fetched at most once per `CATALOG_TTL`. A source that
    /// fails falls back to what it last returned, so a network blip does not empty the
    /// market.
    async fn offerings(&self) -> (Vec<Offering>, Vec<String>) {
        let mut warnings: Vec<String> = self.config_warning.iter().cloned().collect();
        if self.sources.is_empty() {
            return (Vec::new(), warnings);
        }
        let mut index = self.remote.lock().await;
        if let Some(at) = index.at {
            if at.elapsed() < CATALOG_TTL {
                return (offerings_of(&index.fetched), index.warnings.clone());
            }
        }
        let previous = index.fetched.clone();
        let mut fetched = Vec::new();
        for source in &self.sources {
            if let Err(error) = validate_source(source) {
                warnings.push(error);
                continue;
            }
            match read_source(&self.client, source).await {
                Ok(entries) => fetched.push(RemoteCatalog {
                    source: source.clone(),
                    entries,
                }),
                Err(error) => match previous
                    .iter()
                    .find(|catalog| catalog.source.catalog == source.catalog)
                {
                    Some(cached) => {
                        fetched.push(cached.clone());
                        warnings.push(format!("{error}（沿用上次读取到的目录）"));
                    }
                    None => warnings.push(error),
                },
            }
        }
        let (offerings, unreadable) = collect(&fetched);
        warnings.extend(unreadable);
        index.at = Some(Instant::now());
        index.fetched = fetched;
        index.warnings = warnings.clone();
        (offerings, warnings)
    }

    pub async fn list(&self, runtime: &Runtime) -> Result<MarketList, String> {
        let (offerings, mut warnings) = self.offerings().await;
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
            entries.push(Entry {
                source: EntrySource::Remote {
                    name: offering.remote.name.clone(),
                    catalog: offering.remote.catalog.clone(),
                    urls: offering.remote.urls.clone(),
                    sha256: offering.remote.sha256.clone(),
                    size: offering.remote.size,
                },
                id: offering.id.clone(),
                name: offering.name.clone(),
                version: offering.version.clone(),
                extensions: offering.extensions.clone(),
                icon: offering.icon.clone(),
                summary: offering.summary.clone(),
                publisher: offering.publisher.clone(),
                recommended: offering.recommended,
                update_available: installed.is_some_and(|installed| {
                    installed.manifest.version != offering.version
                        || installed.manifest.build_id != offering.remote.build_id
                }),
                installed_version: installed.map(|plugin| plugin.manifest.version.clone()),
            });
        }
        Ok(MarketList { entries, warnings })
    }

    /// Resolve an entry to an installable package directory. Everything that can be
    /// checked before the installer runs happens here, so installing only ever copies a
    /// tree that was already verified.
    pub async fn prepare(&self, id: &str) -> Result<PathBuf, String> {
        let (offerings, _) = self.offerings().await;
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
        self.materialize(&offering).await
    }

    /// Download, verify and unpack a published package, reusing the cache when the same
    /// artifact was already fetched.
    async fn materialize(&self, offering: &Offering) -> Result<PathBuf, String> {
        let remote = &offering.remote;
        let cached = self.cache.join(&remote.sha256);
        if cached.is_dir() {
            match confirm(&cached, offering) {
                Ok(()) => return Ok(cached),
                // A cache entry that no longer matches the catalog is worse than no cache
                // at all: it would fail every install from here on. Drop it and fetch the
                // artifact again.
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
        match crate::publish_directory(&staging, &cached) {
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
        runtime.install(&self.prepare(id).await?).await?;
        self.prune_cache(runtime).await.map(|_| ())
    }

    /// Drop cached packages no installed revision can reach.
    ///
    /// The cache exists so the same package is not downloaded twice, which only matters for
    /// packages something can still install or fall back to. Entries are keyed by artifact
    /// hash, so without this every version a machine ever fetched would stay unpacked in the
    /// cache for good — including versions of plugins the user has since uninstalled.
    pub async fn prune_cache(&self, runtime: &Runtime) -> Result<usize, String> {
        let retained = runtime.installed_build_ids().await?;
        let entries = match std::fs::read_dir(&self.cache) {
            Ok(entries) => entries,
            // Nothing has been downloaded yet, which is not a failure.
            Err(_) => return Ok(0),
        };
        let mut removed = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            // An entry without a readable manifest cannot be installed from, so it goes too.
            let build_id = Package::load(&path)
                .ok()
                .map(|package| package.manifest.build_id);
            match build_id {
                Some(build_id) if retained.contains(&build_id) => continue,
                _ => {
                    if std::fs::remove_dir_all(&path).is_ok() {
                        removed += 1;
                    }
                }
            }
        }
        Ok(removed)
    }

    /// Development only: the local mirror is rebuilt whenever plugin sources change, so
    /// plugins installed from it have to follow. Whether a rebuild counts as newer is the
    /// installer's decision, so this only decides which ids to offer it.
    pub async fn sync_development(&self, runtime: &Runtime) -> Result<(), String> {
        let (offerings, _) = self.offerings().await;
        let snapshot = runtime.snapshot().await;
        let mut updated = false;
        for offering in offerings {
            let installed = snapshot
                .plugins
                .iter()
                .find(|plugin| plugin.manifest.id == offering.id);
            let Some(installed) = installed else { continue };
            if installed.manifest.build_id == offering.remote.build_id {
                continue;
            }
            let directory = self.materialize(&offering).await?;
            runtime.update_development(&directory).await?;
            updated = true;
        }
        // A rebuild that replaced a plugin leaves the superseded package in the cache.
        if updated {
            self.prune_cache(runtime).await?;
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
    Ok(catalog)
}

/// Reserved for catalog signatures.
///
/// Nothing verifies them yet, so a catalog that declares one is refused instead of being
/// trusted. An unsigned catalog states the current model honestly, while a signed one
/// that nobody checks would be a promise the host does not keep. The release signing work
/// replaces this function; until then, refusing is the only honest answer.
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

fn validate_source(source: &Source) -> Result<(), String> {
    for (label, value) in [("catalog", &source.catalog), ("base", &source.base)] {
        if value.is_empty()
            || value.len() > 2048
            || value.chars().any(|c| c.is_control() || c.is_whitespace())
        {
            return Err(format!(
                "市场来源 {} 的 {label} 无效：{value}",
                source.label()
            ));
        }
        // A relative location would resolve against whatever directory the host happens
        // to run in, which is not a mirror anyone can rely on.
        if !artifact::is_http(value) && !value.starts_with("file://") && !Path::new(value).is_absolute()
        {
            return Err(format!(
                "市场来源 {} 的 {label} 必须是 http(s) 地址、file:// 或绝对路径：{value}",
                source.label()
            ));
        }
    }
    Ok(())
}

async fn read_source(client: &reqwest::Client, source: &Source) -> Result<Vec<Listing>, String> {
    let bytes = if artifact::is_http(&source.catalog) {
        let mut response = client
            .get(&source.catalog)
            .timeout(CATALOG_TIMEOUT)
            .send()
            .await
            .map_err(|error| format!("读取市场目录 {} 失败：{error}", source.catalog))?;
        if !response.status().is_success() {
            return Err(format!(
                "读取市场目录 {} 失败：HTTP {}",
                source.catalog,
                response.status()
            ));
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("读取市场目录 {} 中断：{error}", source.catalog))?
        {
            if body.len() + chunk.len() > MAX_CATALOG_BYTES {
                return Err(format!("市场目录 {} 超过 1 MiB", source.catalog));
            }
            body.extend_from_slice(&chunk);
        }
        body
    } else {
        std::fs::read(local_catalog_path(&source.catalog))
            .map_err(|error| format!("读取市场目录 {} 失败：{error}", source.catalog))?
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

/// One card per plugin id. A second source naming the same artifact adds a mirror instead
/// of a duplicate card; sources that disagree about the hash are a conflict, which is
/// reported rather than resolved quietly.
fn collect(catalogs: &[RemoteCatalog]) -> (Vec<Offering>, Vec<String>) {
    let mut offerings: Vec<Offering> = Vec::new();
    let mut warnings = Vec::new();
    for catalog in catalogs {
        for listing in &catalog.entries {
            let offering = match resolve(listing, &catalog.source) {
                Ok(offering) => offering,
                // An entry the host cannot read is reported rather than dropped: a market
                // silently missing a plugin is the failure this path exists to avoid.
                Err(error) => {
                    warnings.push(format!("{}：{error}", catalog.source.label()));
                    continue;
                }
            };
            match offerings.iter_mut().find(|known| known.id == offering.id) {
                Some(known) if known.remote.sha256 == offering.remote.sha256 => {
                    known.remote.urls.extend(offering.remote.urls)
                }
                Some(known) => warnings.push(format!(
                    "插件 {} 在来源 {} 与 {} 声明的 sha256 不一致，已忽略后者",
                    offering.id, known.remote.name, offering.remote.name
                )),
                None => offerings.push(offering),
            }
        }
    }
    (offerings, warnings)
}

fn offerings_of(catalogs: &[RemoteCatalog]) -> Vec<Offering> {
    collect(catalogs).0
}

fn resolve(listing: &Listing, source: &Source) -> Result<Offering, String> {
    if listing.sha256.len() != 64
        || !listing
            .sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(format!("目录条目 {} 的 sha256 无效", listing.id));
    }
    if listing.size == 0 || listing.size > artifact::MAX_ARTIFACT_BYTES {
        return Err(format!("目录条目 {} 的 size 无效", listing.id));
    }
    if listing.build_id.is_empty() || listing.build_id.len() > 128 {
        return Err(format!("目录条目 {} 的 buildId 无效", listing.id));
    }
    if listing.version.is_empty() || listing.version.len() > 64 {
        return Err(format!("目录条目 {} 的 version 无效", listing.id));
    }
    Ok(Offering {
        id: listing.id.clone(),
        name: listing.name.clone().unwrap_or_else(|| listing.id.clone()),
        version: listing.version.clone(),
        extensions: listing.extensions.clone().unwrap_or_default(),
        icon: listing.icon.clone(),
        summary: listing.summary.clone(),
        publisher: listing.publisher.clone(),
        targets: listing.targets.clone(),
        recommended: listing.recommended,
        remote: Remote {
            urls: vec![artifact_url(&source.base, &listing.artifact)?],
            sha256: listing.sha256.clone(),
            size: listing.size,
            build_id: listing.build_id.clone(),
            name: source.label(),
            catalog: source.catalog.clone(),
        },
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
    if !offering.remote.build_id.is_empty() && manifest.build_id != offering.remote.build_id {
        return Err(format!(
            "插件包内容不是目录记录的那次构建：包内 {}，目录 {}",
            manifest.build_id, offering.remote.build_id
        ));
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

    fn source() -> Source {
        Source {
            name: Some("测试源".into()),
            catalog: "file:///C:/mirror/catalog.json".into(),
            base: "file:///C:/mirror".into(),
        }
    }

    fn listing(id: &str, artifact: &str) -> Listing {
        serde_json::from_value(json!({
            "id": id,
            "summary": "s",
            "publisher": "Tests",
            "artifact": artifact,
            "sha256": "a".repeat(64),
            "size": 10,
            "version": "1.0.0",
            "buildId": "build-one",
        }))
        .unwrap()
    }

    fn catalog(source: Source, entries: Vec<Listing>) -> RemoteCatalog {
        RemoteCatalog { source, entries }
    }

    #[test]
    fn reads_a_sources_file() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("market-sources.json");
        std::fs::write(
            &path,
            json!({"api":1,"sources":[{
                "name": "官方源",
                "catalog": "https://host/catalog.json",
                "base": "https://host/"
            }]})
            .to_string(),
        )
        .unwrap();
        let sources = read_sources(&path).unwrap();
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].label(), "官方源");
        // A source without a name is called by where its catalog lives.
        std::fs::write(
            &path,
            json!({"api":1,"sources":[{"catalog":"https://host/catalog.json","base":"https://host/"}]})
                .to_string(),
        )
        .unwrap();
        assert_eq!(read_sources(&path).unwrap()[0].label(), "https://host/catalog.json");

        std::fs::write(&path, json!({"api":2,"sources":[]}).to_string()).unwrap();
        assert!(read_sources(&path).is_err());
        std::fs::write(&path, "not json").unwrap();
        assert!(read_sources(&path).is_err());
        assert!(read_sources(&temp.path().join("missing.json")).is_err());
        let too_many: Vec<_> = (0..MAX_SOURCES + 1)
            .map(|index| json!({"catalog": format!("https://host/{index}.json"), "base": "https://host/"}))
            .collect();
        std::fs::write(&path, json!({"api":1,"sources":too_many}).to_string()).unwrap();
        assert!(read_sources(&path).is_err());
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
    fn requires_every_source_to_name_a_real_location() {
        assert!(validate_source(&source()).is_ok());
        for (catalog, base) in [
            ("https://host/catalog.json", "mirror"),
            ("", "https://host"),
            ("https://host/catalog.json", "https://host/a b"),
        ] {
            let broken = Source {
                name: None,
                catalog: catalog.into(),
                base: base.into(),
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
    fn resolves_entries_and_reports_the_ones_it_cannot_read() {
        let mut broken = listing("test.two", "b.zip");
        broken.sha256 = "not-a-hash".into();
        let catalogs = vec![catalog(source(), vec![listing("test.one", "a.zip"), broken])];
        let (offerings, warnings) = collect(&catalogs);
        assert_eq!(offerings.len(), 1);
        assert_eq!(offerings[0].id, "test.one");
        assert_eq!(
            offerings[0].remote.urls,
            ["file:///C:/mirror/a.zip".to_string()]
        );
        assert_eq!(offerings[0].remote.name, "测试源");
        assert_eq!(warnings.len(), 1, "{warnings:?}");
        assert!(warnings[0].contains("test.two"), "{warnings:?}");
        assert!(warnings[0].contains("测试源"), "{warnings:?}");
    }

    #[test]
    fn a_second_mirror_adds_a_url_and_a_different_hash_is_a_conflict() {
        let mut mirrored = listing("test.one", "a.zip");
        mirrored.name = Some("One".into());
        let other = Source {
            name: Some("镜像二".into()),
            catalog: "https://mirror/catalog.json".into(),
            base: "https://mirror/".into(),
        };
        let (same, warnings) = collect(&[
            catalog(source(), vec![mirrored.clone()]),
            catalog(other.clone(), vec![mirrored.clone()]),
        ]);
        assert_eq!(same.len(), 1);
        assert_eq!(same[0].remote.urls.len(), 2);
        assert!(warnings.is_empty(), "{warnings:?}");

        let mut conflicting = mirrored.clone();
        conflicting.sha256 = "b".repeat(64);
        let (conflicted, warnings) =
            collect(&[catalog(source(), vec![mirrored]), catalog(other, vec![conflicting])]);
        assert_eq!(conflicted.len(), 1);
        assert_eq!(conflicted[0].remote.urls.len(), 1);
        assert_eq!(warnings.len(), 1, "{warnings:?}");
        assert!(warnings[0].contains("sha256"), "{warnings:?}");
    }

    #[test]
    fn filters_entries_that_cannot_run_here() {
        assert!(runs_here(&[]));
        assert!(runs_here(&[HOST_TARGET.to_string()]));
        assert!(!runs_here(&["linux-aarch64".to_string()]));
    }
}
