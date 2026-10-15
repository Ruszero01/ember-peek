// The two list encodings the native half answers with, on their own so they can be checked
// without a document around them.
//
// Code points arrive delta-encoded: each step is written as a variable-length number, seven bits
// a byte, least significant group first, high bit meaning another byte follows — the shape the
// font formats use for their own numbers. Each page starts from zero, so a page decodes without
// the pages before it.

/** A page of code points, as absolute code points. */
export function decodePoints(encoded) {
  const bytes = decodeBase64(encoded);
  const points = [];
  let value = 0;
  let shift = 0;
  let previous = 0;
  for (const byte of bytes) {
    value |= (byte & 0x7f) << shift;
    if (byte & 0x80) {
      shift += 7;
      continue;
    }
    previous += value;
    points.push(previous);
    value = 0;
    shift = 0;
  }
  return points;
}

/** A page of glyph ids: two big-endian bytes each. */
export function decodeGlyphs(encoded) {
  const bytes = decodeBase64(encoded);
  const glyphs = [];
  for (let at = 0; at + 1 < bytes.length; at += 2)
    glyphs.push((bytes[at] << 8) | bytes[at + 1]);
  return glyphs;
}

function decodeBase64(text) {
  const binary = atob(text || "");
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
