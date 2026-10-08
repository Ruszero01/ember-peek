//! Format-neutral document resources.
//!
//! A preview plugin discovers references in Markdown, HTML, a 3D scene, or any other
//! format. This module only resolves the reference beside the selected file or retrieves a
//! public HTTP(S) URL, then returns bytes with a media type. Keeping this transport generic
//! lets plugins own rendering without teaching the host every document format.
use ember_runtime::{manifest::Permission, Runtime};
use std::{path::Path, sync::Arc, time::Duration};

const MAX_RESOURCE: usize = 64 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

pub struct Resource {
    pub kind: String,
    pub bytes: Vec<u8>,
}

pub async fn load(host: &Arc<Runtime>, session: &str, reference: &str) -> Result<Resource, String> {
    host.authorize(session, Permission::ReadResources).await?;
    let reference = reference.trim();
    if reference.len() > 4096 || reference.contains('\0') {
        return Err("Invalid resource reference".into());
    }
    if reqwest::Url::parse(reference)
        .ok()
        .is_some_and(|url| matches!(url.scheme(), "http" | "https"))
    {
        let loaded = crate::public_http::download(
            reference,
            crate::public_http::Options {
                accept: "image/*,font/*,audio/*,video/*,application/octet-stream;q=0.8,*/*;q=0.5",
                accept_language: None,
                max_bytes: MAX_RESOURCE,
                timeout: TIMEOUT,
                redirects: 5,
                allow_private: false,
            },
        )
        .await?;
        let kind = if loaded.content_type.is_empty() {
            crate::mime(Path::new(loaded.url.path())).to_owned()
        } else {
            loaded.content_type
        };
        return Ok(Resource {
            kind,
            bytes: loaded.bytes,
        });
    }
    let path = host.resource_file(session, reference).await?;
    let size = tokio::fs::metadata(&path)
        .await
        .map_err(|e| e.to_string())?
        .len();
    if size > MAX_RESOURCE as u64 {
        return Err("Resource exceeds 64 MiB".into());
    }
    Ok(Resource {
        kind: crate::mime(&path).to_owned(),
        bytes: tokio::fs::read(path).await.map_err(|e| e.to_string())?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_uppercase_resource_extensions_have_media_types() {
        assert_eq!(crate::mime(Path::new("Cover.JPG")), "image/jpeg");
        assert_eq!(crate::mime(Path::new("sound.M4A")), "audio/mp4");
    }
}
