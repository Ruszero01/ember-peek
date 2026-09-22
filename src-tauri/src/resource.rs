//! Format-neutral document resources.
//!
//! A preview plugin discovers references in Markdown, HTML, a 3D scene, or any other
//! format. This module only resolves the reference beside the selected file or retrieves a
//! public HTTP(S) URL, then returns bytes with a media type. Keeping this transport generic
//! lets plugins own rendering without teaching the host every document format.
use ember_runtime::{manifest::Permission, Runtime};
use std::{
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    path::Path,
    sync::Arc,
    time::Duration,
};

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
        return remote(reference).await;
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

async fn remote(reference: &str) -> Result<Resource, String> {
    let mut url = reqwest::Url::parse(reference).map_err(|_| "Invalid resource URL")?;
    for _ in 0..=5 {
        if !matches!(url.scheme(), "http" | "https") {
            return Err("Resource URL must use HTTP(S)".into());
        }
        let host = url.host_str().ok_or("Resource URL has no host")?.to_owned();
        let port = url
            .port_or_known_default()
            .ok_or("Resource URL has no port")?;
        let lookup = host.clone();
        let addresses = tauri::async_runtime::spawn_blocking(move || {
            (lookup.as_str(), port)
                .to_socket_addrs()
                .map(|values| values.collect::<Vec<_>>())
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let address = addresses
            .into_iter()
            .find(|address| public_ip(address.ip()))
            .ok_or("Resource URL does not resolve to a public address")?;
        let client = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            // Pin the request to the address that was checked above. TLS and Host still use
            // the URL's hostname, while a DNS change cannot redirect the fetch into a LAN.
            .resolve(&host, SocketAddr::new(address.ip(), port))
            .user_agent(concat!("ember-peek/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(url.clone())
            .header(
                "accept",
                "image/*,font/*,audio/*,video/*,application/octet-stream;q=0.8,*/*;q=0.5",
            )
            .send()
            .await
            .map_err(|e| format!("Failed to load resource: {e}"))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Resource redirect has no location")?;
            url = url
                .join(location)
                .map_err(|_| "Invalid resource redirect")?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("Resource returned {}", response.status()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESOURCE as u64)
        {
            return Err("Resource exceeds 64 MiB".into());
        }
        let kind = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.len() <= 200)
            .map(str::to_owned)
            .unwrap_or_else(|| crate::mime(Path::new(url.path())).to_owned());
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Resource download was interrupted: {e}"))?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESOURCE {
                return Err("Resource exceeds 64 MiB".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(Resource { kind, bytes });
    }
    Err("Resource redirected too many times".into())
}

fn public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            !(address.is_private()
                || address.is_loopback()
                || address.is_link_local()
                || address.is_broadcast()
                || address.is_documentation()
                || address.is_unspecified()
                || address.is_multicast()
                || address.octets()[0] == 0
                || address.octets()[0] >= 240)
        }
        IpAddr::V6(address) => {
            if let Some(mapped) = address.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(mapped));
            }
            !(address.is_loopback()
                || address.is_unspecified()
                || address.is_multicast()
                || (address.segments()[0] & 0xfe00) == 0xfc00
                || (address.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn related_network_resources_cannot_turn_into_lan_requests() {
        for address in [
            "127.0.0.1",
            "10.0.0.8",
            "192.168.1.2",
            "169.254.1.1",
            "::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!public_ip(address.parse().unwrap()), "{address}");
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
        assert!(public_ip("2606:4700:4700::1111".parse().unwrap()));
        assert_eq!(crate::mime(Path::new("Cover.JPG")), "image/jpeg");
        assert_eq!(crate::mime(Path::new("sound.M4A")), "audio/mp4");
    }
}
