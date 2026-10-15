//! The glyph side of a face: which characters it encodes, and what one glyph is.
//!
//! The character list is the font's own index and it is what both halves of the interface run
//! on: the specimen checks the user's typing against it, and the glyph case lays it out. It is
//! built once per face and kept for the session, which is also why the payloads that carry it
//! are slices rather than whole lists.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use ttf_parser::{Face, GlyphId};

/// One encoded character and its glyph, as much as the interface needs to show a cell.
pub struct Coverage {
    points: Vec<u32>,
    /// Glyph ids no character reaches: alternates, ligature parts and the `.notdef` that a
    /// cmap never maps. The case lists them after the blocks, because a font's own inventory is
    /// bigger than the part a keyboard can ask for.
    unencoded: Vec<u32>,
}

impl Coverage {
    pub fn of(face: &Face) -> Coverage {
        let mut points = Vec::new();
        if let Some(cmap) = face.tables().cmap {
            for subtable in cmap.subtables {
                if !subtable.is_unicode() {
                    continue;
                }
                subtable.codepoints(|point| {
                    // A subtable's ranges cover the surrogate block, which encodes no character
                    // at all. Subtable formats also repeat each other, which deduping settles.
                    if !(0xd800..=0xdfff).contains(&point) {
                        points.push(point);
                    }
                });
            }
        }
        points.sort_unstable();
        points.dedup();
        let mut reached = vec![false; face.number_of_glyphs() as usize];
        for point in &points {
            if let Some(character) = char::from_u32(*point) {
                if let Some(glyph) = face.glyph_index(character) {
                    if let Some(slot) = reached.get_mut(glyph.0 as usize) {
                        *slot = true;
                    }
                }
            }
        }
        let unencoded = (0..reached.len() as u32)
            .filter(|id| !reached[*id as usize])
            .collect();
        Coverage { points, unencoded }
    }

    pub fn total(&self) -> usize {
        self.points.len()
    }

    pub fn unencoded_total(&self) -> usize {
        self.unencoded.len()
    }

    /// Whether one character is in the font, asked without building the list: the specimen
    /// checks what was typed, and it should not have to enumerate a font to do it.
    pub fn has(face: &Face, point: u32) -> bool {
        char::from_u32(point)
            .and_then(|character| face.glyph_index(character))
            .is_some()
    }

    /// Where a code point sits in the list, and whether it is in it: the first index whose
    /// character is not before this one. This is what lets the interface jump to a block or to a
    /// match without holding the whole list.
    pub fn rank(&self, point: u32) -> (usize, bool) {
        match self.points.binary_search(&point) {
            Ok(at) => (at, true),
            Err(at) => (at, false),
        }
    }

    /// A slice of the character list, delta-encoded and base64'd: a thousand code points cost
    /// about as many bytes as one glyph outline would.
    pub fn chunk(&self, offset: usize, count: usize) -> Value {
        let start = offset.min(self.points.len());
        let end = start.saturating_add(count).min(self.points.len());
        json!({
            "total": self.points.len(),
            "offset": offset,
            "points": encode(&self.points[start..end]),
            "unencoded": self.unencoded.len(),
        })
    }

    pub fn unencoded_chunk(&self, offset: usize, count: usize) -> Value {
        let start = offset.min(self.unencoded.len());
        let end = start.saturating_add(count).min(self.unencoded.len());
        let ids: Vec<u16> = self.unencoded[start..end]
            .iter()
            .map(|id| *id as u16)
            .collect();
        json!({
            "total": self.unencoded.len(),
            "offset": offset,
            "glyphs": STANDARD.encode(ids.iter().flat_map(|id| id.to_be_bytes()).collect::<Vec<u8>>()),
        })
    }

    /// Every character that reaches this glyph. One glyph serving several characters is a fact
    /// about the font — a space and a no-break space are the same drawing — and it is the answer
    /// to "why does this cell look like that one".
    pub fn same_glyph(&self, face: &Face, glyph: GlyphId) -> Vec<u32> {
        let mut found = Vec::new();
        for point in &self.points {
            if let Some(character) = char::from_u32(*point) {
                if face.glyph_index(character) == Some(glyph) {
                    found.push(*point);
                    if found.len() >= 64 {
                        break;
                    }
                }
            }
        }
        found
    }
}

/// What one character is in this face: the glyph it reaches, how wide that glyph is, and the
/// other characters that reach the same one.
pub fn glyph(face: &Face, coverage: &Coverage, point: u32) -> Value {
    let glyph = char::from_u32(point).and_then(|character| face.glyph_index(character));
    let id = glyph.unwrap_or(GlyphId(0));
    json!({
        "codepoint": point,
        "glyph": glyph.map(|glyph| glyph.0),
        "name": if glyph.is_some() { face.glyph_name(id) } else { None },
        "advance": face.glyph_hor_advance(id),
        "bearing": face.glyph_hor_side_bearing(id),
        "same": coverage.same_glyph(face, id),
    })
}

/// Glyph names for the ids the case is showing. A font that names no glyphs (`post` 3.0) answers
/// with nothing, and the case shows the id alone rather than a made-up name.
pub fn names(face: &Face, glyphs: &[u16]) -> Value {
    let names: Vec<Value> = glyphs
        .iter()
        .map(|id| match face.glyph_name(GlyphId(*id)) {
            Some(name) => json!(name),
            None => Value::Null,
        })
        .collect();
    json!({ "names": names })
}

/// Delta-encoded code points, then base64: seven bits per byte, least significant group first,
/// high bit continues — the variable-length shape the font formats themselves use. Each chunk
/// starts from zero, so a reader decodes one chunk without the ones before it.
fn encode(points: &[u32]) -> String {
    let mut bytes = Vec::with_capacity(points.len() * 2);
    let mut previous = 0u32;
    for point in points {
        let mut delta = point.saturating_sub(previous) as u64;
        previous = *point;
        loop {
            let mut byte = (delta & 0x7f) as u8;
            delta >>= 7;
            if delta > 0 {
                byte |= 0x80;
            }
            bytes.push(byte);
            if delta == 0 {
                break;
            }
        }
    }
    STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{container::FontFile, fixture};

    fn face_of(name: &str, bytes: &[u8]) -> (FontFile, String) {
        let path = fixture::write(name, bytes);
        (FontFile::open(&path).unwrap(), path)
    }

    #[test]
    fn the_character_list_is_the_fonts_own_and_excludes_what_is_not_a_character() {
        let (file, _) = face_of("coverage.ttf", &fixture::sfnt());
        let face = file.face(0).unwrap();
        let coverage = Coverage::of(&face);
        assert_eq!(coverage.total(), fixture::COVERED.len());
        let encoded = |point: u32| coverage.points.binary_search(&point).is_ok();
        for point in fixture::COVERED {
            assert!(encoded(point), "U+{point:04X} should be encoded");
        }
        assert!(!encoded(0x7a));
        // The fixture's cmap claims the surrogate block, which the parser enumerates and which
        // must not reach the case.
        assert!(fixture::raw_points(&face)
            .iter()
            .any(|point| (0xd800..=0xdfff).contains(point)));
        assert!(!coverage
            .points
            .iter()
            .any(|point| (0xd800..=0xdfff).contains(point)));
        // The only glyphs nothing reaches are the ones the fixture left unreachable.
        assert_eq!(coverage.unencoded_total(), 2);
        assert_eq!(coverage.unencoded, vec![0, 7]);
    }

    #[test]
    fn a_chunk_decodes_to_the_characters_it_stands_for() {
        let (file, _) = face_of("chunk.ttf", &fixture::sfnt());
        let face = file.face(0).unwrap();
        let coverage = Coverage::of(&face);
        let chunk = coverage.chunk(0, 3);
        assert_eq!(chunk["total"], fixture::COVERED.len());
        assert_eq!(
            decode(chunk["points"].as_str().unwrap()),
            fixture::COVERED[..3].to_vec()
        );
        let rest = coverage.chunk(3, 100);
        assert_eq!(
            decode(rest["points"].as_str().unwrap()),
            fixture::COVERED[3..].to_vec()
        );
        assert_eq!(coverage.chunk(99, 10)["points"], "");
    }

    #[test]
    fn one_character_states_its_glyph_and_its_metrics() {
        let (file, _) = face_of("glyph.ttf", &fixture::sfnt());
        let face = file.face(0).unwrap();
        let coverage = Coverage::of(&face);
        let facts = glyph(&face, &coverage, 0x41);
        assert_eq!(facts["glyph"], 2);
        assert_eq!(facts["advance"], 420);
        assert_eq!(facts["bearing"], 20);
        assert_eq!(facts["name"], Value::Null, "the fixture names no glyphs");
        assert_eq!(facts["same"], json!([0x41]));
        // A character the face does not encode has no glyph of its own.
        assert_eq!(glyph(&face, &coverage, 0x7a)["glyph"], Value::Null);
    }

    #[test]
    fn a_character_can_be_looked_for_without_listing_the_font() {
        let (file, _) = face_of("covers.ttf", &fixture::sfnt());
        let face = file.face(0).unwrap();
        assert!(Coverage::has(&face, 0x41));
        assert!(Coverage::has(&face, 0x1f600));
        assert!(!Coverage::has(&face, 0x7a));
        // A surrogate is not a character, so no font encodes one.
        assert!(!Coverage::has(&face, 0xd800));

        let coverage = Coverage::of(&face);
        assert_eq!(coverage.rank(0x41), (1, true));
        // A character the font lacks ranks where it would have been, and says it is not there.
        assert_eq!(coverage.rank(0x44), (4, false));
        assert_eq!(coverage.rank(0x10ffff), (fixture::COVERED.len(), false));
    }

    #[test]
    fn the_unencoded_list_is_glyph_ids_nothing_maps_to() {
        let (file, _) = face_of("unencoded.ttf", &fixture::sfnt());
        let face = file.face(0).unwrap();
        let coverage = Coverage::of(&face);
        let chunk = coverage.unencoded_chunk(0, 10);
        assert_eq!(chunk["total"], 2);
        let bytes = STANDARD.decode(chunk["glyphs"].as_str().unwrap()).unwrap();
        let ids: Vec<u16> = bytes
            .chunks(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .collect();
        assert_eq!(ids, vec![0, 7]);
        assert_eq!(
            names(&face, &ids)["names"],
            json!([Value::Null, Value::Null])
        );
    }

    /// Mirrors the wire encoding: seven bits per byte, least significant group first, each value
    /// the distance from the one before it within the same chunk.
    fn decode(encoded: &str) -> Vec<u32> {
        let bytes = STANDARD.decode(encoded).unwrap();
        let mut points = Vec::new();
        let mut value = 0u32;
        let mut shift = 0;
        let mut previous = 0u32;
        for byte in bytes {
            value |= ((byte & 0x7f) as u32) << shift;
            if byte & 0x80 == 0 {
                previous += value;
                points.push(previous);
                value = 0;
                shift = 0;
            } else {
                shift += 7;
            }
        }
        points
    }
}
