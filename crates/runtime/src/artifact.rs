//! Fetching, verifying and unpacking a published plugin package.
//!
//! A package travels as one zip so a catalog can name exactly one artifact per
//! build. Everything here rejects rather than guesses: a package that is not the
//! shape the build script writes is refused before anything reaches the disk.

use crate::i18n::{msg, text};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::Duration,
};

/// Ceiling for one artifact. Packages are 0.7-2.7 MiB today; the limit exists so a
/// hostile mirror cannot exhaust memory by streaming forever.
pub const MAX_ARTIFACT_BYTES: u64 = 64 * 1024 * 1024;
/// Ceiling for unpacked content, checked against the sizes the archive declares and
/// again against the bytes actually written.
pub const MAX_UNPACKED_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 4096;
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);

/// Caps for one unpacking pass, injectable so the limits themselves can be tested
/// without building a 256 MiB archive.
#[derive(Clone, Copy)]
struct Limits {
    unpacked: u64,
    entries: usize,
}

const LIMITS: Limits = Limits {
    unpacked: MAX_UNPACKED_BYTES,
    entries: MAX_ENTRIES,
};

pub fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().fold(String::with_capacity(64), |mut text, byte| {
        let _ = write!(text, "{byte:02x}");
        text
    })
}

/// Only `http` and `https` are network locations. Anything else is a filesystem
/// location, which is what an offline or enterprise mirror is configured with.
pub fn is_http(location: &str) -> bool {
    location.starts_with("http://") || location.starts_with("https://")
}

/// Read one artifact from an HTTP mirror, a `file://` URL, or a plain path.
pub async fn fetch(client: &reqwest::Client, location: &str) -> Result<Vec<u8>, String> {
    fetch_with_limit(client, location, MAX_ARTIFACT_BYTES).await
}

async fn fetch_with_limit(
    client: &reqwest::Client,
    location: &str,
    limit: u64,
) -> Result<Vec<u8>, String> {
    if is_http(location) {
        fetch_http(client, location, limit).await
    } else {
        fetch_file(location, limit)
    }
}

async fn fetch_http(client: &reqwest::Client, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let mut response = client
        .get(url)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|error| msg!(text().download_error, error = error))?;
    if !response.status().is_success() {
        return Err(msg!(text().download_http, status = response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        return Err(over_limit(limit));
    }
    // Streamed rather than buffered whole: a declared length is a claim, not a fact.
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| msg!(text().download_interrupted, error = error))?
    {
        if body.len() as u64 + chunk.len() as u64 > limit {
            return Err(over_limit(limit));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn fetch_file(location: &str, limit: u64) -> Result<Vec<u8>, String> {
    let path = local_path(location);
    let file = std::fs::File::open(&path)
        .map_err(|error| msg!(text().package_read_failed, path = path.display(), error = error))?;
    let mut body = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut body)
        .map_err(|error| msg!(text().package_read_failed, path = path.display(), error = error))?;
    if body.len() as u64 > limit {
        return Err(over_limit(limit));
    }
    Ok(body)
}

/// `file:///C:/mirror/a.zip` and `C:\mirror\a.zip` name the same file.
fn local_path(location: &str) -> PathBuf {
    let text = location.strip_prefix("file://").unwrap_or(location);
    // A file URL keeps a slash in front of the drive letter.
    match text.strip_prefix('/') {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => PathBuf::from(text),
    }
}

fn over_limit(limit: u64) -> String {
    msg!(text().package_too_large, limit = limit / 1024 / 1024)
}

/// Unpack a verified artifact into `target`, which is created here. A failure never
/// leaves a half-written package behind, because a partial tree would otherwise look
/// installable.
pub fn extract(bytes: &[u8], target: &Path) -> Result<(), String> {
    match unpack(bytes, target, LIMITS) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = std::fs::remove_dir_all(target);
            Err(error)
        }
    }
}

fn unpack(bytes: &[u8], target: &Path, limits: Limits) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|error| msg!(text().package_not_zip, error = error))?;
    if archive.is_empty() {
        return Err(msg!(text().package_empty));
    }
    if archive.len() > limits.entries {
        return Err(msg!(text().package_too_many_entries, limit = limits.entries));
    }

    // Names, types and declared sizes come first, so a package that would write too
    // much is refused before a single byte lands on disk.
    let mut plan = Vec::with_capacity(archive.len());
    let mut names = HashSet::new();
    let mut declared = 0u64;
    for index in 0..archive.len() {
        let (name, directory, size) = {
            let entry = archive
                .by_index(index)
                .map_err(|error| msg!(text().entry_read_failed, error = error))?;
            if entry.encrypted() {
                return Err(msg!(text().entry_encrypted, name = entry.name()));
            }
            let name = entry_name(entry.name())?;
            check_entry_type(entry.unix_mode(), &name)?;
            (name, entry.is_dir(), entry.size())
        };
        if !names.insert(name.clone()) {
            // Unreachable with the reader in use, which collapses duplicate names while
            // indexing; kept because extracting the same path twice is the shape of
            // archive this guard exists for.
            return Err(msg!(text().entry_duplicate, name = name));
        }
        declared = declared.saturating_add(size);
        if declared > limits.unpacked {
            return Err(over_limit(limits.unpacked));
        }
        plan.push((name, directory));
    }
    if plan.iter().all(|(_, directory)| *directory) {
        return Err(msg!(text().package_no_files));
    }

    std::fs::create_dir_all(target).map_err(|error| error.to_string())?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut written = 0u64;
    for (index, (name, directory)) in plan.iter().enumerate() {
        let destination = target.join(name);
        if *directory {
            std::fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut file = std::fs::File::create(&destination)
            .map_err(|error| msg!(text().write_failed, name = name, error = error))?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| msg!(text().entry_read_failed, error = error))?;
        loop {
            let read = entry
                .read(&mut buffer)
                .map_err(|error| msg!(text().entry_extract_failed, name = name, error = error))?;
            if read == 0 {
                break;
            }
            // A declared size is another claim, so the limit is enforced against the
            // bytes that actually come out of the archive.
            written += read as u64;
            if written > limits.unpacked {
                return Err(over_limit(limits.unpacked));
            }
            file.write_all(&buffer[..read])
                .map_err(|error| msg!(text().entry_write_failed, name = name, error = error))?;
        }
    }
    if !target.join("plugin.json").is_file() {
        return Err(msg!(text().package_no_manifest));
    }
    Ok(())
}

/// Archive entry name to a path that stays inside the package. A name that means two
/// different paths on two platforms is not something to translate: backslashes, drive
/// letters, absolute paths and traversal are all refused rather than normalized.
fn entry_name(name: &str) -> Result<String, String> {
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    if trimmed.is_empty()
        || trimmed.len() > 512
        || trimmed.contains(['\\', ':', '\0'])
        || Path::new(trimmed).is_absolute()
        || Path::new(trimmed)
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(msg!(text().entry_path_escapes, name = name));
    }
    Ok(trimmed.to_owned())
}

/// The type bits decide whether an entry may be written at all. A symlink inside a
/// package would let one entry redirect a later write outside the package.
fn check_entry_type(mode: Option<u32>, name: &str) -> Result<(), String> {
    match mode.map(|mode| mode & 0o170000) {
        Some(0o120000) => Err(msg!(text().entry_symlink, name = name)),
        // 0 means the archive carries no unix mode at all (a non-unix writer).
        None | Some(0) | Some(0o100000) | Some(0o040000) => Ok(()),
        Some(_) => Err(msg!(text().entry_not_file, name = name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zip_of(entries: &[(&str, &[u8], u32)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, data, mode) in entries {
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(*mode);
            writer.start_file(*name, options).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn manifest() -> &'static str {
        r#"{"api":1,"id":"test.one","name":"One","version":"1.0.0","extensions":["one"],
            "executable":"bin/one.exe","entry":"ui/index.html","capabilities":["view"]}"#
    }

    fn package_zip() -> Vec<u8> {
        zip_of(&[
            ("plugin.json", manifest().as_bytes(), 0o644),
            ("bin/one.exe", b"stub", 0o644),
            ("ui/index.html", b"<html></html>", 0o644),
        ])
    }

    #[test]
    fn hashes_are_hex_sha256() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn unpacks_a_package() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("package");
        extract(&package_zip(), &target).unwrap();
        assert_eq!(
            std::fs::read_to_string(target.join("ui/index.html")).unwrap(),
            "<html></html>"
        );
    }

    /// The release script packs packages with `scripts/zip.mjs`, so the one fixture it
    /// produced is checked in: this is where the writer and this extractor are held to
    /// the same format. `tests/zip.test.mjs` keeps the fixture matching the writer.
    #[test]
    fn unpacks_the_zip_the_build_script_writes() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/package.zip");
        let bytes = std::fs::read(&fixture).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("package");
        extract(&bytes, &target).unwrap();
        // Unpacking is only half of it: the result has to be a package the host accepts.
        let package = crate::manifest::Package::load(&target).unwrap();
        assert_eq!(package.manifest.id, "fixture.one");
        assert_eq!(package.manifest.extensions, ["one"]);
        assert_eq!(package.manifest.settings.len(), 1);
        assert_eq!(
            std::fs::read_to_string(target.join("ui/style.css")).unwrap(),
            "body {\n  margin: 0;\n  padding: 16px;\n}\n"
        );
    }

    #[test]
    fn refuses_names_that_leave_the_package() {
        for name in ["../escape.txt", "/absolute.txt", "a/../../escape.txt", "..\\escape.txt", "C:/escape.txt"] {
            assert!(entry_name(name).is_err(), "{name} was accepted");
        }
        for name in ["plugin.json", "ui/index.html", "sdk-search.js", "ui/"] {
            assert!(entry_name(name).is_ok(), "{name} was rejected");
        }
        // The name check is what keeps writes inside the package, so prove it end to
        // end as well: a rejected entry must not leave a tree behind.
        let bytes = zip_of(&[
            ("plugin.json", manifest().as_bytes(), 0o644),
            ("bin/one.exe", b"stub", 0o644),
            ("ui/index.html", b"x", 0o644),
            ("../escape.txt", b"escape", 0o644),
        ]);
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("package");
        assert!(extract(&bytes, &target).is_err());
        assert!(!target.exists());
        assert!(!temp.path().join("escape.txt").exists());
    }

    #[test]
    fn refuses_entries_that_are_not_regular_files() {
        assert!(check_entry_type(Some(0o120777), "link").is_err());
        assert!(check_entry_type(Some(0o140777), "socket").is_err());
        assert!(check_entry_type(Some(0o060644), "device").is_err());
        assert!(check_entry_type(Some(0o100644), "file").is_ok());
        assert!(check_entry_type(Some(0o040755), "directory").is_ok());
        assert!(check_entry_type(None, "mode-less").is_ok());
    }

    /// A zip may name two entries the same thing, which is how some archives smuggle a
    /// second version of a file past a reader that trusts the first. This reader
    /// collapses them while indexing, so what reaches the extractor is one entry: the
    /// observable result is a single file inside the package, never a second write. The
    /// check in `unpack` is the guard for a reader that stops collapsing.
    #[test]
    fn collapses_duplicate_entry_names() {
        let bytes = zip_of(&[
            ("plugin.json", manifest().as_bytes(), 0o644),
            ("bin/one.exe", b"stub", 0o644),
            ("bin/two.exe", b"stub", 0o644),
        ]);
        // The writer refuses to produce a duplicate, so one is made by renaming an entry
        // of a valid archive. The name sits in both the local header and the central
        // directory, and both spellings are the same length, so nothing else moves.
        let bytes = rename_entry(bytes, "bin/two.exe", "bin/one.exe");
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("package");
        extract(&bytes, &target).unwrap();
        assert_eq!(files_in(&target), ["bin/one.exe", "plugin.json"]);
    }

    fn files_in(root: &Path) -> Vec<String> {
        fn walk(root: &Path, directory: &Path, names: &mut Vec<String>) {
            for entry in std::fs::read_dir(directory).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    walk(root, &path, names);
                } else {
                    names.push(
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .replace('\\', "/"),
                    );
                }
            }
        }
        let mut names = Vec::new();
        walk(root, root, &mut names);
        names.sort();
        names
    }

    fn rename_entry(mut bytes: Vec<u8>, from: &str, to: &str) -> Vec<u8> {
        let (from, to) = (from.as_bytes(), to.as_bytes());
        assert_eq!(from.len(), to.len(), "renaming must not move any offset");
        let mut patched = 0;
        for index in 0..=bytes.len() - from.len() {
            if &bytes[index..index + from.len()] == from {
                bytes[index..index + to.len()].copy_from_slice(to);
                patched += 1;
            }
        }
        // Two headers name the entry, so anything else means the archive was not the
        // one this test thinks it built.
        assert_eq!(patched, 2, "the name should appear in both headers");
        bytes
    }

    #[test]
    fn refuses_a_package_without_a_manifest() {
        let bytes = zip_of(&[("ui/index.html", b"x", 0o644)]);
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("package");
        assert!(extract(&bytes, &target).is_err());
        assert!(!target.exists());
    }

    #[test]
    fn refuses_content_over_the_limit() {
        let body = vec![b'a'; 4096];
        let bytes = zip_of(&[
            ("plugin.json", manifest().as_bytes(), 0o644),
            ("ui/a.bin", &body, 0o644),
            ("ui/b.bin", &body, 0o644),
        ]);
        let temp = tempfile::tempdir().unwrap();
        let small = Limits {
            unpacked: 4096,
            entries: MAX_ENTRIES,
        };
        assert!(unpack(&bytes, &temp.path().join("small"), small).is_err());
        // The same archive extracts once the ceiling fits, so the rejection came from
        // the limit and not from the shape of the archive.
        assert!(extract(&bytes, &temp.path().join("full")).is_ok());

        let few = Limits {
            unpacked: MAX_UNPACKED_BYTES,
            entries: 2,
        };
        assert!(unpack(&bytes, &temp.path().join("few"), few).is_err());
    }

    #[test]
    fn reads_local_locations() {
        assert!(is_http("https://example.test/a.zip"));
        assert!(!is_http("file:///C:/mirror/a.zip"));
        assert!(!is_http("D:\\mirror\\a.zip"));
        assert_eq!(
            local_path("file:///C:/mirror/a.zip"),
            PathBuf::from("C:/mirror/a.zip")
        );
        assert_eq!(local_path("/home/user/a.zip"), PathBuf::from("/home/user/a.zip"));
    }

    #[tokio::test]
    async fn refuses_a_local_artifact_over_the_limit() {
        let temp = tempfile::tempdir().unwrap();
        let artifact = temp.path().join("package.zip");
        std::fs::write(&artifact, package_zip()).unwrap();
        let client = reqwest::Client::new();
        let location = artifact.to_string_lossy().into_owned();
        assert!(fetch_with_limit(&client, &location, 8).await.is_err());
        assert_eq!(
            fetch_with_limit(&client, &location, MAX_ARTIFACT_BYTES)
                .await
                .unwrap(),
            package_zip()
        );
        assert!(fetch_with_limit(&client, &temp.path().join("missing.zip").to_string_lossy(), MAX_ARTIFACT_BYTES)
            .await
            .is_err());
    }
}
