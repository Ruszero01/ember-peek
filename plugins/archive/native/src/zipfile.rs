//! Zip containers. The central directory describes every entry, so listing an archive reads
//! no payload at all, and an entry's bytes are fetched by decompressing from its own start.
use crate::entry::{unix_from_parts, Entry};
use crate::source::{
    corrupt, io_failure, read_at, unsupported, Source, ENTRY_GUARD, TOKEN_PASSWORD,
};
use std::{fs::File, path::Path, sync::Mutex};
use zip::{read::ZipArchive, CompressionMethod};

pub struct ZipSource {
    archive: Mutex<ZipArchive<File>>,
    entries: Vec<Entry>,
    truncated: bool,
}

pub fn open(path: &Path) -> Result<Box<dyn Source>, String> {
    let file = File::open(path).map_err(io_failure)?;
    let archive = ZipArchive::new(file).map_err(zip_error)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for index in 0..archive.len() {
        if entries.len() >= ENTRY_GUARD {
            truncated = true;
            break;
        }
        // `by_index_data` reads the header without touching the payload, which is what makes
        // listing a 4 GiB archive as cheap as listing a small one.
        let record = archive.by_index_data(index).map_err(zip_error)?;
        let name = record.name().map_err(zip_error)?.into_owned();
        let directory = record.is_dir();
        let mut entry = if directory {
            Entry::directory(name, index)
        } else {
            Entry::file(name, index)
        };
        entry.size = record.size();
        entry.packed = record.compressed_size();
        entry.encrypted = record.encrypted();
        entry.method = method_name(record.compression());
        entry.modified = record.last_modified().map(|time| {
            unix_from_parts(
                time.year() as i64,
                time.month() as u32,
                time.day() as u32,
                time.hour() as u32,
                time.minute() as u32,
                time.second() as u32,
            )
        });
        entries.push(entry);
    }
    Ok(Box::new(ZipSource {
        archive: Mutex::new(archive),
        entries,
        truncated,
    }))
}

impl Source for ZipSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn truncated(&self) -> bool {
        self.truncated
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        let mut archive = self.archive.lock().unwrap();
        let mut file = archive.by_index(entry.read_index).map_err(zip_error)?;
        read_at(&mut file, offset, length)
    }
}

/// How an entry is stored, in the words the toolbar and the list show.
fn method_name(method: CompressionMethod) -> String {
    match method {
        CompressionMethod::Stored => "stored".into(),
        CompressionMethod::Deflated => "deflate".into(),
        CompressionMethod::Deflate64 => "deflate64".into(),
        CompressionMethod::Bzip2 => "bzip2".into(),
        CompressionMethod::Zstd => "zstd".into(),
        CompressionMethod::Lzma => "lzma".into(),
        CompressionMethod::Xz => "xz".into(),
        CompressionMethod::Ppmd => "ppmd".into(),
        other => format!("{other:?}").to_lowercase(),
    }
}

/// Zip's own errors, in the tokens the plugin's view knows how to word.
pub fn zip_error(error: zip::result::ZipError) -> String {
    match error {
        zip::result::ZipError::UnsupportedArchive(detail) => {
            if detail.to_lowercase().contains("password") {
                TOKEN_PASSWORD.to_string()
            } else {
                unsupported(detail)
            }
        }
        zip::result::ZipError::InvalidPassword => TOKEN_PASSWORD.to_string(),
        zip::result::ZipError::Io(error) => io_failure(error),
        other => corrupt(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source::TOKEN_PASSWORD;
    use std::io::Write;

    fn sample(directory: &Path) -> std::path::PathBuf {
        let path = directory.join("sample.zip");
        let file = File::create(&path).unwrap();
        let mut writer = zip::write::ZipWriter::new(file);
        let options: zip::write::SimpleFileOptions = Default::default();
        writer.add_directory("docs/", options).unwrap();
        writer.start_file("docs/hello.txt", options).unwrap();
        writer.write_all(b"hello archive").unwrap();
        writer.start_file("empty.bin", options).unwrap();
        writer.finish().unwrap();
        path
    }

    #[test]
    fn lists_directories_and_reads_one_entry() {
        let directory = tempfile::tempdir().unwrap();
        let path = sample(directory.path());
        let source = open(&path).unwrap();
        let names: Vec<&str> = source
            .entries()
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(names, vec!["docs", "docs/hello.txt", "empty.bin"]);
        assert!(source.entries()[0].dir);
        assert_eq!(source.entries()[1].size, 13);
        assert_eq!(source.entries()[1].method, "deflate");
        let text = source.read(&source.entries()[1].clone(), 0, 64).unwrap();
        assert_eq!(text, b"hello archive");
        assert!(source.read(&source.entries()[1].clone(), 6, 7).unwrap() == b"archive");
        assert!(source
            .read(&source.entries()[1].clone(), 13, 4)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_password_protected_entry_is_named_as_such_instead_of_failing_the_listing() {
        // An encrypted zip cannot be written by this crate's public options, so the wording
        // the reader produces for one is pinned directly: it is what the view branches on.
        assert_eq!(
            zip_error(zip::result::ZipError::InvalidPassword),
            TOKEN_PASSWORD
        );
        assert_eq!(
            zip_error(zip::result::ZipError::UnsupportedArchive(
                "Password required to decrypt file"
            )),
            TOKEN_PASSWORD
        );
        assert!(zip_error(zip::result::ZipError::UnsupportedArchive(
            "Compression method 98 is not supported"
        ))
        .starts_with("unsupported-method:"));
        assert!(
            zip_error(zip::result::ZipError::InvalidArchive("bad header".into()))
                .starts_with("archive-corrupt:")
        );
    }

    #[test]
    fn a_renamed_archive_is_read_as_what_it_is() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.txt");
        std::fs::write(&path, b"not an archive at all").unwrap();
        assert!(open(&path).is_err());
    }
}
