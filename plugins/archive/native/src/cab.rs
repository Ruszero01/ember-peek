//! Windows cabinets. Entries are named in the header; a file's bytes are decoded from the
//! folder it belongs to, which the crate handles for us.
use crate::entry::Entry;
use crate::source::{corrupt, io_failure, read_at, Source, ENTRY_GUARD};
use cab::{Cabinet, CompressionType};
use std::{fs::File, path::Path, sync::Mutex};

pub struct CabSource {
    cabinet: Mutex<Cabinet<File>>,
    entries: Vec<Entry>,
    truncated: bool,
}

pub fn open(path: &Path) -> Result<Box<dyn Source>, String> {
    let file = File::open(path).map_err(io_failure)?;
    let cabinet = Cabinet::new(file).map_err(corrupt)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    let mut index = 0usize;
    for folder in cabinet.folder_entries() {
        if entries.len() >= ENTRY_GUARD {
            truncated = true;
            break;
        }
        let method = match folder.compression_type() {
            CompressionType::None => "stored",
            CompressionType::MsZip => "mszip",
            CompressionType::Lzx(..) => "lzx",
            CompressionType::Quantum(..) => "quantum",
        };
        for file in folder.file_entries() {
            if entries.len() >= ENTRY_GUARD {
                truncated = true;
                break;
            }
            let mut entry = Entry::file(file.name().to_string(), index);
            entry.size = file.uncompressed_size() as u64;
            entry.method = method.to_string();
            entries.push(entry);
            index += 1;
        }
    }
    Ok(Box::new(CabSource {
        cabinet: Mutex::new(cabinet),
        entries,
        truncated,
    }))
}

impl Source for CabSource {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn truncated(&self) -> bool {
        self.truncated
    }

    fn read(&self, entry: &Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        let mut cabinet = self.cabinet.lock().unwrap();
        let mut reader = cabinet.read_file(&entry.name).map_err(corrupt)?;
        read_at(&mut reader, offset, length)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_that_is_not_a_cabinet_reports_a_decode_failure() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fake.cab");
        std::fs::write(&path, b"MSCF but not really").unwrap();
        assert!(open(&path).is_err());
    }
}
