// The native half answers what the browser's font engine cannot: what this file is, and which
// characters it encodes. The bytes are never read here — the engine loads the font itself — and
// nothing is enumerated until the interface asks for a page of it: opening a font costs a fact
// list, and a character set is read only when someone looks at it.
import { call } from "./sdk.js";
import { decodeGlyphs, decodePoints } from "./wire.js";

/** Characters one page holds. The native side caps a request at this. */
export const PAGE = 4096;
/** Glyph ids one request asks for. */
const GLYPH_PAGE = 4096;
/** Glyph names one request asks for. */
const NAME_PAGE = 256;
/** Characters one coverage question may ask about. */
const COVERS_PAGE = 256;

/** Everything the specimen and the facts list quote about one face. */
export function details(face) {
  return call("details", { face });
}

/** One page of the character list, in index order. The page carries the list's total. */
export async function page(face, offset, count = PAGE) {
  const answer = await call("coverage", { face, offset, count });
  return {
    total: Number(answer.total) || 0,
    unencoded: Number(answer.unencoded) || 0,
    offset: Number(answer.offset) || 0,
    points: decodePoints(answer.points),
  };
}

/** Whether a handful of characters are in the font — a line of typing, not a character set. */
export async function covers(face, points) {
  if (!points.length) return [];
  const answer = await call("covers", { face, points: points.slice(0, COVERS_PAGE) });
  return answer.covered || [];
}

/** Where a character sits in the list, and whether it is in it at all. */
export function rank(face, codepoint) {
  return call("rank", { face, codepoint });
}

/** Glyph ids no character reaches, one page at a time. */
export async function unencoded(face, offset, count = GLYPH_PAGE) {
  const answer = await call("unencoded", { face, offset, count });
  return { total: Number(answer.total) || 0, glyphs: decodeGlyphs(answer.glyphs) };
}

/** Glyph names for `glyphs`, in the same order. A font that names no glyphs answers with nulls. */
export function names(face, glyphs) {
  return call("names", { face, glyphs: glyphs.slice(0, NAME_PAGE) }).then((answer) => answer.names || []);
}

/** What one character is in this face: its glyph, its advance, and the characters sharing it. */
export function glyph(face, codepoint) {
  return call("glyph", { face, codepoint });
}

/** One face written out by the native side, for a container the engine cannot read itself. */
export function faceFile(face) {
  return call("face", { face });
}
