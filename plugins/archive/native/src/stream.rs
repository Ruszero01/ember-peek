//! Single-file codecs, and the question that decides whether a `.tar.gz` is one payload or
//! a whole archive: what the decompressed bytes start with.
use crate::entry::Entry;
use crate::format::{self, Format};
use crate::source::{decompress_failure, io_failure, read_prefix_stream, EntryCache, Source};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

/// A decoder for the container's payload. Readers are built per request on purpose: each one
/// is a fresh cursor from the start of the stream, and nothing is shared between calls.
pub fn reader(path: &Path, codec: Option<Format>) -> Result<Box<dyn Read + Send>, String> {
    let file = File::open(path).map_err(io_failure)?;
    Ok(match codec {
        None | Some(Format::Tar) => Box::new(file),
        // Multiple members are legal in all four of these, and a concatenated gzip is how a
        // tar split by an old archiver looks, so each decoder is the multi-member one.
        Some(Format::Gzip) => Box::new(flate2::read::MultiGzDecoder::new(file)),
        Some(Format::Bzip2) => Box::new(bzip2::read::MultiBzDecoder::new(file)),
        Some(Format::Xz) => Box::new(lzma_rust2::XzReader::new(file, true)),
        Some(Format::Zstd) => {
            Box::new(zstd::stream::read::Decoder::new(file).map_err(decompress_failure)?)
        }
        Some(Format::Lz4) => Box::new(lz4_flex::frame::FrameDecoder::new(file)),
        Some(other) => {
            return Err(crate::source::unsupported(other.id()));
        }
    })
}

/// Whether the decompressed stream is a tar archive rather than one payload.
pub fn holds_tar(path: &Path, codec: Format) -> Result<bool, String> {
    let mut reader = reader(path, Some(codec))?;
    let mut header = vec![0u8; 512];
    let mut read = 0;
    while read < header.len() {
        match reader.read(&mut header[read..]) {
            Ok(0) => break,
            Ok(count) => read += count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(decompress_failure(error)),
        }
    }
    header.truncate(read);
    Ok(format::is_tar(&header))
}

pub struct StreamSource {
    path: PathBuf,
    codec: Format,
    entries: Vec<Entry>,
    cache: EntryCache,
}

/// One compressed file: the codec wraps a single payload, which gets the name the gzip header
/// recorded or, failing that, the archive's own name minus the codec suffix.
pub fn open(path: &Path, codec: Format, prefix: &[u8]) -> Result<Box<dyn Source>, String> {
    let mut entry = Entry::file(format::payload_name(path, prefix), 0);
    entry.method = codec.codec().to_string();
    entry.size = declared_size(path, codec);
    Ok(Box::new(StreamSource {
        path: path.to_path_buf(),
        codec,
        entries: vec![entry],
        cache: EntryCache::new(),
    }))
}

/// Gzip is the only one of these codecs that states the payload length up front — modulo
/// 4 GiB, in its trailer. Deflate cannot compress by more than 1032:1, so a counter beyond
/// that bound relative to the file size is one that wrapped, and is left unknown instead of
/// being shown as a number that means nothing.
fn declared_size(path: &Path, codec: Format) -> u64 {
    if codec != Format::Gzip {
        return 0;
    }
    let Ok(mut file) = File::open(path) else {
        return 0;
    };
    let Ok(file_size) = file.metadata().map(|meta| meta.len()) else {
        return 0;
    };
    if file_size < 18 || file.seek(SeekFrom::End(-4)).is_err() {
        return 0;
    }
    let mut trailer = [0u8; 4];
    if file.read_exact(&mut trailer).is_err() {
        return 0;
    }
    let declared = u32::from_le_bytes(trailer) as u64;
    if declared > 0 && declared <= file_size.saturating_mul(1032) {
        declared
    } else {
        0
    }
}

impl Source for StreamSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        self.cache.chunk(entry, offset, length, |want| {
            let mut reader = reader(&self.path, Some(self.codec))?;
            read_prefix_stream(&mut reader, want)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn gzip(path: &Path, payload: &[u8]) {
        let file = File::create(path).unwrap();
        let mut encoder = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
        encoder.write_all(payload).unwrap();
        encoder.finish().unwrap();
    }

    #[test]
    fn a_plain_compressed_file_is_one_entry_that_reads_in_ranges() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.txt.gz");
        gzip(&path, b"the quick brown fox");
        let prefix = std::fs::read(&path).unwrap();
        assert!(!holds_tar(&path, Format::Gzip).unwrap());
        let source = open(&path, Format::Gzip, &prefix).unwrap();
        assert_eq!(source.entries().len(), 1);
        assert_eq!(source.entries()[0].name, "notes.txt");
        assert_eq!(source.entries()[0].method, "gzip");
        assert_eq!(source.entries()[0].size, 19);
        let entry = source.entries()[0].clone();
        assert_eq!(source.read(&entry, 0, 9).unwrap(), b"the quick");
        assert_eq!(source.read(&entry, 10, 5).unwrap(), b"brown");
        assert_eq!(source.read(&entry, 100, 5).unwrap(), b"");
    }

    #[test]
    fn a_compressed_tar_is_read_as_an_archive_of_its_own() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("bundle.tar.gz");
        let file = File::create(&path).unwrap();
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(4);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "a.txt", &b"data"[..])
            .unwrap();
        builder.into_inner().unwrap().finish().unwrap();

        assert!(holds_tar(&path, Format::Gzip).unwrap());
        let source = crate::tarfile::open(&path, Some(Format::Gzip)).unwrap();
        assert_eq!(source.entries()[0].name, "a.txt");
        assert_eq!(
            source.read(&source.entries()[0].clone(), 0, 4).unwrap(),
            b"data"
        );
    }
}
