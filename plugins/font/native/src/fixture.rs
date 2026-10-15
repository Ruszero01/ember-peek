//! Synthetic font files for tests.
//!
//! Every container this plugin claims is built here from the same table set, so a test compares
//! containers rather than fixtures: the tables are hand-written and tiny, which means a decoding
//! bug shows up as a wrong table instead of as a font that fails to load for an unknown reason.
//! Nothing here is copied from a real font, so no font licence travels with the repository.

#![cfg(test)]

use crate::container::build_sfnt;

const SFNT: u32 = 0x0001_0000;

/// The code points the fixture font encodes, mapped to glyph ids 1.. in this order.
pub const COVERED: [u32; 6] = [0x20, 0x41, 0x42, 0x43, 0x4e00, 0x1f600];

/// A cmap range covering the surrogate block is legal in the file format and common in real
/// fonts, and encodes no character: the fixture carries one so the filter that drops it is
/// exercised by every coverage test. Its glyph is therefore unreachable.
const SURROGATES: (u32, u32, u32) = (0xd800, 0xdfff, 7);

/// Write fixture bytes where `FontFile::open` can read them.
///
/// Every call gets a file of its own, whatever name it asks for: tests run in parallel, and two
/// of them writing one name would read each other's half-written fixture.
pub fn write(name: &str, bytes: &[u8]) -> String {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("ember-font-fixture-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{}-{name}", NEXT.fetch_add(1, Ordering::Relaxed)));
    std::fs::write(&path, bytes).unwrap();
    path.to_string_lossy().into_owned()
}

/// Every code point the face's Unicode subtables encode, sorted — including what is not a
/// character, which is what makes it a check on the filter that drops those.
pub fn raw_points(face: &ttf_parser::Face) -> Vec<u32> {
    let mut points = Vec::new();
    if let Some(cmap) = face.tables().cmap {
        for subtable in cmap.subtables {
            if subtable.is_unicode() {
                subtable.codepoints(|point| points.push(point));
            }
        }
    }
    points.sort_unstable();
    points.dedup();
    points
}

/// The characters the face encodes: what the interface is allowed to show.
pub fn covered(face: &ttf_parser::Face) -> Vec<u32> {
    raw_points(face)
        .into_iter()
        .filter(|point| !(0xd800..=0xdfff).contains(point))
        .collect()
}

/// The face's family name as the Windows platform records it.
pub fn family(face: &ttf_parser::Face) -> String {
    face.names()
        .into_iter()
        .find(|name| name.name_id == ttf_parser::name_id::FAMILY && name.is_unicode())
        .and_then(|name| name.to_string())
        .unwrap_or_default()
}

/// A whole font in one sfnt, at the given em size.
pub fn sfnt_with(units_per_em: u16) -> Vec<u8> {
    build_sfnt(SFNT, tables(units_per_em)).unwrap()
}

pub fn sfnt() -> Vec<u8> {
    sfnt_with(1000)
}

/// Two faces sharing one file: the shape a collection exists for. A face's table records hold
/// offsets from the start of the file, because faces share tables, so they are rebased here.
pub fn collection() -> Vec<u8> {
    let faces = [sfnt_with(1000), sfnt_with(1001)];
    let header = 12 + faces.len() * 4;
    let mut starts = Vec::new();
    let mut at = header;
    for face in &faces {
        starts.push(at);
        at += face.len();
    }
    let mut out = Vec::new();
    out.extend_from_slice(b"ttcf");
    out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
    out.extend_from_slice(&(faces.len() as u32).to_be_bytes());
    for start in &starts {
        out.extend_from_slice(&(*start as u32).to_be_bytes());
    }
    for (face, start) in faces.iter().zip(&starts) {
        let mut face = face.clone();
        let tables = u16::from_be_bytes([face[4], face[5]]) as usize;
        for index in 0..tables {
            let record = 12 + index * 16 + 8;
            let offset = u32::from_be_bytes(face[record..record + 4].try_into().unwrap());
            face[record..record + 4].copy_from_slice(&(offset + *start as u32).to_be_bytes());
        }
        out.extend_from_slice(&face);
    }
    out
}

/// A WOFF: every table deflated on its own, the way the format stores them. A table whose
/// deflated form is not smaller is stored as it is, which the format requires and which is what
/// happens to the small tables here.
pub fn woff() -> Vec<u8> {
    use std::io::Write;
    let tables = tables(1000);
    let sfnt_size = build_sfnt(SFNT, tables.clone()).unwrap().len();
    let mut stored = Vec::new();
    let mut records = Vec::new();
    let mut at = 44 + tables.len() * 20;
    for (tag, data) in &tables {
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data).unwrap();
        let packed = encoder.finish().unwrap();
        let payload = if packed.len() < data.len() {
            packed
        } else {
            data.clone()
        };
        records.push((*tag, at, payload.len(), data.len()));
        at += (payload.len() + 3) & !3;
        stored.push(payload);
    }
    let mut out = Vec::new();
    out.extend_from_slice(b"wOFF");
    out.extend_from_slice(&SFNT.to_be_bytes());
    out.extend_from_slice(&(at as u32).to_be_bytes());
    out.extend_from_slice(&(tables.len() as u16).to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    out.extend_from_slice(&(sfnt_size as u32).to_be_bytes());
    out.extend_from_slice(&1u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    for _ in 0..5 {
        out.extend_from_slice(&0u32.to_be_bytes());
    }
    for (tag, offset, packed, original) in &records {
        out.extend_from_slice(tag);
        out.extend_from_slice(&(*offset as u32).to_be_bytes());
        out.extend_from_slice(&(*packed as u32).to_be_bytes());
        out.extend_from_slice(&(*original as u32).to_be_bytes());
        out.extend_from_slice(&0u32.to_be_bytes());
    }
    for packed in &stored {
        out.extend_from_slice(packed);
        while out.len() % 4 != 0 {
            out.push(0);
        }
    }
    out
}

/// A WOFF2 holding one face, with a transformed `glyf` the decoder has to leave behind.
pub fn woff2() -> Vec<u8> {
    let mut entries = Vec::new();
    for (tag, data) in tables(1000) {
        entries.push(Woff2Entry::plain(tag, data));
    }
    entries.push(Woff2Entry::transformed(
        *b"glyf",
        9999,
        b"triplet-encoded outlines".to_vec(),
    ));
    woff2_file(SFNT, &[entries])
}

/// A WOFF2 collection: two faces whose tables share one directory and one stream.
pub fn woff2_collection() -> Vec<u8> {
    let mut first = Vec::new();
    let mut second = Vec::new();
    for (tag, data) in tables(1000) {
        first.push(Woff2Entry::plain(tag, data));
    }
    for (tag, data) in tables(1001) {
        second.push(Woff2Entry::plain(tag, data));
    }
    woff2_file(u32::from_be_bytes(*b"ttcf"), &[first, second])
}

/// A Macintosh suitcase: one `sfnt` resource in a resource fork.
pub fn suitcase() -> Vec<u8> {
    let face = sfnt_with(1000);
    let data_start = 256usize;
    let mut data = Vec::new();
    data.extend_from_slice(&(face.len() as u32).to_be_bytes());
    data.extend_from_slice(&face);
    while data.len() % 4 != 0 {
        data.push(0);
    }
    // The map is a header copy, then the type list and one reference to the resource.
    let mut map = vec![0u8; 28];
    map.extend_from_slice(&0u16.to_be_bytes()); // one type follows the count field
    map.extend_from_slice(b"sfnt");
    map.extend_from_slice(&0u16.to_be_bytes()); // one resource
    map.extend_from_slice(&10u16.to_be_bytes()); // references begin after this entry
    map.extend_from_slice(&128u16.to_be_bytes()); // resource id
    map.extend_from_slice(&0xffffu16.to_be_bytes()); // no name
    map.push(0); // attributes
    map.extend_from_slice(&[0, 0, 0]); // data at the start of the data area
    map.extend_from_slice(&0u32.to_be_bytes()); // reserved handle
    let map_start = data_start + data.len();
    let mut out = vec![0u8; data_start];
    out[0..4].copy_from_slice(&(data_start as u32).to_be_bytes());
    out[4..8].copy_from_slice(&(map_start as u32).to_be_bytes());
    out[8..12].copy_from_slice(&(data.len() as u32).to_be_bytes());
    out[12..16].copy_from_slice(&(map.len() as u32).to_be_bytes());
    out.extend_from_slice(&data);
    let map_at = out.len();
    out.extend_from_slice(&map);
    out[map_at + 16..map_at + 20].copy_from_slice(&(data.len() as u32).to_be_bytes());
    out[map_at + 24..map_at + 26].copy_from_slice(&28u16.to_be_bytes());
    out[map_at + 26..map_at + 28].copy_from_slice(&38u16.to_be_bytes());
    out
}

/// One WOFF2 directory entry, in the shape the format encodes.
struct Woff2Entry {
    tag: [u8; 4],
    /// Set for a table the encoder transformed; the decoder is expected to skip those.
    transform: Option<usize>,
    data: Vec<u8>,
    original: usize,
}

impl Woff2Entry {
    fn plain(tag: [u8; 4], data: Vec<u8>) -> Woff2Entry {
        let original = data.len();
        Woff2Entry {
            tag,
            transform: None,
            data,
            original,
        }
    }

    fn transformed(tag: [u8; 4], original: usize, data: Vec<u8>) -> Woff2Entry {
        Woff2Entry {
            tag,
            transform: Some(data.len()),
            data,
            original,
        }
    }
}

/// Assemble a WOFF2 around a brotli stream of the given faces' tables.
fn woff2_file(flavor: u32, faces: &[Vec<Woff2Entry>]) -> Vec<u8> {
    let mut directory = Vec::new();
    let mut stream = Vec::new();
    let mut entries_seen = 0usize;
    let mut offsets = Vec::new();
    for face in faces {
        let mut face_offsets = Vec::new();
        for entry in face {
            // The index a collection names is the entry's number in the table directory, not a
            // byte position in it.
            face_offsets.push((entries_seen, entry.tag, entry.transform, entry.original));
            entries_seen += 1;
            let index = known_tag_index(&entry.tag);
            // Every transform in this fixture is the null one for the tables that define a
            // transform, which is version 0 for anything that is not glyf or loca. The glyf
            // entry is the transformed one, and its version is zero for the opposite reason.
            let version = 0u8;
            if index == 63 {
                directory.push(63);
                directory.extend_from_slice(&entry.tag);
            } else {
                directory.push(index | (version << 6));
            }
            base128(&mut directory, entry.original);
            if let Some(length) = entry.transform {
                base128(&mut directory, length);
            }
            stream.extend_from_slice(&entry.data);
        }
        offsets.push(face_offsets);
    }
    let mut out = Vec::new();
    out.extend_from_slice(b"wOF2");
    out.extend_from_slice(&flavor.to_be_bytes());
    out.extend_from_slice(&0u32.to_be_bytes()); // total file length, filled in below
    out.extend_from_slice(&(offsets.iter().map(Vec::len).sum::<usize>() as u16).to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    out.extend_from_slice(&(stream.len() as u32).to_be_bytes());
    out.extend_from_slice(&(stream.len() as u32).to_be_bytes());
    out.extend_from_slice(&1u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    for _ in 0..5 {
        out.extend_from_slice(&0u32.to_be_bytes());
    }
    out.extend_from_slice(&directory);
    if flavor == u32::from_be_bytes(*b"ttcf") {
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        collection_count(&mut out, faces.len());
        for (at, face) in faces.iter().enumerate() {
            collection_count(&mut out, face.len());
            out.extend_from_slice(&SFNT.to_be_bytes());
            for entry in face {
                let index = offsets[at]
                    .iter()
                    .find(|(_, tag, _, _)| tag == &entry.tag)
                    .map(|(index, _, _, _)| *index)
                    .unwrap();
                collection_count(&mut out, index);
            }
        }
    }
    let mut compressed = Vec::new();
    brotli::BrotliCompress(
        &mut stream.as_slice(),
        &mut compressed,
        &brotli::enc::BrotliEncoderParams::default(),
    )
    .unwrap();
    out.extend_from_slice(&compressed);
    let length = out.len() as u32;
    out[8..12].copy_from_slice(&length.to_be_bytes());
    out[20..24].copy_from_slice(&(compressed.len() as u32).to_be_bytes());
    out
}

/// WOFF2 writes a count of 253 or more through its own escape.
fn collection_count(out: &mut Vec<u8>, value: usize) {
    if value < 253 {
        out.push(value as u8);
    } else {
        out.push(253);
        out.extend_from_slice(&(value as u16).to_be_bytes());
    }
}

fn base128(out: &mut Vec<u8>, mut value: usize) {
    let mut bytes = vec![(value & 0x7f) as u8];
    value >>= 7;
    while value > 0 {
        bytes.push(((value & 0x7f) as u8) | 0x80);
        value >>= 7;
    }
    bytes.reverse();
    out.extend_from_slice(&bytes);
}

fn known_tag_index(tag: &[u8; 4]) -> u8 {
    const TAGS: [&[u8; 4]; 63] = [
        b"cmap", b"head", b"hhea", b"hmtx", b"maxp", b"name", b"OS/2", b"post", b"cvt ", b"fpgm",
        b"glyf", b"loca", b"prep", b"CFF ", b"VORG", b"EBDT", b"EBLC", b"gasp", b"hdmx", b"kern",
        b"LTSH", b"PCLT", b"VDMX", b"vhea", b"vmtx", b"BASE", b"GDEF", b"GPOS", b"GSUB", b"EBSC",
        b"JSTF", b"MATH", b"CBDT", b"CBLC", b"COLR", b"CPAL", b"SVG ", b"sbix", b"acnt", b"avar",
        b"bdat", b"bloc", b"bsln", b"cvar", b"fdsc", b"feat", b"fmtx", b"fvar", b"gvar", b"hsty",
        b"just", b"lcar", b"mort", b"morx", b"opbd", b"prop", b"trak", b"Zapf", b"Silf", b"Glat",
        b"Gloc", b"Feat", b"Sill",
    ];
    TAGS.iter()
        .position(|known| *known == tag)
        .map(|at| at as u8)
        .unwrap_or(63)
}

/// The tables every fixture face is made of. Small on purpose, but each one carries a fact the
/// facts builder reads: names, metrics, style, and the coverage the glyph case is built from.
fn tables(units_per_em: u16) -> Vec<([u8; 4], Vec<u8>)> {
    // One `.notdef`, one glyph per covered character, and the glyph the surrogate range names.
    let glyphs = COVERED.len() as u16 + 2;
    vec![
        (*b"head", head(units_per_em)),
        (*b"hhea", hhea(glyphs)),
        (*b"maxp", maxp(glyphs)),
        (*b"hmtx", hmtx(glyphs)),
        (*b"cmap", cmap()),
        (*b"name", name()),
        (*b"OS/2", os2(glyphs)),
        (*b"post", post()),
    ]
}

fn head(units_per_em: u16) -> Vec<u8> {
    let mut out = vec![0u8; 54];
    out[0..4].copy_from_slice(&0x0001_0000u32.to_be_bytes());
    out[4..8].copy_from_slice(&0x0001_0000u32.to_be_bytes());
    out[12..16].copy_from_slice(&0x5f0f_3cf5u32.to_be_bytes());
    out[18..20].copy_from_slice(&units_per_em.to_be_bytes());
    out[36..38].copy_from_slice(&0i16.to_be_bytes());
    out[38..40].copy_from_slice(&(-200i16).to_be_bytes());
    out[40..42].copy_from_slice(&1000i16.to_be_bytes());
    out[42..44].copy_from_slice(&800i16.to_be_bytes());
    out
}

fn hhea(glyphs: u16) -> Vec<u8> {
    let mut out = vec![0u8; 36];
    out[0..4].copy_from_slice(&0x0001_0000u32.to_be_bytes());
    out[4..6].copy_from_slice(&800i16.to_be_bytes());
    out[6..8].copy_from_slice(&(-200i16).to_be_bytes());
    out[10..12].copy_from_slice(&600u16.to_be_bytes());
    out[34..36].copy_from_slice(&glyphs.to_be_bytes());
    out
}

fn maxp(glyphs: u16) -> Vec<u8> {
    let mut out = vec![0u8; 6];
    out[0..4].copy_from_slice(&0x0000_5000u32.to_be_bytes());
    out[4..6].copy_from_slice(&glyphs.to_be_bytes());
    out
}

fn hmtx(glyphs: u16) -> Vec<u8> {
    let mut out = Vec::new();
    for glyph in 0..glyphs {
        out.extend_from_slice(&(400 + glyph * 10).to_be_bytes());
        out.extend_from_slice(&20i16.to_be_bytes());
    }
    out
}

/// A format 12 cmap: the simplest subtable that covers the astral planes the fixture uses.
/// Groups must ascend, which is why the surrogate one is sorted into place rather than appended.
fn cmap() -> Vec<u8> {
    // Version, one encoding record (Windows, full repertoire), and a subtable right after it.
    let mut out = vec![0u8; 12];
    out[2..4].copy_from_slice(&1u16.to_be_bytes());
    out[4..6].copy_from_slice(&3u16.to_be_bytes());
    out[6..8].copy_from_slice(&10u16.to_be_bytes());
    out[8..12].copy_from_slice(&12u32.to_be_bytes());
    let mut groups: Vec<(u32, u32, u32)> = COVERED
        .iter()
        .enumerate()
        .map(|(at, point)| (*point, *point, at as u32 + 1))
        .collect();
    groups.push(SURROGATES);
    groups.sort_unstable();
    let mut sub = Vec::new();
    sub.extend_from_slice(&12u16.to_be_bytes());
    sub.extend_from_slice(&0u16.to_be_bytes());
    sub.extend_from_slice(&((16 + groups.len() * 12) as u32).to_be_bytes());
    sub.extend_from_slice(&0u32.to_be_bytes());
    sub.extend_from_slice(&(groups.len() as u32).to_be_bytes());
    for group in &groups {
        sub.extend_from_slice(&group.0.to_be_bytes());
        sub.extend_from_slice(&group.1.to_be_bytes());
        sub.extend_from_slice(&group.2.to_be_bytes());
    }
    out.extend_from_slice(&sub);
    out
}

fn name() -> Vec<u8> {
    let records = [
        (1u16, "Fixture Sans"),
        (2, "Regular"),
        (4, "Fixture Sans Regular"),
        (5, "Version 1.000"),
        (6, "FixtureSans-Regular"),
        (9, "A Name"),
        (13, "Licensed for fixtures"),
    ];
    // Windows, Unicode BMP, US English: the records a parser reads as text.
    let mut strings = Vec::new();
    let mut table = Vec::new();
    table.extend_from_slice(&0u16.to_be_bytes());
    table.extend_from_slice(&(records.len() as u16).to_be_bytes());
    table.extend_from_slice(&((6 + records.len() * 12) as u16).to_be_bytes());
    for (id, text) in records {
        let mut utf16 = Vec::new();
        for unit in text.encode_utf16() {
            utf16.extend_from_slice(&unit.to_be_bytes());
        }
        table.extend_from_slice(&3u16.to_be_bytes());
        table.extend_from_slice(&1u16.to_be_bytes());
        table.extend_from_slice(&0x0409u16.to_be_bytes());
        table.extend_from_slice(&id.to_be_bytes());
        table.extend_from_slice(&(utf16.len() as u16).to_be_bytes());
        table.extend_from_slice(&(strings.len() as u16).to_be_bytes());
        strings.extend_from_slice(&utf16);
    }
    table.extend_from_slice(&strings);
    table
}

/// An OS/2 v4 table: the style facts and the metrics a specimen quotes, at the offsets the
/// format puts them.
fn os2(glyphs: u16) -> Vec<u8> {
    let mut out = vec![0u8; 96];
    out[0..2].copy_from_slice(&4u16.to_be_bytes());
    out[4..6].copy_from_slice(&400u16.to_be_bytes());
    out[6..8].copy_from_slice(&5u16.to_be_bytes());
    out[58..62].copy_from_slice(b"FIXT");
    out[64..66].copy_from_slice(&0x20u16.to_be_bytes());
    out[66..68].copy_from_slice(&0xffffu16.to_be_bytes());
    out[68..70].copy_from_slice(&800i16.to_be_bytes());
    out[70..72].copy_from_slice(&(-200i16).to_be_bytes());
    out[72..74].copy_from_slice(&0i16.to_be_bytes());
    out[74..76].copy_from_slice(&800u16.to_be_bytes());
    out[76..78].copy_from_slice(&200u16.to_be_bytes());
    out[78..82].copy_from_slice(&1u32.to_be_bytes());
    out[86..88].copy_from_slice(&500i16.to_be_bytes());
    out[88..90].copy_from_slice(&700i16.to_be_bytes());
    out[90..92].copy_from_slice(&0u16.to_be_bytes());
    out[92..94].copy_from_slice(&0x20u16.to_be_bytes());
    let _ = glyphs;
    out
}

fn post() -> Vec<u8> {
    let mut out = vec![0u8; 32];
    out[0..4].copy_from_slice(&0x0003_0000u32.to_be_bytes());
    out
}
