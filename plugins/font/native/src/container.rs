//! From a font file on disk to tables a parser can read.
//!
//! Font containers agree on what a table is and disagree on how to store it: a raw sfnt keeps
//! them as they are, a collection points one directory at several offset tables, WOFF deflates
//! each table on its own, WOFF2 brotli-compresses all of them as one stream, and a Macintosh
//! suitcase hides each face in a resource fork. This module recognizes the container and hands
//! every face to the parser as one standalone sfnt, so exactly one shape is ever parsed.
//!
//! Reconstruction is deliberately partial for WOFF2. The browser rasterizes the font from the
//! file itself, so the outline tables (`glyf`, `loca`, `CFF `) — most of a font's bytes — are
//! never rebuilt here. That keeps a web font's parse copy in the hundreds of kilobytes instead
//! of tens of megabytes, and it costs nothing: nothing in this plugin draws a glyph.

use std::ops::Range;

/// A file larger than this is refused before it is read. Real fonts are far smaller; the limit
/// is here so a mislabeled archive cannot be pulled into memory.
pub const MAX_FILE: u64 = 256 * 1024 * 1024;
/// Ceiling on one reconstructed font. A container header that asks for more than this is
/// corrupt or hostile, and either way the answer is the same.
const MAX_SFNT: usize = 512 * 1024 * 1024;
/// The tables a parse needs. Outlines are absent on purpose: only the browser needs them.
const PARSE_TABLES: [&[u8; 4]; 10] = [
    b"head", b"hhea", b"maxp", b"cmap", b"name", b"OS/2", b"post", b"hmtx", b"fvar", b"STAT",
];

const SFNT: u32 = 0x0001_0000;
const TRUE: u32 = 0x7472_7565;
const TYP1: u32 = 0x7479_7031;
const OTTO: u32 = 0x4f54_544f;
const TTCF: u32 = 0x7474_6366;
const WOFF: u32 = 0x774f_4646;
const WOFF2: u32 = 0x774f_4632;

/// One font file, opened once for the lifetime of a preview session.
#[derive(Debug)]
pub struct FontFile {
    /// Raw bytes for the containers that keep their tables: sfnt, collection, suitcase.
    bytes: Vec<u8>,
    /// Standalone sfnt bytes per face for the containers that have to be decoded first.
    decoded: Vec<Vec<u8>>,
    /// Where one face of a suitcase sits inside `bytes`.
    slices: Vec<Range<usize>>,
    /// How to reach a face. The containers differ in this and in nothing else.
    shape: Shape,
    container: &'static str,
}

#[derive(PartialEq, Eq, Clone, Copy, Debug)]
enum Shape {
    /// `Face::parse(&bytes, index)`: one sfnt, or a collection of them.
    Directory,
    /// Each face is `bytes[slices[index]]`.
    Sliced,
    /// Each face is its own decoded buffer.
    Buffers,
}

impl FontFile {
    /// Read and identify a font file. Bytes that are not a font container are rejected here
    /// rather than parsed as one, so the caller can tell the host this plugin does not apply.
    pub fn open(path: &str) -> Result<FontFile, String> {
        let size = std::fs::metadata(path)
            .map_err(|error| error.to_string())?
            .len();
        if size > MAX_FILE {
            return Err(format!("font-too-large:{}", MAX_FILE / 1024 / 1024));
        }
        if size < 16 {
            return Err("font-truncated:16".into());
        }
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        let magic = read_u32(&bytes, 0).ok_or("font-truncated:4")?;
        match magic {
            SFNT | TRUE | TYP1 | OTTO => Ok(FontFile {
                bytes,
                decoded: Vec::new(),
                slices: Vec::new(),
                shape: Shape::Directory,
                container: "sfnt",
            }),
            TTCF => {
                // The directory is read once here so a broken collection is refused before any
                // face is looked at; the parser walks the same offsets for itself afterwards.
                collection_offsets(&bytes)?;
                Ok(FontFile {
                    bytes,
                    decoded: Vec::new(),
                    slices: Vec::new(),
                    shape: Shape::Directory,
                    container: "collection",
                })
            }
            WOFF => Ok(FontFile {
                bytes: Vec::new(),
                decoded: vec![decode_woff(&bytes)?],
                slices: Vec::new(),
                shape: Shape::Buffers,
                container: "woff",
            }),
            WOFF2 => Ok(FontFile {
                bytes: Vec::new(),
                decoded: decode_woff2(&bytes)?,
                slices: Vec::new(),
                shape: Shape::Buffers,
                container: "woff2",
            }),
            _ => {
                let slices = suitcase_faces(&bytes).ok_or("font-unknown")?;
                Ok(FontFile {
                    bytes,
                    decoded: Vec::new(),
                    slices,
                    shape: Shape::Sliced,
                    container: "suitcase",
                })
            }
        }
    }

    pub fn container(&self) -> &'static str {
        self.container
    }

    pub fn face_count(&self) -> usize {
        match self.shape {
            Shape::Directory => collection_len(&self.bytes),
            Shape::Sliced => self.slices.len(),
            Shape::Buffers => self.decoded.len(),
        }
    }

    /// The sfnt flavor of one face — what tells TrueType outlines from CFF ones. It is read from
    /// the container because a face parsed from a WOFF2 is a copy that has no outline table left
    /// to ask.
    pub fn flavor(&self, index: usize) -> Option<u32> {
        match self.shape {
            Shape::Directory if self.container == "collection" => {
                let offset = read_u32(&self.bytes, 12 + index * 4)? as usize;
                read_u32(&self.bytes, offset)
            }
            Shape::Directory => read_u32(&self.bytes, 0),
            Shape::Sliced => read_u32(&self.bytes, self.slices.get(index)?.start),
            Shape::Buffers => read_u32(self.decoded.get(index)?, 0),
        }
    }

    pub fn face(&self, index: usize) -> Result<ttf_parser::Face<'_>, String> {
        let (bytes, at) = match self.shape {
            Shape::Directory => (&self.bytes[..], index as u32),
            Shape::Sliced => (
                self.slices
                    .get(index)
                    .map(|range| &self.bytes[range.clone()])
                    .ok_or_else(|| format!("font-face-index:{index}"))?,
                0,
            ),
            Shape::Buffers => (
                self.decoded
                    .get(index)
                    .ok_or_else(|| format!("font-face-index:{index}"))?
                    .as_slice(),
                0,
            ),
        };
        ttf_parser::Face::parse(bytes, at).map_err(|error| format!("font-broken:{error:?}"))
    }

    /// How one face reaches the browser: `direct` for a file the engine can load itself,
    /// `extract` for a face this plugin writes out first, `none` for a face it cannot produce at
    /// all. A WOFF2 collection is the last case beyond its first face: the engine reads the
    /// collection as it is, and undoing the outline transform to serve a later face is work this
    /// plugin does not do.
    pub fn rendering(&self, index: usize) -> &'static str {
        if self.container == "woff2" && self.decoded.len() > 1 {
            return if index == 0 { "direct" } else { "none" };
        }
        match self.shape {
            Shape::Sliced => "extract",
            Shape::Directory if self.container == "collection" => "extract",
            _ => "direct",
        }
    }

    /// A standalone sfnt for one face: that face's tables written into one file, with the
    /// checksums the format asks for.
    ///
    /// A single-face font is rebuilt rather than copied, because a rebuild is also the repair:
    /// the table directory is written in the order parsers expect and every checksum is computed
    /// again, which is enough for some files an engine refuses as they stand. A WOFF2 is the one
    /// container with nothing to hand over — its outlines were not reconstructed — so the engine
    /// loads the original file and a failure there is reported as a failure.
    pub fn extract(&self, index: usize) -> Result<Vec<u8>, String> {
        match self.shape {
            Shape::Sliced => self
                .slices
                .get(index)
                .map(|range| self.bytes[range.clone()].to_vec())
                .ok_or_else(|| format!("font-face-index:{index}")),
            Shape::Buffers => match self.decoded.get(index) {
                // A WOFF2's outlines were not reconstructed, so there is nothing to hand over.
                Some(_) if self.container != "woff2" => Ok(self.decoded[index].clone()),
                _ => Err("font-container-unsupported:woff2-extract".into()),
            },
            Shape::Directory => extract_face(&self.bytes, index),
        }
    }
}

fn read_u16(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn read_u32(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn read_u24(bytes: &[u8], at: usize) -> Option<usize> {
    let value = bytes.get(at..at + 3)?;
    Some(((value[0] as usize) << 16) | ((value[1] as usize) << 8) | value[2] as usize)
}

/// A tag that starts an sfnt of some kind. `typ1` is the old Type 1-in-sfnt wrapper.
fn tagged(value: u32) -> bool {
    matches!(value, SFNT | TRUE | TYP1 | OTTO)
}

/// The number of faces in a raw sfnt or a collection.
fn collection_len(bytes: &[u8]) -> usize {
    if read_u32(bytes, 0) == Some(TTCF) {
        read_u32(bytes, 8).unwrap_or(0) as usize
    } else {
        1
    }
}

/// Offsets of every offset table in a collection, validated against the file's own length.
fn collection_offsets(bytes: &[u8]) -> Result<Vec<usize>, String> {
    let count = read_u32(bytes, 8).ok_or("font-truncated:12")? as usize;
    if count == 0 || count > 4096 {
        return Err(format!("font-collection-count:{count}"));
    }
    let mut offsets = Vec::with_capacity(count);
    for index in 0..count {
        let offset = read_u32(bytes, 12 + index * 4).ok_or("font-truncated:directory")? as usize;
        if !tagged(read_u32(bytes, offset).ok_or("font-truncated:face")?) {
            return Err(format!("font-broken:face-{index}"));
        }
        let tables = read_u16(bytes, offset + 4).ok_or("font-truncated:face")? as usize;
        if tables == 0 || offset + 12 + tables * 16 > bytes.len() {
            return Err(format!("font-broken:face-{index}"));
        }
        offsets.push(offset);
    }
    Ok(offsets)
}

/// One face's flavor and its tables, copied out of the file they live in.
type FaceTables = (u32, Vec<([u8; 4], Vec<u8>)>);

/// The tables of one face, copied out of the file they live in.
fn face_tables(bytes: &[u8], index: usize) -> Result<FaceTables, String> {
    let start = if read_u32(bytes, 0) == Some(TTCF) {
        read_u32(bytes, 12 + index * 4).ok_or("font-truncated:directory")? as usize
    } else {
        if index != 0 {
            return Err(format!("font-face-index:{index}"));
        }
        0
    };
    let flavor = read_u32(bytes, start).ok_or("font-truncated:face")?;
    let count = read_u16(bytes, start + 4).ok_or("font-truncated:face")? as usize;
    if count == 0 || count > 4096 {
        return Err(format!("font-broken:tables-{count}"));
    }
    let mut tables = Vec::with_capacity(count);
    for at in 0..count {
        let record = start + 12 + at * 16;
        let tag: [u8; 4] = bytes
            .get(record..record + 4)
            .ok_or("font-truncated:directory")?
            .try_into()
            .unwrap();
        let offset = read_u32(bytes, record + 8).ok_or("font-truncated:directory")? as usize;
        let length = read_u32(bytes, record + 12).ok_or("font-truncated:directory")? as usize;
        let data = bytes
            .get(offset..offset.checked_add(length).ok_or("font-broken:table")?)
            .ok_or("font-broken:table")?;
        tables.push((tag, data.to_vec()));
    }
    Ok((flavor, tables))
}

/// One face of a collection as a file of its own.
fn extract_face(bytes: &[u8], index: usize) -> Result<Vec<u8>, String> {
    let (flavor, tables) = face_tables(bytes, index)?;
    build_sfnt(flavor, tables)
}

/// Assemble a standalone sfnt. The directory is sorted by tag because parsers binary-search it,
/// and the checksums are computed rather than copied: a table that moved has a new one.
pub(crate) fn build_sfnt(
    flavor: u32,
    mut tables: Vec<([u8; 4], Vec<u8>)>,
) -> Result<Vec<u8>, String> {
    if tables.is_empty() {
        return Err("font-broken:no-tables".into());
    }
    tables.sort_by_key(|(tag, _)| *tag);
    let count = tables.len();
    let mut total = 12 + count * 16;
    let mut offsets = Vec::with_capacity(count);
    for (_, data) in &tables {
        if total > MAX_SFNT - data.len() {
            return Err("font-too-large:512".into());
        }
        offsets.push(total);
        total += (data.len() + 3) & !3;
    }
    let mut out = vec![0u8; total];
    let entry_selector = (usize::BITS - 1 - count.leading_zeros()) as usize;
    let search_range = (1usize << entry_selector) * 16;
    out[0..4].copy_from_slice(&flavor.to_be_bytes());
    out[4..6].copy_from_slice(&(count as u16).to_be_bytes());
    out[6..8].copy_from_slice(&(search_range as u16).to_be_bytes());
    out[8..10].copy_from_slice(&(entry_selector as u16).to_be_bytes());
    out[10..12].copy_from_slice(&((count * 16 - search_range) as u16).to_be_bytes());
    let head = tables
        .iter()
        .position(|(tag, _)| tag == b"head")
        .map(|at| offsets[at] + 8);
    for (at, ((tag, data), offset)) in tables.iter().zip(&offsets).enumerate() {
        let record = 12 + at * 16;
        out[record..record + 4].copy_from_slice(tag);
        out[record + 8..record + 12].copy_from_slice(&(*offset as u32).to_be_bytes());
        out[record + 12..record + 16].copy_from_slice(&(data.len() as u32).to_be_bytes());
        out[*offset..*offset + data.len()].copy_from_slice(data);
        // A head table's checksum is computed with its own adjustment zeroed, so that field is
        // written once every table is in place.
        let sum = checksum(&out[*offset..*offset + data.len()]).to_be_bytes();
        out[record + 4..record + 8].copy_from_slice(&sum);
    }
    if let Some(at) = head {
        out[at..at + 4].copy_from_slice(&0u32.to_be_bytes());
        let adjustment = 0xb1b0_afbau32.wrapping_sub(checksum(&out));
        out[at..at + 4].copy_from_slice(&adjustment.to_be_bytes());
    }
    Ok(out)
}

/// The format's checksum: the sum of the bytes read as big-endian words, zero padded.
fn checksum(bytes: &[u8]) -> u32 {
    let mut sum = 0u32;
    let mut at = 0;
    while at < bytes.len() {
        let word = [
            *bytes.get(at).unwrap_or(&0),
            *bytes.get(at + 1).unwrap_or(&0),
            *bytes.get(at + 2).unwrap_or(&0),
            *bytes.get(at + 3).unwrap_or(&0),
        ];
        sum = sum.wrapping_add(u32::from_be_bytes(word));
        at += 4;
    }
    sum
}

/// A WOFF's tables inflated into one sfnt. Every table is kept: the browser loads a WOFF
/// itself, but if it cannot, this is the copy it can be shown instead.
fn decode_woff(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let flavor = read_u32(bytes, 4).ok_or("font-truncated:woff")?;
    if !tagged(flavor) {
        return Err("font-broken:woff-flavor".into());
    }
    let count = read_u16(bytes, 12).ok_or("font-truncated:woff")? as usize;
    let total_sfnt_size = read_u32(bytes, 16).ok_or("font-truncated:woff")? as usize;
    if count == 0 || count > 4096 {
        return Err(format!("font-broken:tables-{count}"));
    }
    if total_sfnt_size > MAX_SFNT {
        return Err("font-too-large:512".into());
    }
    let mut tables = Vec::with_capacity(count);
    for index in 0..count {
        let record = 44 + index * 20;
        let tag: [u8; 4] = bytes
            .get(record..record + 4)
            .ok_or("font-truncated:woff-directory")?
            .try_into()
            .unwrap();
        let offset = read_u32(bytes, record + 4).ok_or("font-truncated:woff-directory")? as usize;
        let compressed =
            read_u32(bytes, record + 8).ok_or("font-truncated:woff-directory")? as usize;
        let original =
            read_u32(bytes, record + 12).ok_or("font-truncated:woff-directory")? as usize;
        if original > MAX_SFNT || compressed > original {
            return Err("font-broken:woff-table".into());
        }
        let raw = bytes
            .get(
                offset
                    ..offset
                        .checked_add(compressed)
                        .ok_or("font-broken:woff-table")?,
            )
            .ok_or("font-broken:woff-table")?;
        // A table whose stored and original sizes agree is stored as it is, not deflated.
        let data = if compressed == original {
            raw.to_vec()
        } else {
            // The declared size is the bound: a stream that inflates past it is not this table.
            let mut out = Vec::with_capacity(original);
            flate2::read::ZlibDecoder::new(raw)
                .take(original as u64 + 1)
                .read_to_end(&mut out)
                .map_err(|error| format!("font-broken:woff-inflate:{error}"))?;
            if out.len() != original {
                return Err("font-broken:woff-table".into());
            }
            out
        };
        tables.push((tag, data));
    }
    build_sfnt(flavor, tables)
}

/// The tags a WOFF2 directory refers to by number. Index 63 is the escape that spells a tag
/// out, so this list is a wire format rather than a convenience.
const KNOWN_TAGS: [&[u8; 4]; 63] = [
    b"cmap", b"head", b"hhea", b"hmtx", b"maxp", b"name", b"OS/2", b"post", b"cvt ", b"fpgm",
    b"glyf", b"loca", b"prep", b"CFF ", b"VORG", b"EBDT", b"EBLC", b"gasp", b"hdmx", b"kern",
    b"LTSH", b"PCLT", b"VDMX", b"vhea", b"vmtx", b"BASE", b"GDEF", b"GPOS", b"GSUB", b"EBSC",
    b"JSTF", b"MATH", b"CBDT", b"CBLC", b"COLR", b"CPAL", b"SVG ", b"sbix", b"acnt", b"avar",
    b"bdat", b"bloc", b"bsln", b"cvar", b"fdsc", b"feat", b"fmtx", b"fvar", b"gvar", b"hsty",
    b"just", b"lcar", b"mort", b"morx", b"opbd", b"prop", b"trak", b"Zapf", b"Silf", b"Glat",
    b"Gloc", b"Feat", b"Sill",
];

/// One entry of a WOFF2 table directory, with its place in the decompressed stream.
struct Woff2Table {
    tag: [u8; 4],
    start: usize,
    length: usize,
    /// Whether the encoder transformed this table. A transform is never undone here: the ones
    /// that exist are for the tables this plugin does not parse, and the one that does exist for
    /// a wanted table (`hmtx`) only removes the side bearings, which is then said out loud
    /// rather than reconstructed from outlines that were skipped.
    transformed: bool,
}

/// A WOFF2 decoded into one parse-only sfnt per face.
///
/// Only the tables a parse needs are kept, and a table the encoder transformed is skipped
/// rather than reconstructed: the outline tables are the ones with a transformation worth
/// having, and none of them are wanted here. A face that ends up without `hmtx` reports no
/// advance widths, which the interface says out loud instead of inventing a number.
fn decode_woff2(bytes: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    let flavor = read_u32(bytes, 4).ok_or("font-truncated:woff2")?;
    let count = read_u16(bytes, 12).ok_or("font-truncated:woff2")? as usize;
    let total_sfnt_size = read_u32(bytes, 16).ok_or("font-truncated:woff2")? as usize;
    let compressed_size = read_u32(bytes, 20).ok_or("font-truncated:woff2")? as usize;
    if count == 0 || count > 4096 {
        return Err(format!("font-broken:tables-{count}"));
    }
    if total_sfnt_size > MAX_SFNT {
        return Err("font-too-large:512".into());
    }
    if !tagged(flavor) && flavor != TTCF {
        return Err("font-broken:woff2-flavor".into());
    }
    let mut at = 48usize;
    let mut directory = Vec::with_capacity(count);
    let mut stream_length = 0usize;
    for _ in 0..count {
        let flags = *bytes.get(at).ok_or("font-truncated:woff2-directory")?;
        at += 1;
        let tag: [u8; 4] = match flags & 0x3f {
            63 => {
                let tag = bytes
                    .get(at..at + 4)
                    .ok_or("font-truncated:woff2-directory")?
                    .try_into()
                    .unwrap();
                at += 4;
                tag
            }
            index => **KNOWN_TAGS
                .get(index as usize)
                .ok_or("font-broken:woff2-tag")?,
        };
        // The transform bits mean opposite things for the tables that define one: for glyf and
        // loca a zero version is the transformed form, for hmtx a zero version is the plain one.
        // A version anywhere else is a transformation this decoder does not know, and reading on
        // would misplace every table after it.
        let version = (flags >> 6) & 0x03;
        let defined = matches!(&tag, b"glyf" | b"loca" | b"hmtx");
        let transformed = match &tag {
            b"glyf" | b"loca" => version != 3,
            _ => version != 0,
        };
        if !defined && version != 0 {
            return Err(format!(
                "font-broken:woff2-transform:{}",
                String::from_utf8_lossy(&tag)
            ));
        }
        let original = read_base128(bytes, &mut at)?;
        let length = if transformed {
            read_base128(bytes, &mut at)?
        } else {
            original
        };
        if length > MAX_SFNT || stream_length > MAX_SFNT - length {
            return Err("font-too-large:512".into());
        }
        directory.push(Woff2Table {
            tag,
            start: stream_length,
            length,
            transformed,
        });
        stream_length += length;
    }
    // A collection states which directory entries belong to each face and what that face's own
    // flavor is; a single face uses all of them and the header's flavor.
    let faces = if flavor == TTCF {
        read_woff2_collection(bytes, &mut at, &directory)?
    } else {
        vec![(flavor, (0..directory.len()).collect::<Vec<_>>())]
    };
    let compressed = bytes
        .get(
            at..at
                .checked_add(compressed_size)
                .ok_or("font-truncated:woff2-stream")?,
        )
        .ok_or("font-truncated:woff2-stream")?;
    let mut decoded = Vec::with_capacity(faces.len());
    for (face_flavor, entries) in &faces {
        let wanted: Vec<&Woff2Table> = entries
            .iter()
            .filter_map(|index| directory.get(*index))
            .filter(|table| {
                table.length > 0 && !table.transformed && PARSE_TABLES.contains(&&table.tag)
            })
            .collect();
        decoded.push(decode_woff2_tables(
            compressed,
            &wanted,
            *face_flavor,
            stream_length,
        )?);
    }
    Ok(decoded)
}

/// The tables one face wants, pulled out of the single brotli stream.
///
/// The stream is decompressed in order and only the requested ranges are kept, so a face costs
/// its own tables rather than the whole compressed font. Decoding stops once the last wanted
/// table has been passed: whatever follows cannot change the answer.
fn decode_woff2_tables(
    compressed: &[u8],
    wanted: &[&Woff2Table],
    flavor: u32,
    stream_length: usize,
) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let last = wanted
        .iter()
        .map(|table| table.start + table.length)
        .max()
        .unwrap_or(0);
    let mut kept: Vec<Option<Vec<u8>>> = wanted.iter().map(|_| None).collect();
    let mut decoder = brotli_decompressor::Decompressor::new(compressed, 64 * 1024);
    let mut buffer = vec![0u8; 64 * 1024];
    let mut position = 0usize;
    while position < last && position < stream_length {
        let read = decoder
            .read(&mut buffer)
            .map_err(|error| format!("font-broken:woff2-inflate:{error}"))?;
        if read == 0 {
            break;
        }
        let end = position + read;
        for (slot, table) in kept.iter_mut().zip(wanted) {
            let from = table.start.max(position);
            let to = (table.start + table.length).min(end);
            if from >= to {
                continue;
            }
            // The stream is read in order, so a table's own slices arrive in order too.
            let slot = slot.get_or_insert_with(Vec::new);
            if slot.is_empty() && from > table.start {
                continue;
            }
            slot.extend_from_slice(&buffer[from - position..to - position]);
        }
        position = end;
    }
    let mut tables = Vec::new();
    for (table, data) in wanted.iter().zip(kept) {
        // A table whose bytes never arrived whole is dropped rather than guessed at.
        match data {
            Some(data) if data.len() == table.length => tables.push((table.tag, data)),
            _ => continue,
        }
    }
    if tables.is_empty() {
        return Err("font-broken:woff2-tables".into());
    }
    build_sfnt(flavor, tables)
}

/// Which table directory entries each face of a WOFF2 collection uses, and its own flavor.
fn read_woff2_collection(
    bytes: &[u8],
    at: &mut usize,
    directory: &[Woff2Table],
) -> Result<Vec<(u32, Vec<usize>)>, String> {
    // The collection's own version, then the number of faces.
    let version = read_u32(bytes, *at).ok_or("font-truncated:woff2-collection")?;
    if version != 0x0001_0000 && version != 0x0002_0000 {
        return Err("font-broken:woff2-collection-version".into());
    }
    *at += 4;
    let count = read_255u16(bytes, at)? as usize;
    if count == 0 || count > 4096 {
        return Err(format!("font-collection-count:{count}"));
    }
    let mut faces = Vec::with_capacity(count);
    for _ in 0..count {
        let tables = read_255u16(bytes, at)? as usize;
        if tables == 0 || tables > directory.len() {
            return Err(format!("font-broken:woff2-collection-tables:{tables}"));
        }
        let flavor = read_u32(bytes, *at).ok_or("font-truncated:woff2-collection")?;
        *at += 4;
        let mut entries = Vec::with_capacity(tables);
        for _ in 0..tables {
            let index = read_255u16(bytes, at)? as usize;
            if index >= directory.len() {
                return Err(format!("font-broken:woff2-collection-index:{index}"));
            }
            entries.push(index);
        }
        faces.push((flavor, entries));
    }
    Ok(faces)
}

/// WOFF2's variable-length number: three codes escape to a following byte or word.
fn read_255u16(bytes: &[u8], at: &mut usize) -> Result<u16, String> {
    let code = *bytes.get(*at).ok_or("font-truncated:woff2-number")?;
    *at += 1;
    match code {
        253 => {
            let value = read_u16(bytes, *at).ok_or("font-truncated:woff2-number")?;
            *at += 2;
            Ok(value)
        }
        254 => {
            let value = *bytes.get(*at).ok_or("font-truncated:woff2-number")? as u16;
            *at += 1;
            Ok(value + 506)
        }
        255 => {
            let value = *bytes.get(*at).ok_or("font-truncated:woff2-number")? as u16;
            *at += 1;
            Ok(value + 253)
        }
        value => Ok(value as u16),
    }
}

/// WOFF2's variable-length length: seven bits per byte, high bit continues. A leading
/// continuation byte would encode a padded number, which the format forbids.
fn read_base128(bytes: &[u8], at: &mut usize) -> Result<usize, String> {
    if bytes.get(*at) == Some(&0x80) {
        return Err("font-broken:woff2-length".into());
    }
    let mut value = 0usize;
    for _ in 0..5 {
        let byte = *bytes.get(*at).ok_or("font-truncated:woff2-length")?;
        *at += 1;
        value = (value << 7) | (byte & 0x7f) as usize;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err("font-broken:woff2-length".into())
}

/// The faces of a Macintosh resource-fork suitcase: every `sfnt` resource, ordered by resource
/// ID, which is the order the platform itself numbers faces in.
fn suitcase_faces(bytes: &[u8]) -> Option<Vec<Range<usize>>> {
    let data_start = read_u32(bytes, 0)? as usize;
    let map_start = read_u32(bytes, 4)? as usize;
    let data_length = read_u32(bytes, 8)? as usize;
    let map_length = read_u32(bytes, 12)? as usize;
    if data_start < 16
        || map_start < data_start
        || data_start + data_length > bytes.len()
        || map_start + map_length > bytes.len()
    {
        return None;
    }
    let type_list = map_start + read_u16(bytes, map_start + 24)? as usize;
    let types = read_u16(bytes, type_list)? as usize + 1;
    if types == 0 || types > 4096 {
        return None;
    }
    for index in 0..types {
        let entry = type_list + 2 + index * 8;
        let kind = bytes.get(entry..entry + 4)?;
        let count = read_u16(bytes, entry + 4)? as usize + 1;
        if kind != b"sfnt" {
            continue;
        }
        let references = type_list + read_u16(bytes, entry + 6)? as usize;
        // A face is ordered by its resource ID, while its bytes are found by an offset into the
        // data area: the two orders are independent, so both are kept.
        let mut resources = Vec::with_capacity(count);
        for at in 0..count {
            let reference = references + at * 12;
            resources.push((
                read_u16(bytes, reference)? as i16,
                read_u24(bytes, reference + 5)?,
            ));
        }
        resources.sort_unstable_by_key(|(id, _)| *id);
        let mut offsets: Vec<usize> = resources.iter().map(|(_, offset)| *offset).collect();
        offsets.sort_unstable();
        let mut faces = Vec::with_capacity(count);
        for (_, offset) in &resources {
            let begin = data_start.checked_add(*offset)?;
            // A resource's stored length is checked against where the next one begins in the
            // data area, so a wrong length costs that one resource instead of the file.
            let limit = offsets
                .iter()
                .find(|next| **next > *offset)
                .map(|next| data_start + next)
                .unwrap_or(data_start + data_length)
                .min(bytes.len());
            let declared = read_u32(bytes, begin)? as usize;
            let (from, to) = if begin + 4 + declared <= limit {
                (begin + 4, begin + 4 + declared)
            } else {
                (begin + 4, limit)
            };
            if from >= to || !tagged(read_u32(bytes, from)?) {
                continue;
            }
            faces.push(from..to);
        }
        if !faces.is_empty() {
            return Some(faces);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture;

    #[test]
    fn a_plain_sfnt_is_read_where_it_stands() {
        let file = fixture::write("plain.ttf", &fixture::sfnt());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "sfnt");
        assert_eq!(font.face_count(), 1);
        assert_eq!(font.rendering(0), "direct");
        assert_eq!(font.face(0).unwrap().units_per_em(), 1000);
        assert!(font.extract(0).is_ok());
    }

    #[test]
    fn every_face_of_a_collection_is_reachable_and_extractable() {
        let file = fixture::write("faces.ttc", &fixture::collection());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "collection");
        assert_eq!(font.face_count(), 2);
        assert_eq!(
            font.rendering(0),
            "extract",
            "the engine loads one file, not one face"
        );
        for index in 0..2 {
            assert_eq!(
                font.face(index).unwrap().units_per_em(),
                1000 + index as u16
            );
            assert_eq!(
                fixture::covered(&font.face(index).unwrap()),
                fixture::COVERED
            );
        }
        // The extracted face is a font in its own right: same tables, own directory.
        let face = font.extract(1).unwrap();
        assert_eq!(&face[0..4], &SFNT.to_be_bytes());
        let parsed = ttf_parser::Face::parse(&face, 0).unwrap();
        assert_eq!(parsed.units_per_em(), 1001);
        assert_eq!(parsed.number_of_glyphs(), fixture::COVERED.len() as u16 + 2);
    }

    #[test]
    fn a_woff_is_inflated_into_the_same_tables() {
        let file = fixture::write("font.woff", &fixture::woff());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "woff");
        assert_eq!(font.face_count(), 1);
        let face = font.face(0).unwrap();
        assert_eq!(face.units_per_em(), 1000);
        assert_eq!(fixture::covered(&face), fixture::COVERED);
        // The browser loads a WOFF itself, so the file is handed over as it is.
        assert_eq!(font.rendering(0), "direct");
    }

    #[test]
    fn a_woff2_is_decoded_table_by_table_without_its_outlines() {
        let file = fixture::write("font.woff2", &fixture::woff2());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "woff2");
        let face = font.face(0).unwrap();
        assert_eq!(face.units_per_em(), 1000);
        assert_eq!(fixture::covered(&face), fixture::COVERED);
        assert_eq!(fixture::family(&face), "Fixture Sans");
        assert!(
            face.tables().glyf.is_none(),
            "outlines are not reconstructed"
        );
        assert_eq!(
            font.rendering(0),
            "direct",
            "the engine loads the WOFF2 itself"
        );
    }

    #[test]
    fn a_woff2_collection_yields_one_font_per_face() {
        let file = fixture::write("faces.woff2", &fixture::woff2_collection());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "woff2");
        assert_eq!(font.face_count(), 2);
        // Only the first face is one the engine can read out of the collection as it stands, and
        // the rest cannot be written out either: a face whose outlines were transformed is not
        // something this plugin rebuilds.
        assert_eq!(font.rendering(0), "direct");
        assert_eq!(font.rendering(1), "none");
        assert!(font.extract(0).is_err());
        for index in 0..2 {
            let face = font.face(index).unwrap();
            assert_eq!(face.units_per_em(), 1000 + index as u16);
            assert_eq!(face.number_of_glyphs(), fixture::COVERED.len() as u16 + 2);
        }
    }

    #[test]
    fn a_suitcase_is_read_as_one_face_per_sfnt_resource() {
        let file = fixture::write("font.dfont", &fixture::suitcase());
        let font = FontFile::open(&file).unwrap();
        assert_eq!(font.container(), "suitcase");
        assert_eq!(font.face_count(), 1);
        assert_eq!(font.rendering(0), "extract");
        assert_eq!(font.face(0).unwrap().units_per_em(), 1000);
        assert_eq!(&font.extract(0).unwrap()[0..4], &SFNT.to_be_bytes());
    }

    #[test]
    fn a_container_that_lies_about_its_size_is_refused_rather_than_allocated_for() {
        // Each test writes its own file: tests run in parallel, and two of them sharing one name
        // would read each other's half-written fixture.
        let mut woff = fixture::woff();
        woff[16..20].copy_from_slice(&0xffff_ffffu32.to_be_bytes());
        let file = fixture::write("container-huge.woff", &woff);
        assert!(FontFile::open(&file)
            .unwrap_err()
            .contains("font-too-large"));

        let mut collection = fixture::collection();
        collection[8..12].copy_from_slice(&0u32.to_be_bytes());
        let file = fixture::write("container-empty.ttc", &collection);
        assert!(FontFile::open(&file)
            .unwrap_err()
            .contains("font-collection-count"));
    }

    #[test]
    fn something_that_is_not_a_font_is_not_guessed_at() {
        let file = fixture::write("container-archive.ttf", b"PK\x03\x04 and then some");
        assert_eq!(FontFile::open(&file).unwrap_err(), "font-unknown");
    }
}
