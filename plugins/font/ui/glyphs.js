// The character list as the interface reads it: which block each character belongs to, what a
// code point looks like, and which characters a query matches. All of it runs over the font's own
// sorted list, so nothing here keeps a second index of the font.
import { BLOCKS } from "./blocks.js";
import { locale } from "./sdk.js";
import { BLOCK_ZH, say } from "./strings.js";

/**
 * The characters grouped the way the case lays them out: each compartment knows its slice of the
 * character list, so a row can be cut out of it without scanning.
 */
export function compartments(points) {
  const found = [];
  let at = 0;
  let index = 0;
  for (const point of points) {
    while (at < BLOCKS.length && point > BLOCKS[at][2]) at += 1;
    if (at >= BLOCKS.length) break;
    const [name, start, end] = BLOCKS[at];
    if (point < start) {
      index += 1;
      continue;
    }
    const last = found[found.length - 1];
    if (!last || last.name !== name) {
      found.push({ name, start, end, from: index, to: index + 1, count: 1 });
    } else {
      last.to = index + 1;
      last.count += 1;
    }
    index += 1;
  }
  return found;
}

/** The block a code point belongs to, by binary search over the standard's own ranges. */
export function blockOf(point) {
  let low = 0;
  let high = BLOCKS.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [name, start, end] = BLOCKS[middle];
    if (point < start) high = middle - 1;
    else if (point > end) low = middle + 1;
    else return { name, start, end };
  }
  return { name: "", start: point, end: point };
}

/** A block's name in the interface language, or its standard name when it has none. */
export function blockName(block) {
  if (String(locale()).startsWith("zh") && BLOCK_ZH[block.name]) return BLOCK_ZH[block.name];
  return block.name;
}

export function hex(point) {
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function range(start, end) {
  return start === end ? hex(start) : `${hex(start)}–${hex(end)}`;
}

/** The character a code point stands for, or nothing when it stands for no character. */
export function character(point) {
  try {
    return String.fromCodePoint(point);
  } catch {
    return "";
  }
}

/** The code points of a piece of text, as characters rather than as UTF-16 units. */
export function pointsOf(text) {
  return [...String(text ?? "")].map((glyph) => glyph.codePointAt(0));
}

/**
 * What a query means, read the way someone would write it: a code point in hex, characters that
 * were typed, or the name of a Unicode block.
 *
 * The answer is a description, not a list of matches — the font is asked where those characters
 * are, so a search never has to hold the character set it is searching.
 */
export function resolveQuery(query) {
  const wanted = String(query ?? "").trim();
  if (!wanted) return null;
  // "AB" is both a plausible code point and two characters someone typed, so a short query is
  // read as characters unless it was written as a code point ("u+ab").
  const explicit = /^u\+?/i.test(wanted);
  const digits = wanted.replace(/^u\+?/i, "").replace(/\s+/g, "");
  if (/^[0-9a-f]{1,6}$/i.test(digits) && (explicit || digits.length >= 3))
    return { kind: "point", point: parseInt(digits, 16) };
  return { kind: "characters", characters: [...wanted] };
}

/**
 * The block a query names, when it names one: the second reading of a query that found no
 * character. A name has to look like a name — three letters, or two characters in a script that
 * does not spell words with spaces — or "ab" would answer "Arabic" and "de" "Devanagari".
 */
export function queryBlock(query) {
  const wanted = String(query ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const characters = [...wanted];
  const looksLikeAName =
    characters.length >= 3 ||
    (characters.length >= 2 && characters.some((glyph) => glyph.codePointAt(0) > 0x7f));
  if (!looksLikeAName) return null;
  // A few names are written as a shorthand far more often than in full; without these, "cjk"
  // would find whichever block happens to come first in the standard rather than the one meant.
  const alias = { cjk: "CJK Unified Ideographs", 中日韩: "CJK Unified Ideographs" };
  const named = alias[wanted];
  const block = named
    ? BLOCKS.find(([name]) => name === named)
    : BLOCKS.find(
        ([name]) => name.toLowerCase().includes(wanted) || (BLOCK_ZH[name] || "").includes(wanted),
      );
  return block ? { name: block[0], start: block[1], end: block[2] } : null;
}

/** The line the host's information area shows: what this face holds, and what is selected.
 *  `unit` names what the total counts — characters once the library has read them, glyphs before
 *  that — so the number is never labelled with something it is not. */
export function statusLine({ total, unit, blocks = 0, selected }) {
  const parts = [`${Number(total || 0).toLocaleString()} ${unit || say("covered")}`];
  if (blocks) parts.push(`${blocks} ${say("block")}`);
  if (selected !== null && selected !== undefined) parts.push(hex(selected));
  return parts.join(" · ");
}
