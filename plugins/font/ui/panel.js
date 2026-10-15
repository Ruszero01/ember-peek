// The panel: finding one character, reading what it is, and setting a variable font's axes.
//
// This is a second document. It owns the search field and the numbers, and the view owns the font
// and the character list — so the glyph picture here is drawn there and handed over as an image,
// while everything that is a fact about the file is asked for directly.
//
// The skeleton is built once and only its parts are rewritten: rebuilding the search bar on every
// selection would take the caret out of the field the user is typing in.
import { ready, panel, postTo, onMessage, clipboard, onLocale } from "./sdk.js";
import { mountSearchBar } from "./sdk-search.js";
import * as native from "./native.js";
import { blockName, blockOf, character, hex } from "./glyphs.js";
import { say } from "./strings.js";

export async function startPanel(data) {
  const { role } = await ready;
  if (role !== "panel") return;
  const root = document.querySelector("#panel");
  root.hidden = false;

  const state = {
    face: 0,
    faces: data?.faces || [],
    details: null,
    total: 0,
    unencoded: 0,
    selected: null,
    renderable: false,
    // The library has not said anything yet: the panel knows nothing about this font, and must
    // not report that the engine refused it.
    known: false,
    axes: {},
    image: null,
    box: null,
    glyph: null,
    same: [],
    query: "",
    matches: null,
  };

  const search = document.createElement("div");
  const picture = document.createElement("section");
  picture.className = "card glyph-card";
  const axes = document.createElement("section");
  axes.className = "card axes-card";
  const facts = document.createElement("dl");
  facts.className = "ui-fields facts";
  root.replaceChildren(search, picture, axes, facts);

  let bar = mountBar();
  function mountBar() {
    return mountSearchBar({
      root: search,
      placeholder: say("search"),
      // The library is in the sidebar and the charater list lives there, so a query is resolved
      // by the mount that can answer it.
      onQuery: (value) => {
        state.query = value;
        void postTo("sidebar", { kind: "find", value });
      },
      onStep: (direction) => void postTo("sidebar", { kind: "step", direction }),
      onClose: () => {
        void postTo("view", { kind: "closed" });
        void panel(false);
      },
    });
  }

  onMessage((payload) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.kind === "state") {
      const changed = payload.face !== state.face || payload.selected !== state.selected;
      Object.assign(state, payload);
      state.known = true;
      drawAxes();
      if (changed) void loadGlyph();
      drawGlyph();
      drawFacts();
      bar.setStatus({
        query: state.query,
        count: state.matches?.count || 0,
        index: state.matches?.index || 0,
      });
      return;
    }
    if (payload.kind === "image") {
      state.image = payload.data;
      state.box = payload.box;
      drawGlyph();
      return;
    }
  });

  onLocale(() => {
    // The bar's own labels were written once, so the bar is built again and given the query back.
    bar = mountBar();
    bar.setStatus({ query: state.query, count: state.matches?.count || 0, index: state.matches?.index || 0 });
    drawGlyph();
    drawAxes();
    drawFacts();
  });
  drawAxes();
  drawGlyph();
  drawFacts();
  // The library mount has the character list and the font; the view owns the toolbar control that
  // opened this panel, so it is told when the panel closes and nothing else.
  void postTo("sidebar", { kind: "ready" });

  /** The glyph's own facts, asked for when the selection changes rather than polled. */
  async function loadGlyph() {
    const face = state.face;
    const point = state.selected;
    if (point === null || point === undefined) {
      state.glyph = null;
      state.same = [];
      return;
    }
    const glyph = await native.glyph(face, point).catch(() => null);
    if (state.selected !== point || state.face !== face) return;
    state.glyph = glyph;
    state.same = glyph?.same || [];
    drawGlyph();
  }

  function drawGlyph() {
    picture.replaceChildren();
    const frame = document.createElement("div");
    frame.className = "glyph-picture";
    if (state.image) {
      const image = document.createElement("img");
      image.src = state.image;
      image.alt = "";
      frame.append(image);
    } else {
      const empty = document.createElement("span");
      empty.className = "glyph-empty";
      // Three different situations, said differently: the library has not spoken yet (or is not
      // open), nothing has been picked in it, the engine refused this font, or the glyph is
      // genuinely empty.
      const picked = state.selected !== null && state.selected !== undefined;
      empty.textContent = !state.known
        ? say("libraryHint")
        : !picked
          ? say("pickGlyph")
          : state.renderable
            ? say("empty")
            : say("noRender");
      frame.append(empty);
    }
    picture.append(frame);
    if (state.selected === null || state.selected === undefined) return;
    const code = document.createElement("p");
    code.className = "glyph-code";
    code.textContent = hex(state.selected);
    picture.append(code);
    picture.append(glyphFacts(), copyRow());
  }

  function glyphFacts() {
    const list = document.createElement("dl");
    list.className = "ui-fields";
    const glyph = state.glyph;
    const block = blockOf(state.selected);
    const rows = [
      [say("glyph"), glyph ? (glyph.glyph === null ? "—" : `#${glyph.glyph}`) : "…"],
      [say("block"), `${blockName(block)} · ${hex(block.start)}–${hex(block.end)}`],
      [say("advance"), glyph?.advance === null || glyph?.advance === undefined ? "" : String(glyph.advance)],
      [say("bearing"), glyph?.bearing === null || glyph?.bearing === undefined ? "" : String(glyph.bearing)],
      [say("ink"), state.box ? `${state.box.width} × ${state.box.height}` : ""],
      ["", glyph?.name || ""],
    ];
    for (const [name, value] of rows) {
      if (!value) continue;
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = name;
      dd.textContent = value;
      list.append(dt, dd);
    }
    if (state.same.length > 1) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dd.className = "same";
      dt.textContent = say("same");
      for (const point of state.same.slice(0, 32)) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = character(point) || hex(point);
        chip.title = hex(point);
        chip.addEventListener("click", () => void postTo("sidebar", { kind: "select", point }));
        dd.append(chip);
      }
      list.append(dt, dd);
    }
    return list;
  }

  function copyRow() {
    const row = document.createElement("div");
    row.className = "copy-row";
    for (const [label, asCharacter] of [
      [say("copyChar"), true],
      [say("copyCode"), false],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ui-button";
      button.textContent = label;
      button.addEventListener("click", () => {
        const value = asCharacter ? character(state.selected) : hex(state.selected);
        void clipboard(value).then(() => {
          button.textContent = say("copied");
          setTimeout(() => {
            button.textContent = label;
          }, 1200);
        });
      });
      row.append(button);
    }
    return row;
  }

  function drawAxes() {
    axes.replaceChildren();
    const list = state.details?.axes || [];
    axes.hidden = !list.length;
    if (!list.length) return;
    const heading = document.createElement("h2");
    heading.textContent = say("axes");
    axes.append(heading);
    for (const axis of list) {
      const row = document.createElement("div");
      row.className = "axis";
      const name = document.createElement("span");
      name.className = "axis-name";
      name.textContent = axis.tag;
      const value = document.createElement("output");
      const current = state.axes[axis.tag] ?? axis.default;
      value.textContent = String(Math.round(current));
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(axis.min);
      slider.max = String(axis.max);
      slider.step = String(Math.max(1, (axis.max - axis.min) / 200));
      slider.value = String(current);
      slider.addEventListener("input", () => {
        value.textContent = String(Math.round(Number(slider.value)));
        applyAxes({ [axis.tag]: Number(slider.value) });
      });
      row.append(name, slider, value);
      axes.append(row);
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "ui-button";
    reset.textContent = say("reset");
    reset.addEventListener("click", () => {
      const values = {};
      for (const axis of list) values[axis.tag] = axis.default;
      state.axes = { ...state.axes, ...values };
      drawAxes();
      applyAxes(values);
    });
    axes.append(reset);
  }

  /** An axis belongs to the font, not to one view of it: the sheet and the library both redraw. */
  function applyAxes(values) {
    void postTo("view", { kind: "axes", values });
    void postTo("sidebar", { kind: "axes", values });
  }

  function drawFacts() {
    facts.replaceChildren();
    const details = state.details;
    if (!details) return;
    const style = [
      details.typographicSubfamily || details.subfamily,
      details.style?.italic ? "Italic" : "",
      details.variable ? say("variable") : "",
      details.style?.monospaced ? say("monospaced") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const family = state.faces[state.face]?.family || details.typographicFamily || details.family;
    const rows = [
      [say("family"), family],
      [say("style"), style],
      [
        say("outline"),
        `${say(details.outline || "unknown")}${details.unitsPerEm ? ` · ${details.unitsPerEm} ${say("upem")}` : ""}`,
      ],
      [
        say("weight"),
        details.weight === null || details.weight === undefined
          ? ""
          : `${details.weight}${details.width ? ` · ${details.width}` : ""}`,
      ],
      [say("covered"), state.total ? String(state.total) : ""],
      [
        say("glyphs"),
        details.glyphs
          ? `${details.glyphs}${state.unencoded ? ` · ${state.unencoded} ${say("unencoded")}` : ""}`
          : "",
      ],
      [say("embedding"), embeddingText(details.embedding)],
      [say("designer"), details.names?.designer],
      [say("manufacturer"), details.names?.manufacturer],
      [say("version"), details.version],
      [say("license"), details.names?.license],
      [say("description"), details.names?.description],
      [say("copyright"), details.names?.copyright],
      [say("trademark"), details.names?.trademark],
    ];
    for (const [name, value] of rows) {
      if (!value) continue;
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = name;
      dd.textContent = String(value);
      // A value the panel shortens keeps its whole text in the tooltip.
      dd.title = String(value);
      facts.append(dt, dd);
    }
  }

  function embeddingText(embedding) {
    if (!embedding) return "";
    const level = embedding.level ? say(embedding.level) : "";
    const flags = [];
    if (embedding.fsType & 0x0100) flags.push("no subsetting");
    if (embedding.fsType & 0x0200) flags.push("bitmap only");
    return [level, ...flags].filter(Boolean).join(" · ");
  }
}
