use crate::{manifest::Package, Runtime};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Component, PathBuf},
};

#[derive(Clone)]
pub struct Market {
    pub root: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    api: u32,
    entries: Vec<Listing>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listing {
    id: String,
    directory: String,
    summary: String,
    publisher: String,
}

/// Tagged source metadata lets future download providers expose their origin.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    Local { location: String },
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

impl Market {
    fn packages(&self) -> Result<Vec<(Listing, Package)>, String> {
        let root = self
            .root
            .canonicalize()
            .map_err(|e| format!("插件市场尚未构建：{e}"))?;
        let bytes = std::fs::read(root.join("catalog.json"))
            .map_err(|e| format!("读取插件市场失败：{e}"))?;
        if bytes.len() > 1024 * 1024 {
            return Err("Market catalog exceeds 1 MiB".into());
        }
        let catalog: Catalog = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if catalog.api != 1 || catalog.entries.len() > 256 {
            return Err("Invalid market catalog".into());
        }
        let mut ids = HashSet::new();
        catalog
            .entries
            .into_iter()
            .map(|listing| {
                let relative = std::path::Path::new(&listing.directory);
                if relative
                    .components()
                    .any(|c| !matches!(c, Component::Normal(_)))
                    || listing.directory.contains(':')
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
                if package.manifest.id != listing.id || !ids.insert(listing.id.clone()) {
                    return Err("Market package id mismatch or duplicate".into());
                }
                Ok((listing, package))
            })
            .collect()
    }

    pub async fn list(&self, runtime: &Runtime) -> Result<Vec<Entry>, String> {
        let snapshot = runtime.snapshot().await;
        let market = self.clone();
        let packages = tokio::task::spawn_blocking(move || market.packages())
            .await
            .map_err(|e| e.to_string())??;
        Ok(packages
            .into_iter()
            .map(|(listing, package)| {
                let manifest = package.manifest;
                let installed = snapshot
                    .plugins
                    .iter()
                    .find(|p| p.manifest.id == manifest.id);
                let update_available = installed.is_some_and(|p| {
                    p.manifest.version != manifest.version
                        || p.manifest.build_id != manifest.build_id
                });
                Entry {
                    source: Source::Local { location: package.directory.to_string_lossy().into_owned() },
                    id: manifest.id,
                    name: manifest.name,
                    version: manifest.version,
                    extensions: manifest.extensions,
                    icon: manifest.icon,
                    summary: listing.summary,
                    publisher: listing.publisher,
                    installed_version: installed.map(|p| p.manifest.version.clone()),
                    update_available,
                }
            })
            .collect())
    }

    pub async fn prepare(&self, id: &str) -> Result<PathBuf, String> {
        let market = self.clone();
        let packages = tokio::task::spawn_blocking(move || market.packages())
            .await
            .map_err(|e| e.to_string())??;
        let (_, package) = packages
            .into_iter()
            .find(|(listing, _)| listing.id == id)
            .ok_or("插件不在市场目录中")?;
        Ok(package.directory)
    }

    pub async fn install(&self, runtime: &Runtime, id: &str) -> Result<(), String> {
        runtime.install(&self.prepare(id).await?).await
    }

    pub async fn sync_development(&self, runtime: &Runtime) -> Result<(), String> {
        let snapshot = runtime.snapshot().await;
        let market = self.clone();
        let packages = tokio::task::spawn_blocking(move || market.packages())
            .await
            .map_err(|e| e.to_string())??;
        for (_, package) in packages {
            if snapshot.plugins.iter().any(|p| {
                p.manifest.id == package.manifest.id
                    && !p.manifest.build_id.is_empty()
                    && p.manifest.build_id != package.manifest.build_id
            }) {
                runtime.update_development(&package.directory).await?;
            }
        }
        Ok(())
    }
}
