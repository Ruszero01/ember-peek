// The sidebar: the font's whole character set, read one page at a time.
//
// This is the only mount that enumerates anything, and only because someone opened the library to
// look at it: a page of characters is fetched when the viewport comes near where it would be, and
// the part that has not been read is a placeholder that still occupies its room in the scroll. A
// reader who never opens the sidebar never reads a single character.
import { ready, postTo, onMessage, onLocale, onVisibility } from "./sdk.js";
import * as native from "./native.js";
import { PreviewFont, drawGlyph, loadFace } from "./font.js";
import { GlyphCase } from "./case.js";
import { queryBlock, resolveQuery } from "./glyphs.js";
import { errorText } from "./strings.js";

/** How wide the library's cells are. The dock's own width is the reader's density control. */
const DENSITY = 44;

export async function startSidebar(data) {
  const { role } = await ready;
  if (role !== "sidebar") return;
  const root = document.querySelector("#sidebar");
  root.hidden = false;

  const state = {
    face: 0,
    faces: data?.faces || [],
    details: null,
    total: 0,
    unencoded: 0,
    selected: null,
    renderable: false,
    axes: {},
    query: "",
    matches: null,
  };
  const font = new PreviewFont();
  let token = 0;
  let reading = false;
  let failure = "";

  const glyphCase = new GlyphCase(root, {
    onSelect: (point) => {
      state.selected = point;
      announce();
      sendImage();
      // Looking at a glyph is the inspector's whole job, so picking one asks for it. The toolbar
      // control belongs to the view, and the view is the only mount that can keep its own state
      // agreeing with what is on screen.
      void postTo("view", { kind: "inspect" });
    },
    loadNames: (glyphs) => native.names(state.face, glyphs).catch(() => []),
    requestPage: () => void readNext(),
    requestUnencoded: (from) => void readUnencoded(from),
  });
  glyphCase.setDensity(DENSITY);

  onMessage((payload) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.kind === "ready") {
      announce();
      sendImage();
      return;
    }
    // The view owns which face is being shown; the library follows it.
    if (payload.kind === "face") {
      if (Number(payload.index) !== state.face) void open(Number(payload.index));
      return;
    }
    if (payload.kind === "find") {
      state.query = String(payload.value ?? "");
      void find(state.query);
      return;
    }
    if (payload.kind === "step") {
      void step(payload.direction);
      return;
    }
    if (payload.kind === "select") {
      void pick(Number(payload.point));
      return;
    }
    if (payload.kind === "axes") {
      state.axes = { ...state.axes, ...payload.values };
      glyphCase.setAxes(state.axes);
      announce();
    }
  });
  onLocale(() => {
    // Block names are the interface's own text, so the rows are built again in the new language.
    glyphCase.rebuild();
    announce();
  });
  onVisibility((visible) => glyphCase.setVisible(visible));

  void open(0);
  announce();

  /** Load a face and the first page of its character set. */
  async function open(index) {
    const current = ++token;
    state.face = index;
    state.selected = null;
    state.query = "";
    state.matches = null;
    failure = "";
    glyphCase.reset();
    const summary = state.faces[index] || {};
    let loaded = "";
    try {
      loaded = await loadFace(font, index, summary);
    } catch {
      loaded = "";
    }
    if (current !== token) return;
    state.renderable = Boolean(loaded);
    glyphCase.setFont(loaded);
    root.classList.toggle("unrenderable", !state.renderable);
    const details = await native.details(index).catch(() => null);
    if (current !== token) return;
    state.details = details;
    state.axes = {};
    for (const axis of details?.axes || []) state.axes[axis.tag] = axis.default;
    glyphCase.setAxes(state.axes);
    await readNext();
    announce();
    sendImage();
  }

  /** One page of the character list, in order: what has been read is always a prefix of it. */
  async function readNext() {
    if (reading) return false;
    if (state.total && glyphCase.points.length >= state.total) return false;
    reading = true;
    const current = token;
    let answer = null;
    try {
      answer = await native.page(state.face, glyphCase.points.length);
    } catch (error) {
      if (current === token) failure = String(error?.message || error);
    }
    if (!answer || current !== token) {
      reading = false;
      return false;
    }
    state.total = answer.total;
    state.unencoded = answer.unencoded;
    glyphCase.setTotal(answer.total);
    glyphCase.setUnencodedTotal(answer.unencoded);
    glyphCase.append(answer.points);
    if (!answer.points.length && !answer.total) failure = "font-broken:no-glyphs";
    announce();
    // The page is applied while this read is still marked in flight, so the request that the
    // layout made on the way is dropped on purpose — and asked for again here, once.
    reading = false;
    glyphCase.request();
    return answer.points.length > 0;
  }

  /** Glyph ids no character reaches are listed after the blocks, and read the same way. */
  async function readUnencoded(from) {
    if (glyphCase.unencoded.length > from) return;
    try {
      const answer = await native.unencoded(state.face, from);
      if (!answer.glyphs.length) return;
      glyphCase.setUnencoded([...glyphCase.unencoded, ...answer.glyphs]);
    } catch {
      // A font that will not list its unencoded glyphs still lists everything a keyboard reaches.
    }
  }

  /** Read pages until the list holds the character at `index`. */
  async function ensure(index) {
    while (glyphCase.points.length <= index) {
      if (!(await readNext())) return false;
    }
    return true;
  }

  async function pickIndex(index, { scroll = true } = {}) {
    if (!(await ensure(index))) return;
    const point = glyphCase.points[index];
    if (point === undefined) return;
    glyphCase.select(point, { scroll });
  }

  async function pick(point) {
    const answer = await native.rank(state.face, point).catch(() => null);
    if (!answer?.covered) {
      announce();
      return;
    }
    await pickIndex(answer.index);
  }

  /**
   * What a query means. A code point is looked up; a name is looked up as the block it names; the
   * characters that were typed are looked up one by one. Nothing here walks the font.
   */
  async function find(query) {
    state.matches = null;
    const wanted = String(query ?? "").trim();
    if (!wanted) {
      announce();
      return;
    }
    const resolved = resolveQuery(wanted);
    if (resolved?.kind === "point") {
      const answer = await native.rank(state.face, resolved.point).catch(() => null);
      if (answer?.covered) state.matches = { indices: [answer.index], at: 0 };
    } else if (resolved?.kind === "characters") {
      const block = queryBlock(wanted);
      if (block) {
        const [from, to] = await Promise.all([
          native.rank(state.face, block.start).catch(() => null),
          native.rank(state.face, block.end + 1).catch(() => null),
        ]);
        if (from && to && to.index > from.index)
          state.matches = { from: from.index, to: to.index, at: from.index };
      }
      if (!state.matches) {
        const points = resolved.characters.map((glyph) => glyph.codePointAt(0));
        const covered = await native.covers(state.face, points).catch(() => []);
        const indices = [];
        for (let at = 0; at < points.length; at += 1) {
          if (!covered[at]) continue;
          const answer = await native.rank(state.face, points[at]).catch(() => null);
          if (answer?.covered) indices.push(answer.index);
        }
        if (indices.length) state.matches = { indices, at: 0 };
      }
    }
    announce();
    if (state.matches) await pickIndex(currentMatch(), { scroll: true });
  }

  function matchCount() {
    if (!state.matches) return 0;
    return state.matches.indices ? state.matches.indices.length : state.matches.to - state.matches.from;
  }

  function currentMatch() {
    const matches = state.matches;
    if (!matches) return 0;
    return matches.indices ? matches.indices[matches.at] : matches.at;
  }

  async function step(direction) {
    const matches = state.matches;
    const count = matchCount();
    if (!matches || !count) return;
    const delta = direction === "previous" ? -1 : 1;
    if (matches.indices) matches.at = (matches.at + delta + count) % count;
    else matches.at = matches.from + ((matches.at - matches.from + delta + count) % count);
    await pickIndex(currentMatch(), { scroll: true });
  }

  function announce() {
    void postTo("panel", {
      kind: "state",
      face: state.face,
      faces: state.faces.map((face) => ({
        family: face.family,
        subfamily: face.subfamily,
        glyphs: face.glyphs,
        render: face.render,
      })),
      details: state.details,
      total: state.total,
      unencoded: state.unencoded,
      selected: state.selected,
      renderable: state.renderable,
      axes: state.axes,
      query: state.query,
      matches: state.matches ? { count: matchCount(), index: matchIndex() } : null,
      error: failure ? errorText(failure) : "",
    });
    // The information line belongs to the view, and how many characters this font encodes — and
    // which one is current — are facts only the library has read.
    void postTo("view", { kind: "library", total: state.total, selected: state.selected });
  }

  function matchIndex() {
    const matches = state.matches;
    if (!matches) return 0;
    return matches.indices ? matches.at : matches.at - matches.from;
  }

  function sendImage() {
    if (state.selected === null || !state.renderable) return;
    font.axes = state.axes;
    const drawn = drawGlyph(state.selected, font, state.details);
    if (drawn) void postTo("panel", { kind: "image", point: state.selected, ...drawn });
  }
}
