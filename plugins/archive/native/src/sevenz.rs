//! 7z archives. The header names every entry; the payload is decoded per stream block, which
//! is the only way a solid archive can be read at all — an entry in the middle of a block
//! depends on everything in front of it.
use crate::entry::{unix_from_filetime, Entry};
use crate::source::{
    corrupt, io_failure, unsupported, EntryCache, Source, ENTRY_GUARD, TOKEN_MISSING,
    TOKEN_PASSWORD,
};
use sevenz_rust2::{ArchiveReader, Password};
use std::path::{Path, PathBuf};

pub struct SevenZipSource {
    path: PathBuf,
    entries: Vec<Entry>,
    cache: EntryCache,
    truncated: bool,
}

fn open_reader(path: &Path) -> Result<ArchiveReader<std::fs::File>, String> {
    ArchiveReader::open(path, Password::empty()).map_err(sevenz_error)
}

pub fn open(path: &Path) -> Result<Box<dyn Source>, String> {
    let reader = open_reader(path)?;
    let mut entries = Vec::new();
    let mut streams = 0usize;
    let mut truncated = false;
    for file in &reader.archive().files {
        if entries.len() >= ENTRY_GUARD {
            truncated = true;
            break;
        }
        let index = streams;
        if file.has_stream() {
            streams += 1;
        }
        let mut entry = if file.is_directory() {
            Entry::directory(file.name.clone(), index)
        } else {
            Entry::file(file.name.clone(), index)
        };
        entry.size = file.size();
        entry.packed = file.compressed_size;
        if file.has_last_modified_date {
            entry.modified = unix_from_filetime(u64::from(file.last_modified_date));
        }
        entries.push(entry);
    }
    Ok(Box::new(SevenZipSource {
        path: path.to_path_buf(),
        entries,
        cache: EntryCache::new(),
        truncated,
    }))
}

/// Read `want` bytes of the entry named `name`, decoding the stream that holds it.
///
/// The decoder hands each entry of a stream to the closure in turn, so the entry in front of
/// the wanted one has already been consumed by the time it arrives — which is exactly what a
/// solid block requires, since its members cannot be decoded out of order.
fn fill_prefix(path: &Path, name: &str, want: u64) -> Result<(Vec<u8>, bool), String> {
    let mut reader = open_reader(path)?;
    let mut data = Vec::new();
    let mut complete = false;
    let mut found = false;
    let mut failure: Option<String> = None;
    let outcome = reader.for_each_entries(|file, stream| {
        if file.name != name {
            return Ok(true);
        }
        found = true;
        let size = file.size;
        let take = want.min(size).max(1);
        let mut buffer = vec![0u8; take as usize];
        let mut read = 0usize;
        while read < buffer.len() {
            match stream.read(&mut buffer[read..]) {
                Ok(0) => break,
                Ok(count) => read += count,
                Err(error) => {
                    failure = Some(io_failure(error));
                    return Ok(false);
                }
            }
        }
        buffer.truncate(read);
        complete = (read as u64) >= size;
        data = buffer;
        Ok(false)
    });
    if let Some(failure) = failure {
        return Err(failure);
    }
    outcome.map_err(sevenz_error)?;
    if !found {
        return Err(TOKEN_MISSING.to_string());
    }
    Ok((data, complete))
}

impl Source for SevenZipSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn truncated(&self) -> bool {
        self.truncated
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        // A solid block is decoded from its start, but only as far as the reader asked for:
        // the cache holds that prefix, so a large entry still previews from its beginning.
        // What is bounded is the read, never the entry the directory reported.
        let name = entry.name.clone();
        self.cache.chunk(entry, offset, length, |want| {
            fill_prefix(&self.path, &name, want)
        })
    }
}

pub fn sevenz_error(error: sevenz_rust2::Error) -> String {
    let text = error.to_string();
    if text.to_lowercase().contains("password") || text.to_lowercase().contains("encrypt") {
        return TOKEN_PASSWORD.to_string();
    }
    if text.to_lowercase().contains("unsupported") || text.to_lowercase().contains("not support") {
        return unsupported(&text);
    }
    corrupt(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Built with the crate's own writer so the fixture is a real 7z, not a hand-made header.
    fn sample(directory: &Path) -> PathBuf {
        let source = directory.join("payload");
        std::fs::create_dir_all(source.join("docs")).unwrap();
        std::fs::write(source.join("docs/hello.txt"), b"seven zip body").unwrap();
        std::fs::write(source.join("second.bin"), [1u8, 2, 3, 4]).unwrap();
        let path = directory.join("sample.7z");
        sevenz_rust2::compress_to_path(&source, &path).unwrap();
        path
    }

    fn find<'a>(source: &'a dyn Source, name: &str) -> &'a Entry {
        source
            .entries()
            .iter()
            .find(|entry| entry.name.ends_with(name))
            .unwrap_or_else(|| panic!("{name} is missing from the listing"))
    }

    #[test]
    fn lists_entries_and_reads_them_by_name() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        let source = open(&path).unwrap();
        let text = find(source.as_ref(), "docs/hello.txt").clone();
        assert_eq!(text.size, 14);
        assert_eq!(source.read(&text, 0, 64).unwrap(), b"seven zip body");
        assert_eq!(source.read(&text, 6, 3).unwrap(), b"zip");
        let binary = find(source.as_ref(), "second.bin").clone();
        assert_eq!(source.read(&binary, 1, 2).unwrap(), vec![2, 3]);
        assert_eq!(source.read(&binary, 0, 64).unwrap(), vec![1, 2, 3, 4]);
    }

    #[test]
    fn a_file_that_is_not_7z_reports_a_decode_failure() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fake.7z");
        std::fs::write(&path, b"definitely not a 7z archive").unwrap();
        assert!(open(&path).is_err());
    }
}
