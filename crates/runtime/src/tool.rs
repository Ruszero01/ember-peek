//! Optional, separately versioned application tool descriptor inside a plugin package.
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Tool {
    pub api: u32,
    pub service: String,
}

pub fn load(directory: &Path) -> Result<Option<Tool>, String> {
    let path = directory.join("ui/tool.json");
    if !path.exists() {
        return Ok(None);
    }
    let path = crate::manifest::contained(directory, "ui/tool.json")?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 4096 {
        return Err("Tool descriptor exceeds 4 KiB".into());
    }
    let tool: Tool = serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if tool.api != 1 || tool.service != "workshop" {
        return Err("Unsupported tool protocol or service".into());
    }
    Ok(Some(tool))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn package(root: &Path) {
        std::fs::create_dir_all(root.join("ui")).unwrap();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("ui/index.html"), "<!doctype html>").unwrap();
        std::fs::write(
            root.join("ui/tool.json"),
            r#"{"api":1,"service":"workshop"}"#,
        )
        .unwrap();
        std::fs::write(root.join("bin/tool.exe"), "not executed").unwrap();
        std::fs::write(root.join("plugin.json"), r#"{"api":1,"id":"example.tool","name":"Tool","version":"1.0.0","entry":"ui/index.html","executable":"bin/tool.exe","capabilities":["controls"]}"#).unwrap();
    }
    #[tokio::test]
    async fn tool_never_matches_files_and_local_identity_does_not_grant_service_access() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        package(&source);
        let runtime = crate::Runtime::new(temp.path().join("installed")).unwrap();
        runtime
            .install_from(&source, Some("local".into()))
            .await
            .unwrap();
        assert!(runtime.tool_package("example.tool").await.is_err());
        let file = temp.path().join("file.txt");
        std::fs::write(&file, "sample").unwrap();
        assert!(runtime.open(file).await.is_err());
        assert!(runtime.snapshot().await.sessions.is_empty());
    }
    #[tokio::test]
    async fn local_import_cannot_replace_an_official_tool() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        package(&source);
        let runtime = crate::Runtime::new(temp.path().join("installed")).unwrap();
        runtime
            .install_from(&source, Some("official".into()))
            .await
            .unwrap();
        assert!(runtime.tool_package("example.tool").await.is_ok());
        assert!(runtime
            .install_from(&source, Some("local".into()))
            .await
            .is_err());
        assert_eq!(runtime.snapshot().await.plugins[0].origin, "official");
        assert!(runtime.tool_package("example.tool").await.is_ok());
    }
    #[test]
    fn tool_descriptor_is_strict_and_versioned_independently() {
        let temp = tempfile::tempdir().unwrap();
        package(temp.path());
        assert!(load(temp.path()).unwrap().is_some());
        for invalid in [
            r#"{"api":2,"service":"workshop"}"#,
            r#"{"api":1,"service":"shell"}"#,
            r#"{"api":1,"service":"workshop","privileged":true}"#,
        ] {
            std::fs::write(temp.path().join("ui/tool.json"), invalid).unwrap();
            assert!(load(temp.path()).is_err());
        }
    }
    #[tokio::test]
    async fn legacy_provenance_recovery_requires_identical_verified_content() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        package(&source);
        let runtime = crate::Runtime::new(temp.path().join("installed")).unwrap();
        runtime.install(&source).await.unwrap();
        assert_eq!(runtime.snapshot().await.plugins[0].origin, "unknown");
        std::fs::write(source.join("ui/index.html"), "different content").unwrap();
        runtime
            .recover_origin(&source, "trusted-catalog", "official")
            .await
            .unwrap();
        assert_eq!(runtime.snapshot().await.plugins[0].origin, "unknown");
        std::fs::write(source.join("ui/index.html"), "<!doctype html>").unwrap();
        runtime
            .recover_origin(&source, "trusted-catalog", "official")
            .await
            .unwrap();
        assert_eq!(runtime.snapshot().await.plugins[0].origin, "official");
        let reopened = crate::Runtime::new(temp.path().join("installed")).unwrap();
        reopened.scan().await.unwrap();
        assert_eq!(
            reopened.snapshot().await.plugins[0].source.as_deref(),
            Some("trusted-catalog")
        );
    }
}
