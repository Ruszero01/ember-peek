//! What one entry of an archive is, in the shape both this plugin's halves agree on.
//!
//! Names keep the separator and the spelling the archive wrote, minus the parts that would
//! make two different files look identical: backslashes become forward slashes and a leading
//! `/` or `./` is dropped. Nothing here is ever written to disk, so the name is display data
//! rather than a path this process will follow.
use serde_json::{json, Value};

/// One file or directory inside an archive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub dir: bool,
    /// Uncompressed size. Zero for a stream whose length is only known once it is decoded.
    pub size: u64,
    /// Compressed size, or zero when the format does not record one per entry.
    pub packed: u64,
    /// Modification time in seconds since the Unix epoch, when the format carries one.
    pub modified: Option<i64>,
    pub encrypted: bool,
    /// How this entry is stored, for the reader's benefit: `deflate`, `lzma2`, `gzip`…
    pub method: String,
    /// Where the payload sits in the archive's own order. Read requests address the listed
    /// position; a reader uses this to find the stream.
    pub read_index: usize,
}

impl Entry {
    pub fn file(name: String, read_index: usize) -> Self {
        Entry {
            name: normalize(&name),
            dir: false,
            size: 0,
            packed: 0,
            modified: None,
            encrypted: false,
            method: String::new(),
            read_index,
        }
    }

    pub fn directory(name: String, read_index: usize) -> Self {
        Entry {
            dir: true,
            ..Self::file(name, read_index)
        }
    }

    /// The entry as the plugin web view receives it. `read_index` stays here: the view
    /// addresses entries by their listed position and never sees how a format stores them.
    pub fn json(&self) -> Value {
        json!({
            "name": self.name,
            "dir": self.dir,
            "size": self.size,
            "packed": self.packed,
            "modified": self.modified,
            "encrypted": self.encrypted,
            "method": self.method,
        })
    }
}

/// A name as it is shown: forward slashes, no leading `./` or `/`, no trailing slash.
pub fn normalize(name: &str) -> String {
    let mut value = name.replace('\\', "/");
    while let Some(rest) = value.strip_prefix("./") {
        value = rest.to_string();
    }
    while let Some(rest) = value.strip_prefix('/') {
        value = rest.to_string();
    }
    while value.ends_with('/') {
        value.pop();
    }
    value
}

/// Whether a name denotes a directory by its trailing separator, which is how zip, 7z and
/// tar mark one when they carry no explicit directory entry.
pub fn looks_like_directory(name: &str) -> bool {
    name.ends_with('/') || name.ends_with('\\')
}

/// Seconds since the Unix epoch for a calendar date. The civil-date arithmetic is Howard
/// Hinnant's, so the conversion stays correct for the 1980–2107 range these formats store
/// without pulling in a date library.
pub fn unix_from_parts(
    year: i64,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = month as i64;
    let day = day as i64;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era - 719_468;
    days * 86_400 + hour as i64 * 3600 + minute as i64 * 60 + second as i64
}

/// A packed MS-DOS date and time, as zip and rar headers carry it.
pub fn unix_from_dos(packed: u32) -> Option<i64> {
    let second = (packed & 0x1f) * 2;
    let minute = (packed >> 5) & 0x3f;
    let hour = (packed >> 11) & 0x1f;
    let day = (packed >> 16) & 0x1f;
    let month = (packed >> 21) & 0x0f;
    let year = ((packed >> 25) & 0x7f) + 1980;
    if day == 0 || month == 0 || month > 12 || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some(unix_from_parts(
        year as i64,
        month,
        day,
        hour,
        minute,
        second,
    ))
}

/// A Windows FILETIME (100 ns ticks since 1601) as seconds since the Unix epoch.
pub fn unix_from_filetime(ticks: u64) -> Option<i64> {
    if ticks == 0 {
        return None;
    }
    Some((ticks / 10_000_000) as i64 - 11_644_473_600)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_shown_the_way_a_reader_expects_them() {
        assert_eq!(normalize("./dir\\file.txt"), "dir/file.txt");
        assert_eq!(normalize("/abs/"), "abs");
        assert_eq!(normalize("a//b"), "a//b");
        assert!(looks_like_directory("dir/"));
        assert!(looks_like_directory("dir\\"));
    }

    #[test]
    fn calendar_conversion_matches_known_instants() {
        assert_eq!(unix_from_parts(1970, 1, 1, 0, 0, 0), 0);
        assert_eq!(unix_from_parts(2000, 1, 1, 0, 0, 0), 946_684_800);
        // 2024-05-06 07:08:10, in all three encodings the formats use.
        assert_eq!(unix_from_parts(2024, 5, 6, 7, 8, 10), 1_714_979_290);
        let packed =
            ((2024 - 1980) << 25) | (5 << 21) | (6 << 16) | (7 << 11) | (8 << 5) | (10 / 2);
        assert_eq!(unix_from_dos(packed), Some(1_714_979_290));
        assert_eq!(unix_from_dos(0), None);
        assert_eq!(
            unix_from_filetime(133_594_528_900_000_000),
            Some(1_714_979_290)
        );
        assert_eq!(unix_from_filetime(0), None);
    }

    #[test]
    fn entries_serialize_without_their_read_position() {
        let entry = Entry {
            size: 12,
            packed: 5,
            modified: Some(1),
            method: "deflate".into(),
            ..Entry::file("a.txt".into(), 7)
        };
        let value = entry.json();
        assert_eq!(value["name"], "a.txt");
        assert_eq!(value["size"], 12);
        assert!(value.get("read_index").is_none() && value.get("readIndex").is_none());
    }
}
