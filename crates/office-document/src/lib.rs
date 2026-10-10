//! Shared, bounded OOXML preflight for independent read-only Office plugins.
//! No document bytes are written, and no macros, links or embedded objects are executed.
use serde_json::{json, Value};
use std::{collections::HashSet, fs::File, io::Read, path::Path};

pub const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_ENTRY: u64 = 32 * 1024 * 1024;
const MAX_TOTAL: u64 = 256 * 1024 * 1024;
const MAX_ENTRIES: usize = 4000;
#[derive(Clone, Copy)]
pub enum Kind {
    Word,
    Presentation,
    Spreadsheet,
}
impl Kind {
    fn main(self) -> &'static str {
        match self {
            Self::Word => "word/document.xml",
            Self::Presentation => "ppt/presentation.xml",
            Self::Spreadsheet => "xl/workbook.xml",
        }
    }
    fn extension(self) -> &'static str {
        match self {
            Self::Word => "docx",
            Self::Presentation => "pptx",
            Self::Spreadsheet => "xlsx",
        }
    }
}
pub fn inspect(path: &Path, kind: Kind) -> Result<Value, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    if size > MAX_FILE {
        return Err("Office preview is limited to 64 MiB per file".into());
    }
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "Expected an unencrypted DOCX, PPTX or XLSX package")?;
    validate(&mut archive, kind, MAX_ENTRY, MAX_TOTAL, MAX_ENTRIES)?;
    Ok(json!({"size":size,"format":kind.extension()}))
}
fn validate<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    kind: Kind,
    max_entry: u64,
    max_total: u64,
    max_entries: usize,
) -> Result<(), String> {
    if archive.is_empty() || archive.len() > max_entries {
        return Err("Office package entry count exceeds budget".into());
    }
    let mut names = HashSet::new();
    let mut declared = 0u64;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name();
        if entry.encrypted() {
            return Err("Encrypted Office documents are not supported".into());
        }
        if name.starts_with('/')
            || name.contains(['\\', ':'])
            || name.split('/').any(|p| p == ".." || p == ".")
            || !names.insert(name.to_owned())
        {
            return Err("Unsafe Office package path".into());
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Office package symlinks are not supported".into());
        }
        if name.to_ascii_lowercase().ends_with("vbaproject.bin") {
            return Err("Macro-enabled documents are not supported".into());
        }
        declared = declared
            .checked_add(entry.size())
            .ok_or("Office size overflow")?;
        if entry.size() > max_entry || declared > max_total {
            return Err("Expanded Office package exceeds budget".into());
        }
    }
    if !names.contains("[Content_Types].xml") || !names.contains(kind.main()) {
        return Err(format!("Not a {} document", kind.extension()));
    }
    // Verify actual inflated sizes and CRC before browser libraries see the archive.
    let mut actual = 0u64;
    let mut buffer = [0; 64 * 1024];
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let xml = entry.name().ends_with(".xml") || entry.name().ends_with(".rels");
        let mut text = Vec::new();
        let mut entry_size = 0u64;
        loop {
            let n = entry.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            entry_size += n as u64;
            actual += n as u64;
            if entry_size > max_entry || actual > max_total {
                return Err("Expanded Office package exceeds budget".into());
            }
            if xml {
                text.extend_from_slice(&buffer[..n]);
            }
        }
        if entry_size != entry.size() {
            return Err("Incorrect Office entry size".into());
        }
        if xml
            && (text.windows(9).any(|w| w == b"<!DOCTYPE")
                || text.windows(8).any(|w| w == b"<!ENTITY"))
        {
            return Err("XML document type declarations are not supported".into());
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    fn package(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            archive
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap().into_inner()
    }
    #[test]
    fn each_plugin_accepts_only_its_own_package() {
        for kind in [Kind::Word, Kind::Presentation, Kind::Spreadsheet] {
            let bytes = package(&[
                ("[Content_Types].xml", b"<Types/>"),
                (kind.main(), b"<document/>"),
            ]);
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
            validate(&mut archive, kind, 100, 1000, 10).unwrap();
            let wrong = if matches!(kind, Kind::Word) {
                Kind::Spreadsheet
            } else {
                Kind::Word
            };
            assert!(validate(&mut archive, wrong, 100, 1000, 10).is_err());
        }
    }
    #[test]
    fn hostile_paths_macros_and_entities_are_rejected() {
        for (name, body) in [
            ("../escape.xml", &b"<a/>"[..]),
            ("word/vbaProject.bin", &b"macro"[..]),
            ("word/settings.xml", &b"<!DOCTYPE x><x/>"[..]),
        ] {
            let bytes = package(&[
                ("[Content_Types].xml", b"<Types/>"),
                ("word/document.xml", b"<document/>"),
                (name, body),
            ]);
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
            assert!(validate(&mut archive, Kind::Word, 100, 1000, 10).is_err());
        }
    }
    #[test]
    fn inflated_bytes_entry_count_and_file_sizes_are_bounded() {
        let bytes = package(&[
            ("[Content_Types].xml", b"<Types/>"),
            ("xl/workbook.xml", b"<workbook/>"),
        ]);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
        assert!(validate(&mut archive, Kind::Spreadsheet, 5, 1000, 10).is_err());
        assert!(validate(&mut archive, Kind::Spreadsheet, 100, 10, 10).is_err());
        assert!(validate(&mut archive, Kind::Spreadsheet, 100, 1000, 1).is_err());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.xlsx");
        std::fs::write(&path, bytes).unwrap();
        assert_eq!(inspect(&path, Kind::Spreadsheet).unwrap()["format"], "xlsx");
        let file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.set_len(MAX_FILE + 1).unwrap();
        assert!(inspect(&path, Kind::Spreadsheet)
            .unwrap_err()
            .contains("64 MiB"));
    }
}
