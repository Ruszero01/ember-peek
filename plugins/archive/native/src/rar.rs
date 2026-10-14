//! Rar archives, listed and read through the reference decoder. Rar has no random access at
//! all: an entry is reached by walking the headers in front of it, so a whole entry is read at
//! once and its ranges are then served from memory.
use crate::entry::{unix_from_dos, Entry};
use crate::source::{
    io_failure, too_large, EntryCache, Source, ENTRY_GUARD, TOKEN_MISSING, TOKEN_MULTIPART,
    TOKEN_PASSWORD,
};
use std::path::{Path, PathBuf};

pub struct RarSource {
    path: PathBuf,
    entries: Vec<Entry>,
    cache: EntryCache,
    multipart: bool,
    truncated: bool,
}

fn rar_error(error: unrar::error::UnrarError) -> String {
    let text = error.to_string();
    let lowered = text.to_lowercase();
    if lowered.contains("password") || lowered.contains("encrypted") {
        return TOKEN_PASSWORD.to_string();
    }
    if lowered.contains("volume") || lowered.contains("multivolume") {
        return TOKEN_MULTIPART.to_string();
    }
    crate::source::corrupt(text)
}

pub fn open(path: &Path) -> Result<Box<dyn Source>, String> {
    let listing = unrar::Archive::new(path)
        .open_for_listing()
        .map_err(rar_error)?;
    let mut entries = Vec::new();
    let mut multipart = false;
    let mut truncated = false;
    for (index, header) in listing.enumerate() {
        if entries.len() >= ENTRY_GUARD {
            truncated = true;
            break;
        }
        let header = header.map_err(rar_error)?;
        let name = header.filename.to_string_lossy().to_string();
        let mut entry = if header.is_directory() {
            Entry::directory(name, index)
        } else {
            Entry::file(name, index)
        };
        entry.size = header.unpacked_size;
        entry.modified = unix_from_dos(header.file_time);
        entry.encrypted = header.is_encrypted();
        entry.method = "rar".to_string();
        multipart |= header.is_split();
        entries.push(entry);
    }
    if entries.is_empty() && !truncated {
        // An empty listing from a file whose header said rar means the data is locked behind
        // an encrypted header rather than that the archive is empty.
        let header = read_prefix(path, 8)?;
        if header.starts_with(b"Rar!\x1a\x07") {
            return Err(TOKEN_PASSWORD.to_string());
        }
    }
    Ok(Box::new(RarSource {
        path: path.to_path_buf(),
        entries,
        cache: EntryCache::new(),
        multipart,
        truncated,
    }))
}

fn read_prefix(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(io_failure)?
        .take(limit as u64)
        .read_to_end(&mut bytes)
        .map_err(io_failure)?;
    Ok(bytes)
}

/// Walk to the entry at `target` and keep as much of it as `want` asks for. The decoder hands
/// an entry over whole, so the size of the entry — not of the request — is what has to fit.
fn fill_prefix(path: &Path, target: usize, want: u64) -> Result<(Vec<u8>, bool), String> {
    let mut cursor = unrar::Archive::new(path)
        .open_for_processing()
        .map_err(rar_error)?;
    let mut index = 0usize;
    loop {
        let Some(next) = cursor.read_header().map_err(rar_error)? else {
            return Err(TOKEN_MISSING.to_string());
        };
        if index == target {
            let (data, _) = next.read().map_err(rar_error)?;
            let take = (want as usize).min(data.len());
            return Ok((data[..take].to_vec(), data.len() <= take));
        }
        cursor = next.skip().map_err(rar_error)?;
        index += 1;
    }
}

impl Source for RarSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn truncated(&self) -> bool {
        self.truncated
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        if self.multipart {
            return Err(TOKEN_MULTIPART.to_string());
        }
        // The reference decoder hands an entry over as one buffer, so an entry bigger than the
        // read budget cannot be previewed at all — the same bound, applied where the decoder
        // forces it rather than where the reader asked. Everything else about it, including the
        // listing and the sizes, is unaffected.
        if entry.size > crate::source::MAX_ENTRY_BYTES {
            return Err(too_large(entry.size));
        }
        let target = entry.read_index;
        self.cache.chunk(entry, offset, length, |want| {
            fill_prefix(&self.path, target, want)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_that_is_not_a_rar_reports_a_decode_failure() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fake.rar");
        std::fs::write(&path, b"Rar!\x1a\x07\x00not really").unwrap();
        match open(&path) {
            Ok(source) => assert!(source.entries().is_empty()),
            Err(error) => assert!(!error.is_empty()),
        }
    }

    #[test]
    fn an_unreadable_file_reports_io_rather_than_an_empty_archive() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing.rar");
        assert!(open(&path).is_err());
    }
}
