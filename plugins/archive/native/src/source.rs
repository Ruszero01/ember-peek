//! What every format reader offers, and the plumbing they share.
//!
//! A reader answers two questions: which entries the archive holds, and the bytes of one
//! entry at a given offset. The second question is the interesting one, because only some
//! formats can be addressed directly — zip and cab seek, while a gzip'd tar, a 7z block and
//! a rar volume only decode forwards. A reader that cannot seek therefore caches the prefix
//! it has decoded so far, and a request for more grows that prefix instead of starting over.
use crate::entry::Entry;
use crate::format::Format;
use std::{
    io::{self, Read},
    path::Path,
    sync::Mutex,
};

/// The most of one entry this plugin will hold in memory at a time. Every path that has to
/// decode forwards is bounded by it, and the view asks for less.
pub const MAX_ENTRY_BYTES: u64 = 96 * 1024 * 1024;

/// A guard against a directory that claims an absurd number of entries, not a limit on what a
/// reader may see: a corrupt or hostile header can announce hundreds of millions of members,
/// and walking that would be the whole preview. Real archives — including machine-written ones
/// with hundreds of thousands of files — list completely. The view is told through `truncated`
/// in the pathological case, and nothing else about the listing is capped.
pub const ENTRY_GUARD: usize = 1_000_000;

pub trait Source: Send + Sync {
    fn entries(&self) -> &[Entry];
    /// Whether the directory stopped at `ENTRY_GUARD` instead of the end of the archive.
    fn truncated(&self) -> bool {
        false
    }
    /// Bytes of `entry` at `offset`, at most `length`. Shorter only at the end of the entry.
    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String>;
}

/// Open the container a file holds. `prefix` is the bounded read the format was decided
/// from, which some codecs need to look inside before they can list anything.
pub fn open(path: &Path, prefix: &[u8], format: Format) -> Result<Box<dyn Source>, String> {
    match format {
        Format::Zip => crate::zipfile::open(path),
        Format::SevenZip => crate::sevenz::open(path),
        Format::Rar => crate::rar::open(path),
        Format::Cab => crate::cab::open(path),
        Format::Tar => crate::tarfile::open(path, None),
        Format::Gzip | Format::Bzip2 | Format::Xz | Format::Zstd | Format::Lz4 => {
            // A compressed single file is either one payload or a whole tar stream; only the
            // decompressed first block tells them apart.
            if crate::stream::holds_tar(path, format)? {
                crate::tarfile::open(path, Some(format))
            } else {
                crate::stream::open(path, format, prefix)
            }
        }
    }
}

/*
 * Error wording
 *
 * Decoding failures are returned as a token the plugin's own view turns into a sentence in
 * the interface language, because only the view knows which language that is. A token may
 * carry a detail after a colon. Anything the host itself has to show — a file that cannot be
 * opened at all — is a plain sentence instead, since no plugin text passes through it.
 */

pub const TOKEN_PASSWORD: &str = "password-protected";
pub const TOKEN_MISSING: &str = "entry-missing";
pub const TOKEN_DIRECTORY: &str = "entry-is-a-directory";
pub const TOKEN_MULTIPART: &str = "multipart-archive";
pub const TOKEN_EMPTY: &str = "entry-chunk-empty";

pub fn too_large(size: u64) -> String {
    format!("entry-too-large:{size}")
}

pub fn unsupported(method: &str) -> String {
    format!("unsupported-method:{method}")
}

/// A decode failure: the container is damaged, or it is not what its header claimed.
pub fn corrupt(detail: impl std::fmt::Display) -> String {
    format!("archive-corrupt:{detail}")
}

/// A failure reading the archive file itself.
pub fn io_failure(error: io::Error) -> String {
    format!("io:{error}")
}

/// Extend a decoded prefix until `want` bytes are available, or the payload ends.
/// `complete` is true when the payload ended, so a reader stops asking for more.
pub fn read_prefix_stream(reader: &mut impl Read, want: u64) -> Result<(Vec<u8>, bool), String> {
    let mut data = Vec::new();
    let mut buffer = vec![0u8; 64 * 1024];
    while (data.len() as u64) < want {
        let remaining = (want - data.len() as u64).min(buffer.len() as u64) as usize;
        match reader.read(&mut buffer[..remaining]) {
            Ok(0) => return Ok((data, true)),
            Ok(count) => data.extend_from_slice(&buffer[..count]),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(decompress_failure(error)),
        }
    }
    Ok((data, false))
}

/// Read a bounded range from a reader that starts at the entry's beginning.
pub fn read_at(reader: &mut impl Read, offset: u64, length: usize) -> Result<Vec<u8>, String> {
    if offset > 0 {
        let skipped =
            io::copy(&mut reader.take(offset), &mut io::sink()).map_err(decompress_failure)?;
        if skipped < offset {
            return Ok(Vec::new());
        }
    }
    let mut data = vec![0u8; length];
    let mut read = 0;
    while read < length {
        match reader.read(&mut data[read..]) {
            Ok(0) => break,
            Ok(count) => read += count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(decompress_failure(error)),
        }
    }
    data.truncate(read);
    Ok(data)
}

/// A decode error the decoder reported as I/O. Some decoders report a truncated stream this
/// way and some report it in their own error type; both reach the reader as the same token.
pub fn decompress_failure(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::UnexpectedEof || error.kind() == io::ErrorKind::InvalidData {
        corrupt(error)
    } else {
        io_failure(error)
    }
}

struct Cached {
    index: usize,
    data: Vec<u8>,
    complete: bool,
}

/// The decoded prefix of the entry a view is reading, for formats that only decode forwards.
pub struct EntryCache {
    slot: Mutex<Option<Cached>>,
}

impl EntryCache {
    pub fn new() -> Self {
        EntryCache {
            slot: Mutex::new(None),
        }
    }

    /// Serve a range of `entry`, decoding more through `fill` when the cache is short.
    /// `fill(want)` decodes the entry from its start and returns the prefix plus whether the
    /// payload ended.
    pub fn chunk(
        &self,
        entry: &Entry,
        offset: u64,
        length: usize,
        fill: impl FnOnce(u64) -> Result<(Vec<u8>, bool), String>,
    ) -> Result<Vec<u8>, String> {
        let want = offset.saturating_add(length as u64);
        if want > MAX_ENTRY_BYTES {
            return Err(too_large(entry.size.max(want)));
        }
        let mut slot = self.slot.lock().unwrap();
        let mut cached = slot.take().unwrap_or(Cached {
            index: entry.read_index,
            data: Vec::new(),
            complete: false,
        });
        if cached.index != entry.read_index {
            cached = Cached {
                index: entry.read_index,
                data: Vec::new(),
                complete: false,
            };
        }
        if !cached.complete && (cached.data.len() as u64) < want {
            let (data, complete) = fill(want)?;
            cached.complete = complete || (data.len() as u64) < want;
            cached.data = data;
        }
        let start = (offset as usize).min(cached.data.len());
        let end = start.saturating_add(length).min(cached.data.len());
        let result = cached.data[start..end].to_vec();
        *slot = Some(cached);
        Ok(result)
    }
}

impl Default for EntryCache {
    fn default() -> Self {
        EntryCache::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn entry() -> Entry {
        let mut entry = Entry::file("a.txt".into(), 3);
        entry.size = 10;
        entry
    }

    #[test]
    fn a_cache_serves_ranges_and_only_decodes_what_it_is_asked_for() {
        let cache = EntryCache::new();
        let calls = AtomicUsize::new(0);
        let read = |offset: u64, length: usize| {
            cache.chunk(&entry(), offset, length, |want| {
                calls.fetch_add(1, Ordering::SeqCst);
                let data: Vec<u8> = (0..10u8).collect();
                let take = (want as usize).min(data.len());
                Ok((data[..take].to_vec(), take == data.len()))
            })
        };
        assert_eq!(read(0, 4).unwrap(), vec![0, 1, 2, 3]);
        assert_eq!(read(0, 4).unwrap(), vec![0, 1, 2, 3]);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "the same range is reused");
        assert_eq!(read(4, 4).unwrap(), vec![4, 5, 6, 7]);
        assert_eq!(
            calls.load(Ordering::SeqCst),
            2,
            "a longer range decodes more"
        );
        assert_eq!(read(0, 10).unwrap().len(), 10);
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(read(20, 4).unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn a_cache_will_not_hold_more_than_its_budget() {
        let cache = EntryCache::new();
        let mut big = entry();
        big.size = MAX_ENTRY_BYTES * 2;
        let error = cache
            .chunk(&big, MAX_ENTRY_BYTES, 1024, |_| unreachable!())
            .unwrap_err();
        assert_eq!(error, too_large(big.size));
    }

    #[test]
    fn ranges_come_from_a_reader_that_starts_at_the_entry() {
        let mut reader = std::io::Cursor::new((0..10u8).collect::<Vec<u8>>());
        assert_eq!(read_at(&mut reader, 3, 4).unwrap(), vec![3, 4, 5, 6]);
        let mut reader = std::io::Cursor::new(vec![1u8, 2]);
        assert_eq!(read_at(&mut reader, 5, 4).unwrap(), Vec::<u8>::new());
        let mut reader = std::io::Cursor::new(vec![1u8, 2, 3]);
        assert_eq!(read_at(&mut reader, 1, 8).unwrap(), vec![2, 3]);
    }
}
