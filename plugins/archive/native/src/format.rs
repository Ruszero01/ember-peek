//! Which container a file is, decided from its bytes first and its name second.
//!
//! The bytes win because an archive is often renamed — a `.zip` that is really a 7z, a `.rar`
//! that is really a zip — and a listing that guessed from the name alone would fail on the
//! first header it read. The name only decides when no signature matches, which is the case
//! for tar (its marker sits 257 bytes in) and for the codecs whose files carry the compressed
//! stream without a distinguishing name.
use std::path::Path;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Format {
    Zip,
    SevenZip,
    Rar,
    Tar,
    Gzip,
    Bzip2,
    Xz,
    Zstd,
    Lz4,
    Cab,
}

impl Format {
    /// The stable id the plugin web view branches on.
    pub fn id(self) -> &'static str {
        match self {
            Format::Zip => "zip",
            Format::SevenZip => "7z",
            Format::Rar => "rar",
            Format::Tar => "tar",
            Format::Gzip => "gz",
            Format::Bzip2 => "bz2",
            Format::Xz => "xz",
            Format::Zstd => "zst",
            Format::Lz4 => "lz4",
            Format::Cab => "cab",
        }
    }

    /// The name of the codec, as a status line or an entry's method shows it.
    pub fn codec(self) -> &'static str {
        match self {
            Format::Zip => "deflate",
            Format::SevenZip => "lzma2",
            Format::Rar => "rar",
            Format::Tar => "stored",
            Format::Gzip => "gzip",
            Format::Bzip2 => "bzip2",
            Format::Xz => "xz",
            Format::Zstd => "zstd",
            Format::Lz4 => "lz4",
            Format::Cab => "mszip",
        }
    }

    /// The container's name as a sentence about a file would write it.
    pub fn label(self) -> &'static str {
        match self {
            Format::Zip => "ZIP",
            Format::SevenZip => "7z",
            Format::Rar => "RAR",
            Format::Tar => "TAR",
            Format::Gzip => "GZip",
            Format::Bzip2 => "BZip2",
            Format::Xz => "XZ",
            Format::Zstd => "Zstandard",
            Format::Lz4 => "LZ4",
            Format::Cab => "CAB",
        }
    }
}

/// The first bytes an archive is recognised by. `prefix` is a bounded read of the file.
pub fn signature(prefix: &[u8]) -> Option<Format> {
    let starts = |magic: &[u8]| prefix.starts_with(magic);
    if starts(b"PK\x03\x04") || starts(b"PK\x05\x06") || starts(b"PK\x07\x08") {
        return Some(Format::Zip);
    }
    if starts(b"7z\xbc\xaf\x27\x1c") {
        return Some(Format::SevenZip);
    }
    if starts(b"Rar!\x1a\x07\x00") || starts(b"Rar!\x1a\x07\x01\x00") {
        return Some(Format::Rar);
    }
    if starts(b"\x1f\x8b") {
        return Some(Format::Gzip);
    }
    if starts(b"BZh") {
        return Some(Format::Bzip2);
    }
    if starts(b"\xfd7zXZ\x00") {
        return Some(Format::Xz);
    }
    if starts(b"\x28\xb5\x2f\xfd") {
        return Some(Format::Zstd);
    }
    if starts(b"\x04\x22\x4d\x18") {
        return Some(Format::Lz4);
    }
    if starts(b"MSCF") {
        return Some(Format::Cab);
    }
    if is_tar(prefix) {
        return Some(Format::Tar);
    }
    None
}

/// Whether a block of bytes begins a tar stream. The `ustar` marker is what a modern tar
/// writes; the checksum rule is what the original format defined, and it is the only way to
/// recognise the archives written before that marker existed.
pub fn is_tar(prefix: &[u8]) -> bool {
    if prefix.len() < 512 {
        return false;
    }
    if &prefix[257..262] == b"ustar" {
        return true;
    }
    tar_checksum(prefix)
}

/// The header checksum: the sum of the 512-byte header's bytes with the checksum field
/// itself read as spaces. A wrong header almost never sums to the stored value.
fn tar_checksum(header: &[u8]) -> bool {
    let stored = match header.get(148..156) {
        Some(field) => match std::str::from_utf8(field).ok().and_then(|text| {
            let trimmed = text.trim_matches(|c: char| c == '\0' || c == ' ');
            if trimmed.is_empty() {
                None
            } else {
                u64::from_str_radix(trimmed, 8).ok()
            }
        }) {
            Some(value) => value,
            None => return false,
        },
        None => return false,
    };
    let sum: u64 = header[..512]
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            if (148..156).contains(&index) {
                b' ' as u64
            } else {
                *byte as u64
            }
        })
        .sum();
    sum == stored
}

/// The format an extension promises, used when the bytes carry no signature of their own.
pub fn from_extension(path: &Path) -> Option<Format> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    let extension = name.rsplit_once('.').map(|(_, tail)| tail)?;
    Some(match extension {
        // Containers that are zip by construction: the format is the point, not the suffix.
        "zip" | "zipx" | "jar" | "war" | "ear" | "aar" | "apk" | "xpi" | "crx" | "vsix"
        | "nupkg" | "whl" | "epub" | "cbz" | "ipa" | "kmz" => Format::Zip,
        "7z" => Format::SevenZip,
        "rar" | "cbr" => Format::Rar,
        "tar" => Format::Tar,
        "gz" | "tgz" | "taz" => Format::Gzip,
        "bz2" | "tbz" | "tbz2" | "tb2" => Format::Bzip2,
        "xz" | "txz" => Format::Xz,
        "zst" | "tzst" => Format::Zstd,
        "lz4" | "tlz4" => Format::Lz4,
        "cab" => Format::Cab,
        _ => return None,
    })
}

/// The format a file is read as: its signature, else what its name claims.
pub fn detect(path: &Path, prefix: &[u8]) -> Option<Format> {
    signature(prefix).or_else(|| from_extension(path))
}

/// The name a single-file codec's payload should be shown under: the name the gzip header
/// recorded when it has one, else the file's own name minus the codec suffix.
pub fn payload_name(path: &Path, prefix: &[u8]) -> String {
    if let Some(name) = gzip_name(prefix) {
        return name;
    }
    let file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("payload");
    let lowered = file.to_ascii_lowercase();
    // Only the codec suffix comes off: what is left of `archive.tar.xz` is `archive.tar`,
    // which is what the stream inside actually holds.
    for suffix in [
        ".tgz", ".tbz2", ".tbz", ".txz", ".tzst", ".taz", ".gz", ".bz2", ".xz", ".zst", ".lz4",
    ] {
        if lowered.ends_with(suffix) && lowered.len() > suffix.len() {
            return file[..file.len() - suffix.len()].to_string();
        }
    }
    format!("{file}.out")
}

/// The original file name a gzip header records, when the writer stored one.
pub fn gzip_name(prefix: &[u8]) -> Option<String> {
    if prefix.len() < 10 || &prefix[..2] != b"\x1f\x8b" {
        return None;
    }
    // The flags byte says whether optional fields are present, in the order the format
    // defines: name, comment, header CRC, then the compressed data.
    let flags = prefix[3];
    let mut cursor = 10usize;
    if flags & 0x04 != 0 {
        let length = u16::from_le_bytes([*prefix.get(cursor)?, *prefix.get(cursor + 1)?]) as usize;
        cursor += 2 + length;
    }
    if flags & 0x08 == 0 {
        return None;
    }
    let end = prefix[cursor..].iter().position(|byte| *byte == 0)? + cursor;
    let name = String::from_utf8_lossy(&prefix[cursor..end]).to_string();
    let trimmed = name.replace('\\', "/");
    let trimmed = trimmed.trim_matches('/');
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tar_header() -> Vec<u8> {
        let mut header = vec![0u8; 512];
        header[..6].copy_from_slice(b"a.txt\0");
        header[100..108].copy_from_slice(b"0000644\0");
        header[124..136].copy_from_slice(b"00000000012\0");
        header[257..263].copy_from_slice(b"ustar\0");
        header
    }

    #[test]
    fn signatures_win_over_names() {
        let renamed = PathBuf::from("photos.zip");
        assert_eq!(
            detect(&renamed, b"7z\xbc\xaf\x27\x1c\x00\x04"),
            Some(Format::SevenZip)
        );
        assert_eq!(detect(&renamed, b"PK\x03\x04rest"), Some(Format::Zip));
        assert_eq!(detect(&renamed, b"nothing here"), Some(Format::Zip));
        assert_eq!(detect(PathBuf::from("x.bin").as_path(), b"nothing"), None);
    }

    #[test]
    fn archive_flavours_are_zip_containers() {
        for name in ["a.jar", "b.APK", "c.epub", "d.cbz", "e.nupkg", "f.whl"] {
            assert_eq!(
                from_extension(PathBuf::from(name).as_path()),
                Some(Format::Zip),
                "{name}"
            );
        }
        assert_eq!(
            from_extension(PathBuf::from("bundle.tar.zst").as_path()),
            Some(Format::Zstd)
        );
        assert_eq!(
            from_extension(PathBuf::from("no-extension").as_path()),
            None
        );
    }

    #[test]
    fn tar_is_recognised_by_marker_and_by_checksum() {
        let mut header = tar_header();
        assert!(is_tar(&header));
        header[257..263].copy_from_slice(b"      ");
        let sum: u64 = header
            .iter()
            .enumerate()
            .map(|(index, byte)| {
                if (148..156).contains(&index) {
                    b' ' as u64
                } else {
                    *byte as u64
                }
            })
            .sum();
        let field = format!("{sum:06o}\0 ");
        header[148..156].copy_from_slice(field.as_bytes());
        assert!(is_tar(&header));
        header[148..156].copy_from_slice(b"0000000\0");
        assert!(!is_tar(&header));
        assert!(!is_tar(&header[..100]));
    }

    #[test]
    fn single_files_are_named_from_their_header_or_their_own_name() {
        assert_eq!(
            payload_name(PathBuf::from("notes.txt.gz").as_path(), b"\x1f\x8b"),
            "notes.txt"
        );
        let mut with_name = b"\x1f\x8b\x08\x08\x00\x00\x00\x00\x00\x03".to_vec();
        with_name.extend_from_slice(b"inner/report.csv\0");
        assert_eq!(
            payload_name(PathBuf::from("x.gz").as_path(), &with_name),
            "inner/report.csv"
        );
        assert_eq!(
            payload_name(PathBuf::from("archive.tar.xz").as_path(), b"\xfd7zXZ\x00"),
            "archive.tar"
        );
        assert_eq!(
            payload_name(PathBuf::from("README").as_path(), b"\x28\xb5\x2f\xfd"),
            "README.out"
        );
    }
}
