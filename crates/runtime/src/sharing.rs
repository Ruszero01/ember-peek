//! Local package interchange. Preparation never executes plugin code.
use crate::{artifact, manifest::Package};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};

fn entries(
    root: &Path,
    directory: &Path,
    files: &mut Vec<PathBuf>,
    total: &mut u64,
    depth: usize,
) -> Result<(), String> {
    if depth > 16 {
        return Err("Package nesting exceeds 16 levels".into());
    }
    for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = std::fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("Package reparse points are not supported".into());
            }
        }
        if metadata.file_type().is_symlink() {
            return Err("Package links are not supported".into());
        }
        if metadata.is_dir() {
            entries(root, &entry.path(), files, total, depth + 1)?;
        } else if metadata.is_file() {
            *total += metadata.len();
            files.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|e| e.to_string())?
                    .to_path_buf(),
            );
            if *total > artifact::MAX_UNPACKED_BYTES || files.len() > artifact::MAX_ENTRIES {
                return Err("Package exceeds size or file count limit".into());
            }
        } else {
            return Err("Unsupported package entry".into());
        }
    }
    Ok(())
}

/// Hash the bounded directory content without compressing or creating an archive.
pub fn fingerprint(source: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    Package::load(source)?;
    let mut files = Vec::new();
    entries(source, source, &mut files, &mut 0, 0)?;
    files.sort();
    let mut hash = Sha256::new();
    let mut total = 0u64;
    for path in files {
        let name = path.to_string_lossy().replace('\\', "/");
        let verified = crate::manifest::contained(source, &name)?;
        let mut bytes = Vec::new();
        std::fs::File::open(verified)
            .map_err(|e| e.to_string())?
            .take(artifact::MAX_UNPACKED_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        total += bytes.len() as u64;
        if total > artifact::MAX_UNPACKED_BYTES {
            return Err("Package grew beyond size limit".into());
        }
        hash.update((name.len() as u64).to_le_bytes());
        hash.update(name.as_bytes());
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    Ok(format!("tree-v1:{:x}", hash.finalize()))
}

/// Repack only distributable assets, excluding local installation and project state.
pub fn export(source: &Path) -> Result<Vec<u8>, String> {
    let package = Package::load(source)?;
    let mut files = Vec::new();
    entries(source, source, &mut files, &mut 0, 0)?;
    files.sort();
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0u64;
    for path in files {
        let name = path.to_string_lossy().replace('\\', "/");
        let allowed = name == "plugin.json"
            || name.starts_with("bin/")
            || name.starts_with("ui/")
            || name.starts_with("licenses/")
            || matches!(name.as_str(), "LICENSE" | "LICENSE.txt" | "README.md");
        if !allowed {
            continue;
        }
        // Build output must not contain hidden files, source maps, or environment files.
        if path
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
            || name.ends_with(".map")
        {
            continue;
        }
        let bytes = if name == "plugin.json" {
            let mut manifest = package.manifest.clone();
            manifest.revision = 0;
            // A previous build identity is not valid for a repackaged artifact.
            manifest.build_id.clear();
            serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?
        } else {
            let mut bytes = Vec::new();
            let verified = crate::manifest::contained(source, &path.to_string_lossy())?;
            std::fs::File::open(verified)
                .map_err(|e| e.to_string())?
                .take(artifact::MAX_UNPACKED_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 > artifact::MAX_UNPACKED_BYTES {
                return Err("Package file grew beyond limit".into());
            }
            bytes
        };
        total += bytes.len() as u64;
        if total > artifact::MAX_UNPACKED_BYTES {
            return Err("Package grew beyond size limit".into());
        }
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    let bytes = zip.finish().map_err(|e| e.to_string())?.into_inner();
    if bytes.len() as u64 > artifact::MAX_ARTIFACT_BYTES {
        return Err("Compressed package exceeds 64 MiB".into());
    }
    Ok(bytes)
}

pub fn prepare(source: &Path, target: &Path) -> Result<Package, String> {
    if source.is_dir() {
        Package::load(source)?;
        let mut files = Vec::new();
        entries(source, source, &mut files, &mut 0, 0)?;
        std::fs::create_dir(target).map_err(|e| e.to_string())?;
        let mut total = 0;
        for path in files {
            let mut bytes = Vec::new();
            let verified = crate::manifest::contained(source, &path.to_string_lossy())?;
            std::fs::File::open(verified)
                .map_err(|e| e.to_string())?
                .take(artifact::MAX_UNPACKED_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            total += bytes.len() as u64;
            if total > artifact::MAX_UNPACKED_BYTES {
                return Err("Package grew beyond size limit".into());
            }
            let destination = target.join(path);
            std::fs::create_dir_all(destination.parent().ok_or("Invalid destination")?)
                .map_err(|e| e.to_string())?;
            std::fs::write(destination, bytes).map_err(|e| e.to_string())?;
        }
        return Package::load(target);
    }
    let bytes = {
        let mut bytes = Vec::new();
        std::fs::File::open(source)
            .map_err(|e| e.to_string())?
            .take(artifact::MAX_ARTIFACT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > artifact::MAX_ARTIFACT_BYTES {
            return Err("Compressed package exceeds 64 MiB".into());
        }
        bytes
    };
    artifact::extract(&bytes, target)?;
    Package::load(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path) {
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::create_dir_all(root.join("ui")).unwrap();
        std::fs::write(root.join("bin/view.exe"), b"test executable").unwrap();
        std::fs::write(root.join("ui/index.html"), b"<!doctype html>").unwrap();
        std::fs::write(root.join("plugin.json"), r#"{"api":1,"id":"user.example","name":"Example","version":"1.0.0","executable":"bin/view.exe","entry":"ui/index.html","capabilities":["view"],"revision":12}"#).unwrap();
    }
    #[test]
    fn round_trip_removes_private_state_and_revision() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fixture(&source);
        std::fs::write(source.join("conversation.json"), "private").unwrap();
        std::fs::write(source.join("ui/.env"), "SECRET=private").unwrap();
        let archive = temp.path().join("plugin.zip");
        std::fs::write(&archive, export(&source).unwrap()).unwrap();
        let target = temp.path().join("target");
        let package = prepare(&archive, &target).unwrap();
        assert_eq!(package.manifest.revision, 0);
        assert_eq!(package.manifest.id, "user.example");
        assert!(!target.join("conversation.json").exists());
        assert!(!target.join("ui/.env").exists());
        assert_eq!(
            std::fs::read(target.join("bin/view.exe")).unwrap(),
            b"test executable"
        );
    }
    #[test]
    fn malformed_archive_never_becomes_an_installable_package() {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("bad.zip");
        std::fs::write(&archive, b"not a zip").unwrap();
        let target = temp.path().join("target");
        assert!(prepare(&archive, &target).is_err());
        assert!(!target.exists());
    }
}
