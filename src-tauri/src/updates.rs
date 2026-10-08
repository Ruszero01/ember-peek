use crate::public_http::{download, Options};
use semver::Version;
use serde::Serialize;
use serde_json::Value;
use std::{future::Future, time::Duration};

const GITHUB: &str = "https://api.github.com/repos/Ruszero01/ember-peek/releases/latest";
const CHANNEL: &str = "channels/stable/desktop/windows-x86_64/latest.json";

#[derive(Debug, Serialize)]
pub struct Update {
    version: String,
    available: bool,
    url: String,
    source: &'static str,
}

fn oss_base() -> Result<String, String> {
    let config: Value =
        serde_json::from_str(include_str!("../plugin-sources.json")).map_err(|e| e.to_string())?;
    let catalog = config["sources"][0]["catalog"]
        .as_str()
        .ok_or("Missing official source")?;
    let (base, _) = catalog
        .split_once("/channels/")
        .ok_or("Invalid official source")?;
    Ok(base.to_owned())
}

fn parse(
    value: Value,
    source: &'static str,
    base: &str,
    current: &Version,
) -> Result<Update, String> {
    if value["draft"] == true || value["prerelease"] == true {
        return Err("Not a stable release".into());
    }
    let version = value[if source == "OSS" {
        "version"
    } else {
        "tag_name"
    }]
    .as_str()
    .ok_or("Missing version")?
    .trim_start_matches('v');
    let latest = Version::parse(version).map_err(|_| "Invalid release version")?;
    if !latest.pre.is_empty() {
        return Err("Not a stable release".into());
    }
    let url = if source == "OSS" {
        if value["api"] != 1 {
            return Err("Unsupported update manifest".into());
        }
        value["url"].as_str().ok_or("Missing installer URL")?
    } else {
        value["assets"]
            .as_array()
            .and_then(|assets| {
                assets.iter().find(|asset| {
                    asset["name"]
                        .as_str()
                        .is_some_and(|name| name.ends_with("-setup.exe"))
                })
            })
            .and_then(|asset| asset["browser_download_url"].as_str())
            .ok_or("Missing Windows installer")?
    };
    let prefix = if source == "OSS" {
        format!("{base}/desktop/windows-x86_64/")
    } else {
        "https://github.com/Ruszero01/ember-peek/releases/download/".to_owned()
    };
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid installer URL")?;
    if !parsed.as_str().starts_with(&prefix)
        || parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !parsed.path().ends_with("-setup.exe")
    {
        return Err("Installer URL is not from the official source".into());
    }
    Ok(Update {
        version: latest.to_string(),
        available: latest > *current,
        url: url.into(),
        source,
    })
}

#[tauri::command]
pub fn open_update(url: String) -> Result<(), String> {
    let base = oss_base()?;
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid installer URL")?;
    if parsed.scheme() != "https"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !parsed.path().ends_with("-setup.exe")
        || !(parsed
            .as_str()
            .starts_with(&format!("{base}/desktop/windows-x86_64/"))
            || parsed
                .as_str()
                .starts_with("https://github.com/Ruszero01/ember-peek/releases/download/"))
    {
        return Err("Installer URL is not from the official source".into());
    }
    crate::desktop::open_external_url(parsed.as_str())
}

async fn check_with<F, Fut>(current: &str, base: &str, fetch: F) -> Result<Update, String>
where
    F: Fn(String) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let current = Version::parse(current).map_err(|e| e.to_string())?;
    if let Ok(value) = fetch(format!("{base}/{CHANNEL}")).await {
        if let Ok(update) = parse(value, "OSS", base, &current) {
            return Ok(update);
        }
    }
    parse(fetch(GITHUB.into()).await?, "GitHub", base, &current)
}

#[tauri::command]
pub async fn check_update() -> Result<Update, String> {
    check_with(env!("CARGO_PKG_VERSION"), &oss_base()?, |url| async move {
        let result = download(
            &url,
            Options {
                accept: "application/json",
                accept_language: None,
                max_bytes: 256 * 1024,
                timeout: Duration::from_secs(12),
                redirects: 2,
                allow_private: false,
            },
        )
        .await?;
        serde_json::from_slice(&result.bytes).map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const BASE: &str = "https://example.com/ember-peek";
    fn manifest(version: &str) -> Value {
        json!({"api":1,"version":version,"url":format!("{BASE}/desktop/windows-x86_64/{version}/Ember-Peek-setup.exe")})
    }
    #[test]
    fn versions_are_compared_semantically_and_prereleases_are_excluded() {
        let current = Version::parse("0.1.9").unwrap();
        assert!(
            parse(manifest("0.1.10"), "OSS", BASE, &current)
                .unwrap()
                .available
        );
        assert!(
            !parse(manifest("0.1.8"), "OSS", BASE, &current)
                .unwrap()
                .available
        );
        assert!(parse(manifest("0.2.0-beta.1"), "OSS", BASE, &current).is_err());
        let mut invalid = manifest("0.2.0");
        invalid["url"] = json!("https://example.com.evil/installer-setup.exe");
        assert!(parse(invalid, "OSS", BASE, &current).is_err());
    }
    #[tokio::test]
    async fn oss_success_does_not_request_github() {
        let update = check_with("0.1.0", BASE, |url| async move {
            assert_ne!(url, GITHUB);
            Ok(manifest("0.1.1"))
        })
        .await
        .unwrap();
        assert_eq!(update.source, "OSS");
    }
    #[tokio::test]
    async fn invalid_or_unavailable_oss_falls_back_to_stable_github() {
        for invalid in [true, false] {
            let update = check_with("0.1.0", BASE, |url| async move {
                if url != GITHUB { return if invalid { Ok(json!({"api":99})) } else { Err("offline".into()) }; }
                Ok(json!({"tag_name":"v0.1.1","draft":false,"prerelease":false,"assets":[{"name":"Ember-Peek-setup.exe","browser_download_url":"https://github.com/Ruszero01/ember-peek/releases/download/v0.1.1/Ember-Peek-setup.exe"}]}))
            }).await.unwrap();
            assert_eq!(update.source, "GitHub");
        }
    }
}
