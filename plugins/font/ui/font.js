// The face the interface draws with.
//
// The bytes go from disk to the browser's font engine without passing through this document: the
// engine loads a URL, so a 20 MB collection costs the plugin's memory nothing at all. What this
// module keeps is a family name.
import { fileUrl, resourceUrl } from "./sdk.js";
import * as native from "./native.js";

export class PreviewFont {
  constructor() {
    this.family = "";
    this.ready = false;
    this.axes = {};
  }

  /**
   * Register one face and hand back the family name to draw with. `source` is what the native
   * half said about how this face reaches the browser: the file itself, or a face it wrote out
   * because the engine cannot read the container.
   */
  async load(index, source) {
    const family = `ember-font-${Math.random().toString(36).slice(2, 9)}-${index}`;
    const url = source.mode === "extract" ? resourceUrl(source.path) : fileUrl();
    const face = new FontFace(family, `url("${url}")`);
    await face.load();
    document.fonts.add(face);
    this.family = family;
    this.ready = true;
    return family;
  }

  /** The CSS to draw text in this face at `size` with the given variation axis values. */
  style(size, axes = {}) {
    return {
      fontFamily: `"${this.family}"`,
      fontSize: `${size}px`,
      fontVariationSettings: variation(axes),
    };
  }

  apply(element, size, axes) {
    const style = this.style(size, axes);
    element.style.fontFamily = style.fontFamily;
    element.style.fontSize = style.fontSize;
    element.style.fontVariationSettings = style.fontVariationSettings;
  }
}

/**
 * Load one face the way the engine can take it: the file itself when the container allows it, and
 * otherwise — or if the engine refuses the file as it stands — the face the native half writes
 * out. That copy is rebuilt, which is also a repair: a table directory in the order parsers expect
 * and freshly computed checksums are enough for some files an engine turns down as they are.
 */
export async function loadFace(font, index, summary) {
  const written = async () => {
    const file = await native.faceFile(index);
    return font.load(index, { mode: "extract", ...file });
  };
  if (summary?.render === "extract") return written();
  try {
    return await font.load(index, { mode: "direct" });
  } catch (refused) {
    try {
      return await written();
    } catch {
      throw refused;
    }
  }
}

/** The CSS value for a set of variation axis values; `normal` when there are none. */
export function variation(axes = {}) {
  const settings = Object.entries(axes)
    .map(([tag, value]) => `"${tag}" ${value}`)
    .join(", ");
  return settings || "normal";
}

/**
 * One glyph, drawn where the font is, as an image the panel can show: the panel is a second
 * document, and loading a 17 MB font twice to draw one character is not a trade worth making.
 * The ink box comes out of the same pixels — the part of the em the glyph actually covers is a
 * fact no table states.
 */
export function drawGlyph(point, font, details, size = 128) {
  if (!font?.family || !font.ready) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, size, size);
  const pixels = Math.round(size * 0.62);
  context.font = `${pixels}px "${font.family}"`;
  context.fontVariationSettings = variation(font.axes || {});
  context.fillStyle =
    getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#888";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const glyph = point > 0x10ffff ? "" : String.fromCodePoint(point);
  if (!glyph) return null;
  context.fillText(glyph, size / 2, size / 2);
  const data = context.getImageData(0, 0, size, size).data;
  let x0 = size;
  let y0 = size;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      if (data[(y * size + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  const units = details?.unitsPerEm || 1000;
  const perUnit = pixels / units;
  const box =
    x1 >= x0
      ? { width: Math.round((x1 - x0 + 1) / perUnit), height: Math.round((y1 - y0 + 1) / perUnit) }
      : null;
  return { data: canvas.toDataURL("image/png"), box };
}

// One canvas measures every glyph's ink. Whether a glyph draws anything is the browser's own
// answer, and it is a fact about the cell: a space, a no-break space and a soft hyphen are all
// encoded and all draw nothing.
const measuring = document.createElement("canvas");
measuring.width = 48;
measuring.height = 48;
const context = measuring.getContext("2d", { willReadFrequently: true });
let measuredFamily = "";

/** Whether the character draws any ink at all in this face, at this family. */
export function hasInk(character, family, size = 40) {
  if (!context || !family) return true;
  if (measuredFamily !== family) {
    measuredFamily = family;
    context.clearRect(0, 0, measuring.width, measuring.height);
  }
  context.clearRect(0, 0, measuring.width, measuring.height);
  context.font = `${size}px "${family}"`;
  context.fillStyle = "#000";
  context.fillText(character, 2, 40);
  const pixels = context.getImageData(0, 0, measuring.width, measuring.height).data;
  for (let at = 3; at < pixels.length; at += 4) if (pixels[at] > 8) return true;
  return false;
}
