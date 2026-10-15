// The glyph library: every character the font encodes, in compartments by Unicode block.
//
// Nothing here enumerates a font. A page of characters is asked for when the viewport comes near
// where it would be, so opening a CJK font costs one page and a placeholder for the rest, and a
// reader who never scrolls never pays for forty thousand characters. Only the rows the viewport
// can see exist as nodes, whatever the font's size.
import { say } from "./strings.js";
import { blockName, character, compartments as group, hex, range } from "./glyphs.js";
import { hasInk, variation } from "./font.js";

const DENSITY = 44;
const CELL_MIN = 30;
const CELL_MAX = 64;
/** Below this cell size the code point label would be unreadable, so the cell is the glyph. */
const LABEL_ABOVE = 40;
const HEAD_HEIGHT = 30;
const CHIP_HEIGHT = 28;
const LOOKAHEAD = 600;

const UNKNOWN = 0;
const INK = 1;
const HOLLOW = 2;

export class GlyphCase {
  constructor(root, { onSelect, loadNames, requestPage, requestUnencoded }) {
    this.root = root;
    this.scroller = root.querySelector("#scroll");
    this.sheet = root.querySelector("#sheet");
    this.current = root.querySelector("#current");
    this.picked = root.querySelector("#selected");
    this.onSelect = onSelect;
    this.loadNames = loadNames;
    this.requestPage = requestPage;
    this.requestUnencoded = requestUnencoded;
    this.points = new Int32Array(0);
    this.total = 0;
    this.rows = [];
    this.mounted = new Map();
    this.ink = new Uint8Array(0);
    this.family = "";
    this.axes = {};
    this.density = DENSITY;
    this.unencodedTotal = 0;
    this.unencoded = [];
    this.names = new Map();
    this.selected = null;
    this.visible = true;
    this.pending = false;
    this.rebuildPending = false;
    this.scroller.addEventListener("scroll", () => this.schedule(), { passive: true });
    this.scroller.addEventListener("keydown", (event) => this.onKey(event));
    // One listener for the whole case: the cells come and go with the scroll, and a cell's own
    // index is the only thing that identifies it.
    this.sheet.addEventListener("click", (event) => {
      const cell = event.target.closest?.(".cell");
      if (!cell) return;
      const point = this.points[Number(cell.dataset.index)];
      if (point !== undefined) this.select(point, { scroll: false });
    });
    window.addEventListener("resize", () => this.schedule());
  }

  setFont(family) {
    this.family = family;
    this.ink = new Uint8Array(this.points.length);
    this.rebuild();
  }

  setAxes(axes) {
    this.axes = { ...axes };
    this.ink = new Uint8Array(this.points.length);
    for (const element of this.mounted.values()) element.remove();
    this.mounted.clear();
    this.paint();
  }

  setDensity(px) {
    this.density = Math.max(CELL_MIN, Math.min(CELL_MAX, px));
    this.rebuild();
  }

  /** Nothing is known about this face yet: the library starts empty and fills in page by page. */
  reset() {
    this.points = new Int32Array(0);
    this.total = 0;
    this.unencodedTotal = 0;
    this.unencoded = [];
    this.names.clear();
    this.selected = null;
    if (this.picked) this.picked.textContent = "";
    this.ink = new Uint8Array(0);
    this.rebuild();
  }

  setTotal(total) {
    this.total = total || 0;
    this.rebuild();
  }

  setUnencodedTotal(total) {
    this.unencodedTotal = total || 0;
    this.rebuild();
  }

  /** A loaded page, in order: the layout only ever grows at its end. */
  append(points, offset = this.points.length) {
    if (!points.length) return;
    // A page that is not the next one is dropped rather than spliced in: the list is a prefix of
    // the font's characters, and anything else would put them in the wrong places.
    if (offset !== this.points.length) return;
    const grown = new Int32Array(this.points.length + points.length);
    grown.set(this.points, 0);
    grown.set(points, this.points.length);
    this.points = grown;
    const ink = new Uint8Array(grown.length);
    ink.set(this.ink.subarray(0, Math.min(this.ink.length, grown.length)));
    this.ink = ink;
    this.rebuild();
  }

  select(point, { scroll = true } = {}) {
    this.selected = point;
    // The picked character is named in this mount's own header as well as in the inspector: the
    // inspector is a floating panel the reader may have dragged anywhere, and what is being
    // pointed at should be legible where the pointing happens.
    if (this.picked)
      this.picked.textContent =
        point === null || point === undefined ? "" : hex(point);
    const index = this.indexOf(point);
    if (index >= 0) {
      this.markSelection(index);
      if (scroll) this.scrollToIndex(index);
    }
    this.onSelect?.(point);
  }

  indexOf(point) {
    let low = 0;
    let high = this.points.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.points[middle] < point) low = middle + 1;
      else if (this.points[middle] > point) high = middle - 1;
      else return middle;
    }
    return -1;
  }

  /** Scroll so that a slot of the list is in view, loading nothing: the caller loads first. */
  scrollToIndex(index) {
    const row = this.rows.find(
      (candidate) => candidate.kind === "glyphs" && index >= candidate.from && index < candidate.to,
    );
    if (!row) return;
    this.scroller.scrollTop = Math.max(0, row.top - this.scroller.clientHeight / 3);
    requestAnimationFrame(() => {
      const mounted = this.mounted.get(this.rows.indexOf(row));
      mounted?.querySelector(`.cell[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }

  cellSize() {
    return this.density;
  }

  rebuild() {
    const cell = this.cellSize();
    this.cell = cell;
    const label = cell >= LABEL_ABOVE;
    this.cellHeight = cell + (label ? 16 : 4);
    const width = Math.max(120, this.scroller.clientWidth - 2);
    this.columns = Math.max(1, Math.floor(width / cell));
    this.groups = group(this.points);
    this.rows = [];
    let top = 0;
    const push = (row) => {
      row.top = top;
      this.rows.push(row);
      top += row.height;
    };
    for (const compartment of this.groups) {
      push({ kind: "head", compartment, height: HEAD_HEIGHT });
      const count = compartment.to - compartment.from;
      for (let at = 0; at < count; at += this.columns)
        push({
          kind: "glyphs",
          from: compartment.from + at,
          to: Math.min(compartment.to, compartment.from + at + this.columns),
          height: this.cellHeight,
        });
    }
    // What has not been read yet still has to take up its room, or the scrollbar would lie about
    // how much of the font is below.
    const missing = Math.max(0, this.total - this.points.length);
    if (missing) {
      const rows = Math.ceil(missing / this.columns);
      push({ kind: "tail", from: this.points.length, missing, height: Math.max(this.cellHeight * 3, rows * this.cellHeight) });
    }
    if (this.unencodedTotal && !missing) {
      push({ kind: "unencoded-head", height: HEAD_HEIGHT });
      for (let at = 0; at < this.unencodedTotal; at += this.columns)
        push({
          kind: "unencoded",
          from: at,
          to: Math.min(this.unencodedTotal, at + this.columns),
          height: CHIP_HEIGHT,
        });
    }
    this.height = top;
    this.sheet.style.height = `${top}px`;
    for (const element of this.mounted.values()) element.remove();
    this.mounted.clear();
    this.paint();
  }

  schedule() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.paint();
    });
  }

  rowAt(y) {
    let low = 0;
    let high = this.rows.length - 1;
    let found = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.rows[middle].top <= y) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  paint() {
    if (!this.visible) return;
    const from = this.rowAt(this.scroller.scrollTop);
    const to = this.rowAt(this.scroller.scrollTop + this.scroller.clientHeight);
    for (const [index, element] of this.mounted)
      if (index < from || index > to + 1) {
        element.remove();
        this.mounted.delete(index);
      }
    for (let index = from; index <= Math.min(to + 1, this.rows.length - 1); index += 1)
      if (!this.mounted.has(index)) this.mount(index);
    this.updateCurrent(from);
    this.request();
  }

  /** Ask for the next page once the end of what is loaded comes near. */
  request() {
    const remaining =
      this.sheet.getBoundingClientRect().height - this.scroller.scrollTop - this.scroller.clientHeight;
    if (remaining >= LOOKAHEAD) return;
    if (this.points.length < this.total) {
      this.requestPage?.(this.points.length);
      return;
    }
    // Everything the keyboard reaches is here; the glyphs nothing reaches follow, and they are
    // read the same way — when their rows come into view.
    if (this.unencodedTotal > this.unencoded.length)
      this.requestUnencoded?.(this.unencoded.length);
  }

  mount(index) {
    const row = this.rows[index];
    if (!row) return;
    const element =
      row.kind === "head" || row.kind === "unencoded-head"
        ? this.headOf(row)
        : row.kind === "glyphs"
          ? this.glyphRow(row)
          : row.kind === "tail"
            ? this.tailOf(row)
            : this.unencodedRow(row);
    element.style.top = `${row.top}px`;
    this.sheet.append(element);
    this.mounted.set(index, element);
  }

  headOf(row) {
    const element = document.createElement("div");
    element.className = "case-head";
    const name = document.createElement("span");
    name.className = "case-name";
    const where = document.createElement("span");
    where.className = "case-range";
    if (row.kind === "head") {
      name.textContent = blockName(row.compartment);
      where.textContent = `${range(row.compartment.start, row.compartment.end)} · ${row.compartment.count}`;
    } else {
      name.textContent = say("unencodedHead");
      where.textContent = String(this.unencodedTotal);
    }
    element.append(name, where);
    return element;
  }

  tailOf(row) {
    const element = document.createElement("div");
    element.className = "case-tail";
    const note = document.createElement("span");
    note.textContent = say("loadingMore", { count: row.missing.toLocaleString() });
    element.append(note);
    void row.from;
    return element;
  }

  glyphRow(row) {
    const element = document.createElement("div");
    element.className = "case-row";
    const label = this.cell >= LABEL_ABOVE;
    for (let index = row.from; index < row.to; index += 1) {
      const point = this.points[index];
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = label ? "cell" : "cell tight";
      cell.dataset.index = String(index);
      cell.style.width = `${this.cell}px`;
      cell.style.height = `${this.cellHeight}px`;
      const ink = document.createElement("span");
      ink.className = "ink";
      ink.textContent = character(point);
      this.applyFont(ink);
      cell.append(ink);
      if (label) {
        const code = document.createElement("i");
        code.textContent = hex(point);
        cell.append(code);
      }
      if (this.ink[index] === UNKNOWN) this.measure(index, cell, character(point));
      else if (this.ink[index] === HOLLOW) cell.classList.add("hollow");
      if (point === this.selected) cell.setAttribute("aria-selected", "true");
      element.append(cell);
    }
    return element;
  }

  // Whether a glyph draws anything is the browser's answer, asked once per glyph and kept: an
  // encoded cell that draws nothing looks broken otherwise, and it is a fact worth showing.
  measure(index, cell, glyph) {
    if (!this.family || !glyph || glyph === " ") {
      this.ink[index] = HOLLOW;
      cell.classList.add("hollow");
      return;
    }
    const filled = hasInk(glyph, this.family, Math.min(40, this.cell));
    this.ink[index] = filled ? INK : HOLLOW;
    if (!filled) cell.classList.add("hollow");
  }

  unencodedRow(row) {
    const element = document.createElement("div");
    element.className = "case-row chips";
    for (let at = row.from; at < row.to; at += 1) {
      const glyph = this.unencoded[at];
      const chip = document.createElement("span");
      chip.className = "chip gid";
      const index = document.createElement("b");
      index.textContent = `#${glyph === undefined ? at : glyph}`;
      const name = document.createElement("span");
      const known = glyph === undefined ? undefined : this.names.get(glyph);
      name.textContent = known || "";
      chip.append(index, name);
      element.append(chip);
      if (glyph !== undefined && known === undefined) this.requestName(glyph);
    }
    return element;
  }

  requestName(glyph) {
    if (!this.loadNames || this.names.has(glyph)) return;
    this.names.set(glyph, "");
    this.loadNames([glyph]).then((names) => {
      const name = names?.[0];
      if (!name) return;
      this.names.set(glyph, name);
      for (const [index, element] of this.mounted) {
        if (this.rows[index]?.kind !== "unencoded") continue;
        for (const chip of element.children)
          if (chip.firstChild.textContent === `#${glyph}`) chip.lastChild.textContent = name;
      }
    });
  }

  applyFont(element) {
    element.style.fontFamily = `"${this.family}"`;
    element.style.fontSize = `${Math.round(this.cell * 0.66)}px`;
    element.style.fontVariationSettings = variation(this.axes);
  }

  markSelection(index) {
    for (const element of this.mounted.values())
      for (const cell of element.querySelectorAll?.(".cell") || []) {
        if (Number(cell.dataset.index) === index) cell.setAttribute("aria-selected", "true");
        else cell.removeAttribute("aria-selected");
      }
  }

  updateCurrent(from) {
    const row = this.rows[from];
    if (!row || !this.current) return;
    if (row.kind === "head") {
      this.current.textContent = `${blockName(row.compartment)} · ${range(row.compartment.start, row.compartment.end)}`;
      return;
    }
    if (row.kind === "unencoded" || row.kind === "unencoded-head") {
      this.current.textContent = say("unencodedHead");
      return;
    }
    if (row.kind === "tail") {
      this.current.textContent = say("libraryLoading");
      return;
    }
    const compartment = this.groups.find(
      (candidate) => row.from >= candidate.from && row.from < candidate.to,
    );
    if (compartment)
      this.current.textContent = `${blockName(compartment)} · ${range(compartment.start, compartment.end)}`;
  }

  onKey(event) {
    if (this.selected === null) return;
    const index = this.indexOf(this.selected);
    if (index < 0) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -this.columns, ArrowDown: this.columns }[
      event.key
    ];
    if (!step) return;
    const next = index + step;
    if (next < 0 || next >= this.points.length) {
      if (next >= this.points.length && this.requestPage) this.requestPage(this.points.length);
      return;
    }
    event.preventDefault();
    this.select(this.points[next]);
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible) this.paint();
  }

  /** The names in the unencoded section arrive as their rows appear. */
  setUnencoded(glyphs) {
    this.unencoded = glyphs;
    for (const [index, element] of this.mounted)
      if (this.rows[index]?.kind === "unencoded") {
        element.remove();
        this.mounted.delete(index);
      }
    this.paint();
  }
}
