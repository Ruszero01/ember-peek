//! What the interface is told about a face.
//!
//! Two sizes of answer, because the two readers want different things: the face rail needs a
//! line per face and the specimen needs everything a specimen quotes — metrics, names, tables,
//! variation axes. Nothing here draws a glyph, so nothing here parses an outline.

use crate::container::FontFile;
use serde_json::{json, Map, Value};
use ttf_parser::{name_id, Face, Permissions, Tag};

/// One line per face: enough for a rail of styles, and nothing that needs a table walk.
pub fn summary(file: &FontFile, index: usize) -> Result<Value, String> {
    let face = file.face(index)?;
    Ok(json!({
        "index": index,
        "family": text(&face, name_id::FAMILY),
        "subfamily": text(&face, name_id::SUBFAMILY),
        "postscript": text(&face, name_id::POST_SCRIPT_NAME),
        "unitsPerEm": face.units_per_em(),
        "glyphs": face.number_of_glyphs(),
        "style": style(&face),
    }))
}

/// Everything the specimen, the facts list and the glyph inspector quote about one face.
pub fn details(file: &FontFile, index: usize) -> Result<Value, String> {
    let face = file.face(index)?;
    let outline = outline_kind(file, index);
    let permissions = face.permissions();
    let axes: Vec<Value> = face
        .variation_axes()
        .into_iter()
        .map(|axis| {
            json!({
                "tag": String::from_utf8_lossy(&axis.tag.to_bytes()).to_string(),
                "min": axis.min_value,
                "default": axis.def_value,
                "max": axis.max_value,
            })
        })
        .collect();
    let mut tables = Map::new();
    for record in face.raw_face().table_records {
        tables.insert(
            String::from_utf8_lossy(&record.tag.to_bytes()).to_string(),
            json!(record.length),
        );
    }
    let underline = face.underline_metrics();
    let strikeout = face.strikeout_metrics();
    Ok(json!({
        "index": index,
        "family": text(&face, name_id::FAMILY),
        "subfamily": text(&face, name_id::SUBFAMILY),
        "full": text(&face, name_id::FULL_NAME),
        "postscript": text(&face, name_id::POST_SCRIPT_NAME),
        "version": text(&face, name_id::VERSION),
        "typographicFamily": text(&face, name_id::TYPOGRAPHIC_FAMILY),
        "typographicSubfamily": text(&face, name_id::TYPOGRAPHIC_SUBFAMILY),
        "unitsPerEm": face.units_per_em(),
        "glyphs": face.number_of_glyphs(),
        "outline": outline,
        "variable": face.is_variable(),
        // Without an OS/2 table the parser answers with the default weight and width, which
        // would be this plugin's guess rather than the font's claim.
        "weight": face.tables().os2.map(|_| face.weight().to_number()),
        "width": face.tables().os2.map(|_| face.width().to_number()),
        "style": style(&face),
        "metrics": {
            "ascent": face.ascender(),
            "descent": face.descender(),
            "lineGap": face.line_gap(),
            "height": face.height(),
            "typographicAscent": optional(face.typographic_ascender()),
            "typographicDescent": optional(face.typographic_descender()),
            "typographicLineGap": optional(face.typographic_line_gap()),
            "capHeight": optional(face.capital_height()),
            "xHeight": optional(face.x_height()),
            "underline": underline.map(|line| line.position),
            "underlineThickness": underline.map(|line| line.thickness),
            "strikeout": strikeout.map(|line| line.position),
            "strikeoutThickness": strikeout.map(|line| line.thickness),
            "italicAngle": face.italic_angle(),
        },
        "names": {
            "designer": text(&face, name_id::DESIGNER),
            "designerUrl": text(&face, 12),
            "manufacturer": text(&face, name_id::MANUFACTURER),
            "vendorUrl": text(&face, 11),
            "license": text(&face, name_id::LICENSE),
            "licenseUrl": text(&face, 14),
            "description": text(&face, name_id::DESCRIPTION),
            "copyright": text(&face, name_id::COPYRIGHT_NOTICE),
            "trademark": text(&face, name_id::TRADEMARK),
            "sample": text(&face, name_id::SAMPLE_TEXT),
        },
        "axes": axes,
        "tables": Value::Object(tables),
        "embedding": {
            // The raw permission word, because the parser's own decoding hides the bits a font
            // licence is actually read from.
            "fsType": face
                .raw_face()
                .table(Tag::from_bytes(b"OS/2"))
                .and_then(|bytes| bytes.get(8..10))
                .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]])),
            "level": permissions.map(level),
            "outline": face.is_outline_embedding_allowed(),
            "subsetting": face.is_subsetting_allowed(),
        },
    }))
}

/// TrueType and CFF fonts differ in what a glyph is, and the specimen says which one this is.
/// The answer comes from the container rather than the parsed tables: a WOFF2 is parsed from a
/// copy that deliberately has no outline table at all.
fn outline_kind(file: &FontFile, index: usize) -> &'static str {
    match file.flavor(index) {
        Some(0x4f54_544f) => "cff",
        Some(_) => "truetype",
        None => "unknown",
    }
}

/// The embedding level a licence is usually read as, in the format's own words.
fn level(permissions: Permissions) -> &'static str {
    match permissions {
        Permissions::Installable => "installable",
        Permissions::Restricted => "restricted",
        Permissions::PreviewAndPrint => "preview-print",
        Permissions::Editable => "editable",
    }
}

fn style(face: &Face) -> Value {
    json!({
        "italic": face.is_italic(),
        "bold": face.is_bold(),
        "oblique": face.is_oblique(),
        "regular": face.is_regular(),
        "monospaced": face.is_monospaced(),
    })
}

/// A name record in the interface language's own alphabet, or nothing. The Windows records are
/// preferred by the parser, and a font that only names itself in another encoding says nothing
/// rather than something undecodable.
pub fn text(face: &Face, id: u16) -> String {
    let name = face
        .names()
        .into_iter()
        .find(|name| name.name_id == id && name.is_unicode())
        .or_else(|| face.names().into_iter().find(|name| name.name_id == id));
    name.and_then(|name| name.to_string())
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

fn optional(value: Option<i16>) -> Value {
    value.map_or(Value::Null, |value| json!(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{container::FontFile, fixture};

    fn file() -> (FontFile, usize) {
        let path = fixture::write("facts.ttf", &fixture::sfnt());
        (FontFile::open(&path).unwrap(), 0)
    }

    #[test]
    fn a_face_reports_the_names_and_metrics_it_was_given() {
        let (file, index) = file();
        let summary = summary(&file, index).unwrap();
        assert_eq!(summary["family"], "Fixture Sans");
        assert_eq!(summary["subfamily"], "Regular");
        assert_eq!(summary["postscript"], "FixtureSans-Regular");
        assert_eq!(summary["unitsPerEm"], 1000);
        assert_eq!(summary["glyphs"], (fixture::COVERED.len() + 2) as u16);
        assert_eq!(summary["style"]["regular"], true);

        let details = details(&file, index).unwrap();
        assert_eq!(details["version"], "Version 1.000");
        assert_eq!(details["metrics"]["ascent"], 800);
        assert_eq!(details["metrics"]["descent"], -200);
        assert_eq!(details["metrics"]["xHeight"], 500);
        assert_eq!(details["metrics"]["capHeight"], 700);
        assert_eq!(details["outline"], "truetype");
        assert_eq!(details["weight"], 400);
        assert_eq!(details["width"], 5);
        assert_eq!(details["tables"]["cmap"], 112);
        assert_eq!(details["names"]["license"], "Licensed for fixtures");
    }

    #[test]
    fn a_face_without_a_name_says_nothing_rather_than_guessing() {
        let (file, index) = file();
        let face = file.face(index).unwrap();
        assert_eq!(text(&face, 300), "");
    }
}
