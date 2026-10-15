//! Tar streams, on their own or behind one of the codecs. A tar has no directory of its own,
//! so both listing and reading walk the headers from the beginning — which is also why a
//! compressed tar costs a decompression pass per entry selection rather than a seek.
use crate::entry::{looks_like_directory, Entry};
use crate::format::Format;
use crate::source::{
    corrupt, decompress_failure, io_failure, EntryCache, Source, ENTRY_GUARD, TOKEN_MISSING,
};
use std::{
    io::Read,
    path::{Path, PathBuf},
};

pub struct TarSource {
    path: PathBuf,
    codec: Option<Format>,
    entries: Vec<Entry>,
    cache: EntryCache,
    truncated: bool,
}

fn tar_error(error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::UnexpectedEof
        || error.kind() == std::io::ErrorKind::InvalidData
    {
        corrupt(error)
    } else {
        io_failure(error)
    }
}

pub fn open(path: &Path, codec: Option<Format>) -> Result<Box<dyn Source>, String> {
    let reader = crate::stream::reader(path, codec)?;
    let mut archive = tar::Archive::new(reader);
    let mut entries = Vec::new();
    let mut truncated = false;
    let items = archive.entries().map_err(tar_error)?;
    for (index, item) in items.enumerate() {
        if entries.len() >= ENTRY_GUARD {
            truncated = true;
            break;
        }
        let item = item.map_err(tar_error)?;
        let name = String::from_utf8_lossy(&item.path_bytes()).to_string();
        let header = item.header();
        let directory = header.entry_type().is_dir() || looks_like_directory(&name);
        let mut entry = if directory {
            Entry::directory(name, index)
        } else {
            Entry::file(name, index)
        };
        entry.size = header.size().unwrap_or(0);
        entry.method = codec.unwrap_or(Format::Tar).codec().to_string();
        entry.modified = header.mtime().ok().map(|seconds| seconds as i64);
        entries.push(entry);
    }
    Ok(Box::new(TarSource {
        path: path.to_path_buf(),
        codec,
        entries,
        cache: EntryCache::new(),
        truncated,
    }))
}

/// Decode the stream up to the entry at `target` and return as much of it as `want` asks for.
fn fill_prefix(
    path: &Path,
    codec: Option<Format>,
    target: usize,
    want: u64,
) -> Result<(Vec<u8>, bool), String> {
    let reader = crate::stream::reader(path, codec)?;
    let mut archive = tar::Archive::new(reader);
    let items = archive.entries().map_err(tar_error)?;
    for (index, item) in items.enumerate() {
        let mut item = item.map_err(tar_error)?;
        if index != target {
            continue;
        }
        if item.header().entry_type().is_dir() {
            return Ok((Vec::new(), true));
        }
        let mut data = Vec::new();
        let read = (&mut item)
            .take(want)
            .read_to_end(&mut data)
            .map_err(decompress_failure)?;
        return Ok((data, (read as u64) < want));
    }
    Err(TOKEN_MISSING.to_string())
}

impl Source for TarSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn truncated(&self) -> bool {
        self.truncated
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        // A later byte of the same entry arrives after the prefix is already decoded, so the
        // cache only has to extend what it holds; a different entry starts over.
        self.cache.chunk(entry, offset, length, |want| {
            fill_prefix(&self.path, self.codec, entry.read_index, want)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn build(path: &Path, codec: Option<Format>) {
        let file = std::fs::File::create(path).unwrap();
        let writer: Box<dyn std::io::Write> = match codec {
            None => Box::new(file),
            Some(Format::Gzip) => Box::new(flate2::write::GzEncoder::new(
                file,
                flate2::Compression::fast(),
            )),
            Some(other) => panic!("unsupported test codec {other:?}"),
        };
        let mut builder = tar::Builder::new(writer);
        builder.append_dir("docs", ".").unwrap();
        let mut header = tar::Header::new_gnu();
        header.set_size(5);
        header.set_mode(0o644);
        header.set_mtime(1_700_000_000);
        header.set_cksum();
        builder
            .append_data(&mut header, "docs/readme.txt", &b"hello"[..])
            .unwrap();
        let mut header = tar::Header::new_gnu();
        header.set_size(3);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "b.bin", &[1u8, 2, 3][..])
            .unwrap();
        builder.into_inner().unwrap().flush().unwrap();
    }

    #[test]
    fn a_plain_tar_lists_and_reads_its_entries() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.tar");
        build(&path, None);
        let source = open(&path, None).unwrap();
        let names: Vec<&str> = source
            .entries()
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(names, vec!["docs", "docs/readme.txt", "b.bin"]);
        assert!(source.entries()[0].dir);
        assert_eq!(source.entries()[1].size, 5);
        assert_eq!(source.entries()[1].modified, Some(1_700_000_000));
        assert_eq!(source.entries()[1].method, "stored");
        let entry = source.entries()[1].clone();
        assert_eq!(source.read(&entry, 0, 64).unwrap(), b"hello");
        assert_eq!(source.read(&entry, 1, 3).unwrap(), b"ell");
        assert_eq!(source.read(&entry, 9, 4).unwrap(), b"");
        let binary = source.entries()[2].clone();
        assert_eq!(source.read(&binary, 0, 3).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn a_compressed_tar_reports_the_codec_as_its_method() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.tar.gz");
        build(&path, Some(Format::Gzip));
        let source = open(&path, Some(Format::Gzip)).unwrap();
        assert_eq!(source.entries().len(), 3);
        assert_eq!(source.entries()[1].method, "gzip");
        let entry = source.entries()[1].clone();
        assert_eq!(source.read(&entry, 2, 3).unwrap(), b"llo");
    }

    #[test]
    fn a_range_past_the_end_of_an_entry_is_empty_rather_than_an_error() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.tar");
        build(&path, None);
        let source = open(&path, None).unwrap();
        let entry = source.entries()[1].clone();
        assert!(source.read(&entry, 5000, 16).unwrap().is_empty());
        assert_eq!(source.read(&entry, 0, 4096).unwrap(), b"hello");
    }
}
