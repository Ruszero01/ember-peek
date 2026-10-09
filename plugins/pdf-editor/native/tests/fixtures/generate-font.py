"""Generate the Apache-2.0 test font; requires fonttools (not used in CI)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

characters = "中文修改"
names = [".notdef", "space"] + [f"uni{ord(c):04X}" for c in characters]
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(names)
font.setupCharacterMap({32: "space", **{ord(c): names[i + 2] for i, c in enumerate(characters)}})
glyphs = {}
for i, name in enumerate(names):
    pen = TTGlyphPen(None)
    # Distinct simple contours exercise CID mapping, not Chinese typography.
    if name != "space":
        for bar in range(i + 1):
            x = 60 + bar * 110
            pen.moveTo((x, 100)); pen.lineTo((x + 70, 100))
            pen.lineTo((x + 70, 800)); pen.lineTo((x, 800)); pen.closePath()
    glyphs[name] = pen.glyph()
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (1000, 0) for name in names})
font.setupHorizontalHeader(ascent=900, descent=-100)
font.setupNameTable({"familyName": "Ember Peek Test CJK", "styleName": "Regular",
                    "uniqueFontIdentifier": "EmberPeekTestCJK-Regular", "fullName": "Ember Peek Test CJK Regular",
                    "psName": "EmberPeekTestCJK-Regular", "version": "Version 1.0",
                    "copyright": "Copyright 2026 Ember Peek contributors. Apache-2.0."})
font.setupOS2(sTypoAscender=900, sTypoDescender=-100, usWinAscent=900, usWinDescent=100)
font.setupPost()
font.setupMaxp()
font.font["head"].created = font.font["head"].modified = 2082844800
font.font.recalcTimestamp = False
font.save(Path(__file__).resolve().with_name("test-cjk.ttf"))
