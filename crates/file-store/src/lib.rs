//! Write a complete sibling file before replacing the destination. Never truncate live data.
use std::{
    io::{self, Write},
    path::Path,
};

pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing parent directory"))?;
    let mut staged = tempfile::Builder::new()
        .prefix(".ember-write-")
        .tempfile_in(parent)?;
    staged.write_all(bytes)?;
    staged.as_file().sync_all()?;
    if path.try_exists()? {
        replace_existing(staged, path)?;
    } else {
        staged
            .persist_noclobber(path)
            .map_err(|error| error.error)?;
    }
    #[cfg(unix)]
    std::fs::File::open(parent)?.sync_all()?;
    Ok(())
}

#[cfg(windows)]
fn replace_existing(staged: tempfile::NamedTempFile, path: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    let destination: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // Close the temporary handle before ReplaceFileW opens it with write/delete access.
    let temporary = staged.into_temp_path();
    let replacement: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    // ReplaceFile preserves the original file's ACL and metadata. No copy-over fallback:
    // an antivirus/sharing failure must leave a complete file, not a partial overwrite.
    let ok = unsafe {
        ReplaceFileW(
            destination.as_ptr(),
            replacement.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_existing(staged: tempfile::NamedTempFile, path: &Path) -> io::Result<()> {
    staged
        .as_file()
        .set_permissions(std::fs::metadata(path)?.permissions())?;
    staged.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn writes_new_and_replaces_with_shorter_content() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("state.json");
        atomic_write(&path, b"long original").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn locked_destination_keeps_original_and_cleans_staging() {
        use std::os::windows::fs::OpenOptionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("document.txt");
        std::fs::write(&path, b"original").unwrap();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(atomic_write(&path, b"replacement").is_err());
        drop(held);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
    }
}
