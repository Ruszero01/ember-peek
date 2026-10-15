// The specimen sheet: the font at the size the toolbar states, ruled by the font's own metrics,
// and below it the same text at the sizes a specimen is judged at.
//
// The guides are not decoration. Ascender, cap height, x-height, baseline and descender are the
// numbers a type specimen exists to show, and the labels beside them are the font's own units —
// read from the file, not invented here. A guide the font does not state is left out rather than
// guessed at.
import { say } from "./strings.js";
import { variation } from "./font.js";

/** How tall the ruled line starts out, before the text itself decides. */
const MIN_HEIGHT = 132;
const MAX_HEIGHT = 380;
/** The ladder's sizes: each rung is about a third larger than the one above it. */
const LADDER = [12, 16, 22, 30, 40, 54, 72];

export class Specimen {
  constructor(root, { onInput, onFace }) {
    this.root = root;
    this.typing = root.querySelector("#typing");
    this.probe = root.querySelector("#probe");
    this.guides = root.querySelector("#guides");
    this.ruler = root.querySelector("#ruler");
    this.faces = root.querySelector("#faces");
    this.identity = root.querySelector("#identity");
    this.reading = root.querySelector("#reading");
    this.notice = root.querySelector("#notice");
    this.ladder = document.querySelector("#ladder");
    this.details = null;
    this.size = 64;
    this.family = "";
    this.axes = {};
    this.guidesOn = true;
    this.missing = new Set();
    this.rungs = [];
    this.typing.dataset.placeholder = say("specimenPlaceholder");
    this.typing.addEventListener("input", () => {
      if (!this.typing.textContent.trim()) this.typing.replaceChildren();
      this.renderLadderText();
      this.paint();
      onInput?.(this.text());
    });
    this.faces.addEventListener("click", (event) => {
      const chip = event.target.closest("button[data-face]");
      if (chip) onFace?.(Number(chip.dataset.face));
    });
  }

  text() {
    return this.typing.textContent.replace(/\u00a0/g, " ");
  }

  setText(text) {
    this.typing.textContent = text;
    this.renderLadderText();
    this.paint();
  }

  /** Everything about the face being shown. */
  update({ face, faces, details, family, size, sample, axes }) {
    this.details = details;
    this.family = family;
    this.size = size;
    this.axes = axes || this.axes;
    if (!this.text() && sample) this.setText(sample);
    this.renderFaces(faces, face);
    this.renderColophon();
    this.apply();
    this.paint();
  }

  setAxes(axes) {
    this.axes = { ...axes };
    this.apply();
  }

  setSize(size) {
    this.size = size;
    this.apply();
    this.paint();
  }

  setGuides(on) {
    this.guidesOn = on;
    this.guides.hidden = !on;
    this.ruler.hidden = !on;
    if (on) this.apply();
  }

  setFamily(family) {
    this.family = family;
    this.apply();
  }

  /** The characters the font does not have, as the native half answered for the current text. */
  setMissing(points) {
    this.missing = points instanceof Set ? points : new Set(points || []);
    this.paint();
  }

  /** What this sheet cannot do, said beside the reading rather than instead of it. */
  setNotice(message) {
    if (this.notice) {
      this.notice.textContent = message || "";
      this.notice.hidden = !message;
    }
  }

  /** The loaded face, at the current size: the same font on the typing element and on the probe
   * that measures where its baseline sits in a line. */
  apply() {
    if (!this.family) return;
    const settings = variation(this.axes);
    for (const element of [this.typing, this.probe]) {
      element.style.fontFamily = `"${this.family}"`;
      element.style.fontSize = `${this.size}px`;
      element.style.fontVariationSettings = settings;
    }
    for (const rung of this.rungs) {
      rung.line.style.fontFamily = `"${this.family}"`;
      rung.line.style.fontVariationSettings = settings;
    }
    const metrics = this.details?.metrics;
    if (!metrics) return;
    // The line box is exactly the font's own ascender plus its descender, so the baseline is
    // where the font says it is and the guides can be computed instead of eyeballed.
    const scale = this.size / (this.details.unitsPerEm || 1000);
    const box = Math.max(1, (metrics.ascent - metrics.descent) * scale);
    for (const element of [this.typing, this.probe]) element.style.lineHeight = `${box}px`;
    const paper = this.root.querySelector(".paper");
    // The ruled line is at least the em box and its padding; longer text makes it taller, and the
    // sheet scrolls as a whole, so the guides stay on the line they belong to.
    const wanted = Math.round(box * 1.5 + 44);
    paper.style.minHeight = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, wanted))}px`;
    this.measure();
  }

  // Where the browser actually puts the baseline, measured rather than assumed: a zero-height
  // inline block sits on it, so its bottom edge is the line.
  measure() {
    if (!this.guidesOn || !this.details) return;
    const mark = this.probe.querySelector(".probe-mark");
    const probe = this.probe.getBoundingClientRect();
    const baseline = mark.getBoundingClientRect().bottom - probe.top;
    const metrics = this.details.metrics;
    const scale = this.size / (this.details.unitsPerEm || 1000);
    const rows = [
      { kind: "ascender", value: metrics.ascent },
      { kind: "cap", value: metrics.capHeight },
      { kind: "x", value: metrics.xHeight },
      { kind: "baseline", value: 0 },
      { kind: "descender", value: metrics.descent },
    ].filter(
      (row) =>
        row.kind === "baseline" ||
        row.kind === "ascender" ||
        row.kind === "descender" ||
        (row.value !== null && row.value !== undefined),
    );
    this.guides.replaceChildren();
    this.ruler.replaceChildren();
    // At a small size the ascender, cap height, x-height, baseline and descender sit within a few
    // pixels of one another, and a stack of overlapping numbers reads worse than none: a label is
    // only written where it has room, and the baseline always has room.
    const kept = [];
    const labelled = new Set();
    for (const row of [...rows].sort((left, right) => Math.abs(left.value) - Math.abs(right.value))) {
      const top = baseline - row.value * scale;
      if (row.kind !== "baseline" && kept.some((other) => Math.abs(other - top) < 12)) continue;
      kept.push(top);
      labelled.add(row.kind);
    }
    for (const row of rows) {
      const top = baseline - row.value * scale;
      const rule = document.createElement("div");
      rule.className = `guide ${row.kind}`;
      rule.style.top = `${top}px`;
      this.guides.append(rule);
      if (!labelled.has(row.kind)) continue;
      const label = document.createElement("b");
      label.className = `tick ${row.kind}`;
      label.style.top = `${top}px`;
      label.textContent = String(row.value);
      this.ruler.append(label);
    }
  }

  /** The ladder: the same text at the sizes a specimen sheet would show it at. */
  renderLadder() {
    if (!this.ladder) return;
    this.ladder.replaceChildren();
    this.rungs = LADDER.map((size) => {
      const rung = document.createElement("div");
      rung.className = "rung";
      const label = document.createElement("b");
      label.className = "rung-size";
      label.textContent = String(size);
      const line = document.createElement("span");
      line.className = "rung-line";
      line.style.fontSize = `${size}px`;
      line.textContent = this.text();
      rung.append(label, line);
      this.ladder.append(rung);
      return { size, line };
    });
    this.apply();
  }

  renderLadderText() {
    if (!this.rungs.length) this.renderLadder();
    else for (const rung of this.rungs) rung.line.textContent = this.text();
  }

  // The face rail: one chip per face, and only for a file that holds more than one.
  renderFaces(faces, current) {
    const many = Array.isArray(faces) && faces.length > 1;
    this.faces.hidden = !many;
    if (!many) return;
    this.faces.replaceChildren(
      ...faces.map((face, index) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.face = String(index);
        chip.textContent = face.subfamily || face.family || `#${index}`;
        chip.title = face.postscript || face.family || "";
        chip.className = index === current ? "chip on" : "chip";
        chip.setAttribute("aria-pressed", index === current ? "true" : "false");
        return chip;
      }),
    );
  }

  /** The sheet's own colophon: who this face is, on the left; what the typing found, on the right. */
  renderColophon() {
    const details = this.details;
    if (!details) return;
    const parts = [
      details.typographicFamily || details.family,
      details.typographicSubfamily || details.subfamily,
      details.version,
    ]
      .filter(Boolean)
      .map((part) => part.trim());
    if (details.variable) parts.push(say("variable"));
    if (details.style?.monospaced) parts.push(say("monospaced"));
    this.identity.textContent = parts.join(" · ");
    this.paint();
  }

  /** Mark what the font cannot draw, and say how much of it there was.
   *
   * The marking goes through the platform's own highlight channel, so the editable text keeps its
   * own nodes: wrapping characters to mark them would fight the caret. */
  paint() {
    const text = this.text();
    let missing = 0;
    if (text) {
      const ranges = [];
      const walker = document.createTreeWalker(this.typing, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let at = 0;
        for (const glyph of node.data) {
          if (this.missing.has(glyph.codePointAt(0))) {
            missing += 1;
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + glyph.length);
            ranges.push(range);
          }
          at += glyph.length;
        }
      }
      if (globalThis.CSS?.highlights) {
        const highlight = new Highlight();
        for (const range of ranges) highlight.add(range);
        if (ranges.length) CSS.highlights.set("font-missing", highlight);
        else CSS.highlights.delete("font-missing");
      }
    } else if (globalThis.CSS?.highlights) {
      CSS.highlights.delete("font-missing");
    }
    this.reading.textContent = missing ? say("notInFont", { count: missing }) : "";
    this.reading.classList.toggle("warning", missing > 0);
  }
}

/** The characters a sample would use, so the font can be asked about them one by one. */
export function sampleCandidates() {
  const sample = [
    "Ember Peek",
    "落霞与孤鹜齐飞，秋水共长天一色",
    "秋水共长天一色",
    "0123456789",
    "いろはにほへと",
    "다람쥐 헌 쳇바퀴",
    "Съешь ещё этих мягких булок",
  ].join("");
  return [...new Set([...sample].map((glyph) => glyph.codePointAt(0)))];
}

/**
 * A sample chosen from what the font covers, so the sheet never opens on an empty line.
 *
 * The Latin line is the product's own name, which is a specimen-sized phrase in its own right,
 * and the Chinese line is the couplet from 《滕王阁序》 that specimens are set in most often. The
 * tests are against `sampleCandidates`, because the coverage handed in is the answer about those
 * characters and nothing else.
 */
export function defaultSample(covered) {
  const covers = (text) => [...text].every((glyph) => covered.has(glyph.codePointAt(0)));
  const parts = [];
  if (covers("Ember Peek")) parts.push("Ember Peek");
  // A font that reaches Chinese without the whole couplet still gets its most ordinary half, and
  // one that reaches none of it falls through to the scripts it may have instead.
  if (covers("落霞与孤鹜齐飞，秋水共长天一色")) parts.push("落霞与孤鹜齐飞，秋水共长天一色");
  else if (covers("秋水共长天一色")) parts.push("秋水共长天一色");
  else if (covers("いろはにほへと")) parts.push("いろはにほへと");
  else if (covers("다람쥐 헌 쳇바퀴")) parts.push("다람쥐 헌 쳇바퀴");
  else if (covers("Съешь ещё этих мягких булок")) parts.push("Съешь ещё этих мягких булок");
  if (covered.has(0x30)) parts.push("0123456789");
  return parts.join("  ");
}
