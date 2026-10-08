use serde::Serialize;
use std::{collections::BTreeMap, path::Path, sync::Arc};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct LocalPackages(Mutex<BTreeMap<String, tempfile::TempDir>>);
#[derive(Serialize)]
pub struct Prepared {
    pub token: String,
    #[serde(flatten)]
    pub manifest: ember_runtime::manifest::Manifest,
}
impl LocalPackages {
    pub async fn prepare(&self, path: String) -> Result<Prepared, String> {
        let (temporary, manifest) = tokio::task::spawn_blocking(move || {
            let temporary = tempfile::tempdir().map_err(|e| e.to_string())?;
            let package = ember_runtime::sharing::prepare(
                Path::new(&path),
                &temporary.path().join("package"),
            )?;
            if !package.manifest.targets.is_empty()
                && !package
                    .manifest
                    .targets
                    .iter()
                    .any(|t| t == ember_runtime::manifest::HOST_TARGET)
            {
                return Err("Plugin target does not match this host".to_string());
            }
            Ok((temporary, package.manifest))
        })
        .await
        .map_err(|e| e.to_string())??;
        let token = temporary
            .path()
            .file_name()
            .ok_or("Invalid preparation directory")?
            .to_string_lossy()
            .into_owned();
        let mut prepared = self.0.lock().await;
        while prepared.len() >= 4 {
            prepared.pop_first();
        }
        prepared.insert(token.clone(), temporary);
        Ok(Prepared { token, manifest })
    }
    pub async fn install(
        &self,
        runtime: &Arc<ember_runtime::Runtime>,
        token: &str,
    ) -> Result<(), String> {
        let mut prepared = self.0.lock().await;
        let directory = prepared
            .get(token)
            .ok_or("Import expired; select the package again")?
            .path()
            .join("package");
        runtime
            .install_from(&directory, Some("local".into()))
            .await?;
        prepared.remove(token);
        Ok(())
    }
}
