//! Bounded HTTP(S) downloads for URLs supplied by documents or users.
//!
//! Callers decide what the bytes mean. This module owns the shared transport boundary:
//! scheme validation, public-address checks, DNS pinning, redirects, deadlines and size caps.
use std::{
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    time::Duration,
};

#[derive(Debug)]
pub struct Options<'a> {
    pub accept: &'a str,
    pub accept_language: Option<&'a str>,
    pub max_bytes: usize,
    pub timeout: Duration,
    pub redirects: usize,
    /// Tests and explicitly configured local services may opt in. Document-controlled URLs
    /// must always leave this false.
    pub allow_private: bool,
}

#[derive(Debug)]
pub struct Download {
    pub url: reqwest::Url,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

pub async fn download(reference: &str, options: Options<'_>) -> Result<Download, String> {
    if options.max_bytes == 0 {
        return Err("Download limit must be greater than zero".into());
    }
    let mut url = reqwest::Url::parse(reference).map_err(|_| "Invalid URL".to_owned())?;
    let deadline = tokio::time::Instant::now() + options.timeout;
    for redirect in 0..=options.redirects {
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
            return Err("Only public HTTP(S) URLs are allowed".into());
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("Request timed out".into());
        }
        let host = url.host_str().unwrap_or_default().to_owned();
        let port = url.port_or_known_default().ok_or("URL has no port")?;
        let mut builder = reqwest::Client::builder()
            .timeout(remaining)
            .connect_timeout(remaining.min(Duration::from_secs(10)))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("ember-peek/", env!("CARGO_PKG_VERSION")));
        if !options.allow_private {
            if !public_url(&url) {
                return Err("Only public HTTP(S) URLs are allowed".into());
            }
            let lookup = host.clone();
            let addresses = tokio::task::spawn_blocking(move || {
                (lookup.as_str(), port)
                    .to_socket_addrs()
                    .map(|values| values.collect::<Vec<_>>())
            })
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| format!("DNS lookup failed: {error}"))?;
            let address = addresses
                .into_iter()
                .find(|address| public_ip(address.ip()))
                .ok_or("URL does not resolve to a public address")?;
            // TLS and Host still use the URL hostname. Pinning only prevents a DNS change
            // between validation and connection from redirecting the request into a LAN.
            builder = builder.resolve(&host, SocketAddr::new(address.ip(), port));
        }
        let client = builder.build().map_err(|error| error.to_string())?;
        let mut request = client.get(url.clone()).header("accept", options.accept);
        if let Some(language) = options.accept_language {
            request = request.header("accept-language", language);
        }
        let mut response = request
            .send()
            .await
            .map_err(|error| request_error(&error))?;
        if response.status().is_redirection() {
            if redirect == options.redirects {
                return Err("Too many redirects".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Redirect has no valid location")?;
            url = url.join(location).map_err(|_| "Invalid redirect URL")?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > options.max_bytes as u64)
        {
            return Err(format!("Response exceeds {} bytes", options.max_bytes));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.len() <= 200)
            .unwrap_or_default()
            .to_owned();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Download was interrupted: {error}"))?
        {
            if bytes.len().saturating_add(chunk.len()) > options.max_bytes {
                return Err(format!("Response exceeds {} bytes", options.max_bytes));
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(Download {
            url,
            content_type,
            bytes,
        });
    }
    Err("Too many redirects".into())
}

fn request_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "Request timed out".into()
    } else if error.is_connect() {
        "Could not connect to the destination".into()
    } else {
        format!("Request failed: {error}")
    }
}

pub fn public_url(url: &reqwest::Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_matches(['[', ']']).to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return false;
    }
    if let Ok(address) = host.parse::<IpAddr>() {
        return public_ip(address);
    }
    // A single label is a machine on some network, never a public site.
    host.contains('.') && !host.ends_with('.')
}

pub fn public_ip(address: IpAddr) -> bool {
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
    use std::io::{Read, Write};

    #[test]
    fn document_controlled_urls_cannot_name_a_local_network() {
        for url in [
            "http://localhost/x",
            "http://host.local/x",
            "http://intranet/x",
            "http://127.0.0.1/x",
            "http://[::ffff:127.0.0.1]/x",
            "file:///C:/Windows/win.ini",
        ] {
            assert!(!public_url(&reqwest::Url::parse(url).unwrap()), "{url}");
        }
        assert!(public_url(
            &reqwest::Url::parse("https://example.com/image.png").unwrap()
        ));
        assert!(public_ip("1.1.1.1".parse().unwrap()));
        assert!(public_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[tokio::test]
    async fn downloads_follow_bounded_redirects_and_stop_at_the_byte_limit() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 1024];
                let count = stream.read(&mut request).unwrap();
                let request = String::from_utf8_lossy(&request[..count]);
                let response = if request.starts_with("GET /start ") {
                    "HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_owned()
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello".to_owned()
                };
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        let downloaded = download(
            &format!("{base}/start"),
            Options {
                accept: "text/plain",
                accept_language: None,
                max_bytes: 5,
                timeout: Duration::from_secs(5),
                redirects: 1,
                allow_private: true,
            },
        )
        .await
        .unwrap();
        assert_eq!(downloaded.bytes, b"hello");
        assert_eq!(downloaded.url.path(), "/final");
        server.join().unwrap();

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/large", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 1024];
            let _ = stream.read(&mut request);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\n123456",
                )
                .unwrap();
        });
        let error = download(
            &url,
            Options {
                accept: "*/*",
                accept_language: None,
                max_bytes: 5,
                timeout: Duration::from_secs(5),
                redirects: 0,
                allow_private: true,
            },
        )
        .await
        .expect_err("content length over the cap must be refused");
        assert!(error.contains("exceeds"), "{error}");
        server.join().unwrap();
    }
}
