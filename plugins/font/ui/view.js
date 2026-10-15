// The font preview's own half: a specimen sheet in the viewport, the whole character set in the
// docked sidebar, and a panel that inspects one glyph. The window's two bars belong to the host,
// so everything here is the content of one rectangle.
//
// Nothing is enumerated to open a font. The sheet is drawn from the facts and the font itself,
// and a typed line is checked character by character; the character set is read by the sidebar,
// a page at a time, only when someone opens it.
import {
  ready,
  controls,
  status,
  presented,
  onLocale,
  onSettings,
  configuration,
  setSetting,
  panel,
  sidebar,
  postTo,
  onMessage,
} from "./sdk.js";
import * as native from "./native.js";
import { PreviewFont, loadFace } from "./font.js";
import { Specimen, defaultSample, sampleCandidates } from "./specimen.js";
import { pointsOf, statusLine } from "./glyphs.js";
import { errorText, say } from "./strings.js";

const { data, role } = await ready;
let sizeTimer = 0;

// A view that cannot even build itself must say so: the host holds the window open waiting for a
// presentation, so a silent failure is a blank preview that only times out two minutes later.
try {
  if (role === "panel") {
    const { startPanel } = await import("./panel.js");
    startPanel(data);
  } else if (role === "sidebar") {
    const { startSidebar } = await import("./sidebar.js");
    startSidebar(data);
  } else {
    startView(data);
  }
} catch (error) {
  fail(String(error?.stack || error?.message || error));
}

function startView(data) {
  const view = document.querySelector("#view");
  view.hidden = false;
  const specimen = new Specimen(view, {
    onInput: (text) => check(text),
    onFace: (index) => void showFace(index),
  });
  const font = new PreviewFont();
  const state = {
    faces: data?.faces || [],
    face: 0,
    details: null,
    selected: null,
    size: clampSize(Number(configuration().typeSize)),
    guides: configuration().guides !== false,
    library: configuration().library === true,
    sample: String(configuration().sample || ""),
    /** What the font covers of the characters a sample would use, once it has been asked. */
    covered: new Set(),
    axes: {},
    renderable: false,
    covers: new Map(),
    checkTimer: 0,
    panelOpen: false,
    presented: false,
  };

  if (data?.error) {
    renderError(errorText(data.error));
    presented();
    return;
  }
  if (!state.faces.length) {
    renderError(say("noGlyphs"));
    presented();
    return;
  }
  specimen.setGuides(state.guides);
  publishControls();
  onLocale(() => {
    specimen.typing.dataset.placeholder = say("specimenPlaceholder");
    specimen.renderLadder();
    publishControls();
  });
  onSettings((next) => {
    const size = Number(next.typeSize);
    if (Number.isFinite(size) && clampSize(size) !== state.size) setSize(size, { persist: false });
    if (next.guides !== undefined && next.guides !== state.guides) setGuides(next.guides);
    if (next.library !== undefined && next.library !== state.library) setLibrary(next.library);
    if (typeof next.sample === "string" && next.sample !== state.sample) {
      const previous = state.sample;
      state.sample = next.sample;
      // An emptied setting means "choose a sample yourself" — but the sheet only gives up text
      // that came from the setting: anything the reader typed stays where it is.
      if (state.sample) specimen.setText(state.sample);
      else if (!specimen.text() || specimen.text() === previous)
        specimen.setText(defaultSample(state.covered || new Set()));
    }
  });
  onMessage((payload) => {
    if (!payload) return;
    if (payload.kind === "closed") {
      state.panelOpen = false;
      publishControls();
      return;
    }
    // The library picked a glyph: the inspector is where a glyph is read, so it opens by itself.
    if (payload.kind === "inspect") {
      if (!state.panelOpen) togglePanel();
      return;
    }
    // An axis belongs to the font, so the panel sends it to every mount that draws one.
    if (payload.kind === "axes") {
      state.axes = { ...state.axes, ...payload.values };
      specimen.setAxes(state.axes);
      return;
    }
    // What the library has read about this face, so the information line can state it.
    if (payload.kind === "library") {
      state.total = payload.total;
      state.selected = payload.selected;
      report();
    }
  });

  void boot();

  async function boot() {
    try {
      await showFace(0);
      if (state.library) void sidebar(true, SIDEBAR);
    } catch (error) {
      renderError(errorText(String(error?.message || error)));
      presented();
    }
  }

  /** One face: how it reaches the engine, what it is, and a sample chosen from what it covers. */
  async function showFace(index) {
    state.face = index;
    const summary = state.faces[index] || {};
    let family = "";
    try {
      family = await loadFace(font, index, summary);
      state.renderable = true;
    } catch {
      // The engine refused the font, even after the native half rewrote it. The sheet says so
      // instead of drawing a substitute face.
      state.renderable = false;
    }
    const details = await native.details(index).catch(() => null);
    state.details = details;
    state.axes = {};
    for (const axis of details?.axes || []) state.axes[axis.tag] = axis.default;
    state.covers.clear();
    specimen.setFamily(family);
    specimen.setAxes(state.axes);
    specimen.setNotice(state.renderable ? "" : say("noRender"));
    // Asked for every face, not just for the first sample: clearing the setting later has to be
    // able to fall back to a sample this font can actually draw.
    state.covered = await sample(state.face);
    if (!state.sample && !specimen.text()) specimen.setText(defaultSample(state.covered));
    specimen.update({
      face: state.face,
      faces: state.faces,
      details,
      family,
      size: state.size,
      sample: state.sample,
      axes: state.axes,
    });
    specimen.renderLadder();
    void tellSidebar();
    report();
    if (!state.presented) {
      state.presented = true;
      presented();
    }
  }

  /** What the font covers, among a handful of characters: one small question, not a list. */
  async function sample(face) {
    const candidates = sampleCandidates();
    const covered = await native.covers(face, candidates).catch(() => []);
    return new Set(candidates.filter((_, at) => covered[at]));
  }

  /** Whether the typed characters are in the font, asked for the whole line in one question. */
  function check(text) {
    clearTimeout(state.checkTimer);
    state.checkTimer = setTimeout(async () => {
      const points = [...new Set(pointsOf(text))];
      if (!points.length) {
        specimen.setMissing(new Set());
        report();
        return;
      }
      const answers = await native.covers(state.face, points).catch(() => []);
      const missing = new Set();
      for (let at = 0; at < points.length; at += 1) if (!answers[at]) missing.add(points[at]);
      specimen.setMissing(missing);
      report();
    }, 120);
  }

  function setSize(value, { persist = true } = {}) {
    state.size = clampSize(value);
    specimen.setSize(state.size);
    if (persist) {
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(() => setSetting("typeSize", state.size), 400);
    }
    publishControls();
  }

  function setGuides(on) {
    state.guides = on;
    specimen.setGuides(on);
    publishControls();
  }

  function setLibrary(on) {
    state.library = on;
    void sidebar(on, SIDEBAR);
    publishControls();
  }

  function publishControls() {
    controls([
      {
        id: "library",
        kind: "toggle",
        label: say("library"),
        icon: "file-text",
        active: state.library,
        run: () => setLibrary(!state.library),
      },
      {
        id: "guides",
        kind: "toggle",
        label: say("guides"),
        icon: "hash",
        active: state.guides,
        run: () => setGuides(!state.guides),
      },
      {
        id: "size",
        kind: "scrub",
        label: say("size"),
        icon: "actual",
        value: state.size,
        min: 12,
        max: 200,
        step: 1,
        suffix: "px",
        run: (value) => setSize(Number(value)),
      },
      {
        id: "inspector",
        kind: "toggle",
        label: say("inspector"),
        icon: "search",
        active: state.panelOpen,
        run: () => togglePanel(),
      },
    ]);
  }

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    // The inspector reads what the library has selected, so it opens the library too: an
    // inspector with nothing to inspect is not a state worth showing.
    if (state.panelOpen && !state.library) setLibrary(true);
    void panel(state.panelOpen);
    publishControls();
  }

  /** The sidebar is the same entry mounted with another role; the face it shows is this one. */
  function tellSidebar() {
    return postTo("sidebar", { kind: "face", index: state.face }).catch(() => false);
  }

  function report() {
    if (!state.details) {
      status("");
      return;
    }
    // Before the library has read anything, the honest number is the font's glyph count; once it
    // has, it is the character count, and the line says which one it is showing.
    const characters = Number.isFinite(state.total) && state.total > 0;
    status(
      statusLine({
        total: characters ? state.total : state.details.glyphs,
        unit: characters ? say("covered") : say("glyphs"),
        selected: state.selected,
      }),
    );
  }

  function renderError(message) {
    view.replaceChildren();
    const card = document.createElement("div");
    card.className = "notice";
    const text = document.createElement("p");
    text.textContent = message;
    card.append(text);
    view.append(card);
  }
}

/** The docked library: as wide as a case of glyphs wants, and no wider than the screen allows. */
const SIDEBAR = { side: "right", width: 340, minWidth: 220, maxWidth: 620 };

/** Nothing here could be built. The host shows this line instead of an empty window. */
function fail(message) {
  const view = document.querySelector("#view") || document.body;
  view.hidden = false;
  const card = document.createElement("div");
  card.className = "notice";
  const text = document.createElement("p");
  text.textContent = errorText(message);
  card.append(text);
  view.replaceChildren(card);
  presented(message);
}

function clampSize(value) {
  if (!Number.isFinite(value)) return 64;
  return Math.min(200, Math.max(12, Math.round(value)));
}
