// Optional view SDK. This module is copied into each plugin package, not linked into the host.
let port;
let sequence = 0;
let settings = {};
let sessionId = "";
/** The window size the host recorded, handed over when the view connects. */
let recordedWindow = { width: 0, height: 0 };
let sourceFile = null;
const awaiting = new Map();
const actions = new Map();
const visibilityListeners = new Set();
const settingsListeners = new Set();
const themeListeners = new Set();
const peerListeners = new Set();
const localeListeners = new Set();
// The interface language the host is showing. Plugins are independent packages, so the
// host hands each of them the same tag it uses itself rather than letting a plugin guess
// from the browser, which would disagree with the host's own setting.
let language = "en";
let resolveReady;
export const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

function rejectAwaiting(message) {
  for (const entry of awaiting.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(message));
  }
  awaiting.clear();
}

function disconnect(message, expected = port) {
  if (!expected || port !== expected) return;
  try {
    expected.close();
  } catch {}
  port = undefined;
  rejectAwaiting(message);
}

/** Search the host's pinned, offline Lucide catalog (up to 200 results). */
export function findIcons(query = "") { return request("icons", { query }); }
/** A trusted, themeable SVG element from the host registry. Unknown names fall back. */
export async function createIcon(name, size = 20) {
  const svg = await request("icons", { name });
  const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  element.setAttribute("width", String(size)); element.setAttribute("height", String(size));
  element.setAttribute("aria-hidden", "true"); return document.importNode(element, true);
}

/** Current values of every setting the plugin declared in plugin.json. */
export function configuration() {
  return settings;
}

/** Called with the new values whenever the user changes a setting. */
export function onSettings(fn) {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
}

/**
 * Persist one declared setting on behalf of the user — for a control that flips a
 * setting, such as a "wrap" toggle. The host validates it against the declaration and
 * then reports the result back through onSettings like any other change.
 */
export function setSetting(key, value) {
  return request("setting", { key, value });
}

/**
 * Talk to this plugin's other surface. A plugin mounted as a view and a panel runs in two
 * documents that cannot reach each other, so the host carries opaque payloads between them
 * and never looks inside. `postTo` resolves to whether the other mount was up.
 *
 *   await postTo('panel', {kind: 'status', count: 17})
 *   onMessage((payload, from) => { ... })
 */
export function postTo(role, payload) {
  return request("peer", { to: role, payload });
}

export function onMessage(fn) {
  peerListeners.add(fn);
  return () => peerListeners.delete(fn);
}

function applySettings(next) {
  if (!next || typeof next !== "object") return;
  settings = next;
  settingsListeners.forEach((fn) => {
    try {
      fn(settings);
    } catch (error) {
      status(String(error));
    }
  });
}

/** The interface language the host is showing, as a BCP-47 tag ("zh-CN", "en"). */
export function locale() {
  return language;
}

/** Called with the new tag whenever the user changes the interface language. A plugin that
 *  shows its own text in toolbar controls should re-publish them from here. */
export function onLocale(fn) {
  localeListeners.add(fn);
  return () => localeListeners.delete(fn);
}

function applyLocale(next) {
  if (typeof next !== "string" || !next) return;
  // The document says what it is written in as soon as the host says so, even when that
  // matches the value this module starts from: the page's own markup cannot know it, and
  // the first `init` is the only chance to correct it.
  document.documentElement.lang = next;
  if (next === language) return;
  language = next;
  localeListeners.forEach((fn) => {
    try {
      fn(language);
    } catch (error) {
      status(String(error));
    }
  });
}

/**
 * A translator for the plugin's own text, in the language the host is showing.
 *
 *   const t = translate({
 *     "zh-CN": { copy: "复制文本", lines: "共 {count} 行" },
 *     en:      { copy: "Copy text", lines: "{count} lines" },
 *   });
 *   t("copy");                 // the wording of the current language
 *   t("lines", { count: 12 }); // {name} placeholders are filled in
 *
 * A language the plugin does not provide falls back to the bare language ("zh-CN" to
 * "zh"), then to English, then to the key itself: a half-translated plugin still reads.
 */
export function translate(messages) {
  return (key, values) => {
    const chosen =
      messages[language] ||
      messages[language.split("-")[0]] ||
      messages.en ||
      {};
    const message = chosen[key] ?? messages.en?.[key] ?? key;
    if (!values) return message;
    return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
      name in values ? String(values[name]) : placeholder,
    );
  };
}

export function onTheme(fn) {
  themeListeners.add(fn);
  return () => themeListeners.delete(fn);
}

function theme(tokens) {
  for (const [key, value] of Object.entries(tokens))
    document.documentElement.style.setProperty(`--${key}`, value);
  // What the platform draws for the plugin — its scrollbars, the list a plain <select>
  // opens, autofill — is told which theme it is in, so nothing native stays light inside a
  // dark panel. The host sends this token beside the colours.
  if (tokens["color-scheme"])
    document.documentElement.style.colorScheme = tokens["color-scheme"];
  themeListeners.forEach((fn) => fn(tokens));
}
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.data?.type !== "ember:connect" ||
    !event.ports[0]
  )
    return;
  const nextPort = event.ports[0];
  if (port && port !== nextPort)
    disconnect("Host connection was replaced", port);
  port = nextPort;
  nextPort.onmessage = (event) => {
    const message = event.data;
    if (message.type === "disconnect") {
      disconnect(message.error || "Host connection closed", nextPort);
    } else if (message.type === "init") {
      sessionId = message.session || "";
      sourceFile = message.file || null;
      recordedWindow = message.window || recordedWindow;
      // Before anything else: the plugin's first render is already in the right language.
      applyLocale(message.locale);
      theme(message.theme);
      applySettings(message.settings);
      resolveReady(message);
    } else if (message.type === "theme") theme(message.theme);
    else if (message.type === "locale") applyLocale(message.locale);
    else if (message.type === "settings") applySettings(message.settings);
    else if (message.type === "peer")
      peerListeners.forEach((fn) => {
        try {
          fn(message.payload, message.from);
        } catch (error) {
          status(String(error));
        }
      });
    else if (message.type === "visible")
      visibilityListeners.forEach((fn) => fn(message.visible));
    else if (message.type === "action") {
      Promise.resolve()
        .then(() => actions.get(message.id)?.(message.value))
        .catch((error) => status(String(error)));
    } else if (message.type === "reply") {
      const entry = awaiting.get(message.id);
      if (!entry) return;
      awaiting.delete(message.id);
      clearTimeout(entry.timer);
      message.error
        ? entry.reject(new Error(message.error))
        : entry.resolve(message.value);
    }
  };
  nextPort.onmessageerror = () =>
    disconnect("Host connection failed", nextPort);
  nextPort.start();
  nextPort.postMessage({ type: "connected" });
});

function request(method, params) {
  if (!port) return Promise.reject(new Error("Host is not connected"));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      awaiting.delete(id);
      reject(new Error("Host request timed out"));
    }, 125000);
    const requestPort = port;
    awaiting.set(id, { resolve, reject, timer });
    try {
      requestPort.postMessage({ type: "request", id, method, params });
    } catch (error) {
      awaiting.delete(id);
      clearTimeout(timer);
      disconnect("Host connection failed", requestPort);
      reject(error);
    }
  });
}

/**
 * Publish command controls for the host toolbar. Plugins render content in their document;
 * the host renders these controls with its own size, spacing, focus and selected states.
 * Every item declares a canonical Lucide `icon`. Toggle items also declare boolean `active`
 * and republish the list after their state changes.
 */
export function controls(items) {
  actions.clear();
  for (const item of items) actions.set(item.id, item.run);
  port.postMessage({
    type: "controls",
    items: items.map(({ run, ...item }) => item),
  });
}
/** Publish one concise line of parsed facts or viewer state in the host's file-information
 * area. The host already owns the file name and size; keep status/metadata chrome out of the
 * preview DOM and update this line when page, zoom, selection or other useful state changes. */
export function status(text) {
  port?.postMessage({ type: "status", text });
}
/**
 * What went wrong in this document, for the host to show and for a generated plugin's
 * own trial run to report. Uncaught errors, rejections and console failures are kept
 * (never replaced) and sent to the host: a plugin that throws before it presents itself
 * would otherwise fail silently, which is exactly the case a preview has to explain.
 */
const diagnostics = [];
let diagnosticsDirty = false;
function record(level, message) {
  const text = String(message ?? "").slice(0, 500);
  if (!text) return;
  if (diagnostics.length >= 20) diagnostics.shift();
  diagnostics.push({ level, text });
  diagnosticsDirty = true;
  port?.postMessage({ type: "diagnostics", items: diagnostics.slice() });
}
function flushDiagnostics() {
  if (!port || !diagnosticsDirty) return;
  diagnosticsDirty = false;
  port.postMessage({ type: "diagnostics", items: diagnostics.slice() });
}
addEventListener("error", (event) => {
  const where = event.filename ? ` (${event.filename}:${event.lineno})` : "";
  record("error", `${event.message || "Uncaught error"}${where}`);
});
addEventListener("unhandledrejection", (event) => record("error", `Unhandled rejection: ${event.reason?.message || event.reason}`));
for (const level of ["error", "warn"]) {
  const original = console[level].bind(console);
  console[level] = (...values) => {
    record(level, values.map((value) => (value instanceof Error ? value.message : String(value))).join(" "));
    original(...values);
  };
}
/** Everything this document has reported, oldest first. */
export function diagnosticsOf() {
  return diagnostics.slice();
}
export function presented(error = null) {
  flushDiagnostics();
  return request("presented", { error });
}

/**
 * Show or hide this plugin's own floating panel. The host only places and drags the panel;
 * what it contains is the plugin's business. A plugin that owns both a view and a panel
 * usually opens it from a toolbar control, e.g. a search button.
 */
export function panel(open = true) {
  return request("panel", { open });
}
/**
 * State what this view needs during its preparation — the phase between the host building the
 * preview window and showing it. A hidden window is shaped before it appears. If the user
 * switches views while the preview is visible, the new view's first statement reshapes the
 * existing window immediately and keeps its position.
 *
 * `facts.window` is the size the window should have, in CSS pixels. The plugin states it
 * because the plugin is the one that knows what it is showing; `hostWindow()` is the size the
 * user's own window had, which is what it should start from. `hostWindow().currentWidth` and
 * `.currentHeight` describe the window at connection time, so a view can measure host chrome
 * around its own viewport even after a previous plugin temporarily shaped the window. The host only constrains it (the
 * screen, and the smallest window it builds), never chooses it, never moves the window and never
 * writes it down as the user's own size.
 *
 * Call it once per session, as soon as the content's facts are known; a plugin that has nothing
 * to state reports `presented()` instead and the window opens without waiting. Only the primary
 * view may call it, because the window belongs to the view.
 */
export function prepare(facts = {}) {
  return request("prepare", facts);
}

/**
 * The user's recorded preview size (`width`, `height`) in CSS pixels. This remains the baseline
 * after another plugin temporarily changes the actual window. `currentWidth` and
 * `currentHeight` are the actual window dimensions when this view connects; subtract this
 * view's dimensions from them to find the host chrome around it.
 */
export function hostWindow() {
  return recordedWindow;
}
export function call(method, value = null) {
  return request("call", { method, value });
}
export function clipboard(text) {
  return request("clipboard", { text });
}
/**
 * Hand a link the user clicked to the system: the host opens it with whatever Windows uses for
 * that address, never inside the preview. This is the only way out of the page — a sandboxed view
 * cannot navigate or open anything itself — so send the reference the way the document wrote it
 * and let the host decide what may be opened; a plugin never has to guess at the rules. Requires
 * the `openLink` permission, and only the visible mount may call it.
 */
export function openExternal(url) {
  return request("openExternal", { url });
}
/** Open host-owned modal chrome with plugin-owned wording and opaque action ids.
 * Resolves to the chosen action id, or null when the user cancels. */
export function confirmDialog(options) {
  return request("confirm", options);
}
export function onVisibility(fn) {
  visibilityListeners.add(fn);
  return () => visibilityListeners.delete(fn);
}
export async function read(offset, length) {
  const encoded = await request("read", { offset, length });
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}
/** The whole sample as a `Blob`, read in 1 MiB steps. Use this only when a parser needs one
 * contiguous value; range-aware browser consumers should prefer `streamUrl()` so large files
 * can begin rendering without a complete copy in WebView memory. */
export async function fileBlob(size = sourceFile?.size, type = "") {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new TypeError(
      "fileBlob size is unavailable; await ready and pass file.size",
    );
  const chunks = [];
  for (let offset = 0; offset < size; offset += 1024 * 1024) {
    const chunk = await read(offset, Math.min(1024 * 1024, size - offset));
    if (!chunk.length) throw new Error("File changed while reading");
    chunks.push(chunk);
  }
  return new Blob(chunks, { type });
}

/** A permission-checked URL for the session's source file, for the browser to load directly:
 * an image source, a fetch, or a library that takes a URL. The host answers with the whole
 * file and refuses anything over 32 MiB. Use `streamUrl()` for a range-aware large-file
 * consumer. */
export function fileUrl() {
  if (!sessionId) throw new Error("Plugin session is not ready");
  return new URL(`/${encodeURIComponent(sessionId)}/@file`, location.origin).href;
}

/** A permission-checked, byte-range URL for the current file. Use it for a browser-native
 * consumer that can request only the bytes it needs instead of first copying the complete file
 * into a Blob. The host transports ranges and deliberately knows nothing about the format. */
export function streamUrl() {
  if (!sessionId) throw new Error("Plugin session is not ready");
  return new URL(`/${encodeURIComponent(sessionId)}/@stream`, location.origin).href;
}

/** Resolve a document-owned resource through the current session. Relative paths are based
 * on the selected file (not the plugin package); HTTP(S) URLs are fetched by the host with
 * redirect, size and private-network checks. The plugin still owns parsing and decides which
 * references its format contains. Requires the `readResources` permission. */
export function resourceUrl(reference) {
  if (!sessionId) throw new Error("Plugin session is not ready");
  const value = String(reference ?? "").trim();
  if (!value || value.length > 4096 || /[\u0000-\u001f]/.test(value))
    throw new TypeError("Invalid resource reference");
  if (/^(data|blob):/i.test(value)) return value;
  const windowsPath = /^[a-z]:[\\/]/i.test(value);
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !windowsPath && !["http", "https", "file"].includes(scheme))
    throw new TypeError("Resource reference must be a file path or HTTP(S) URL");
  return new URL(
    `/${encodeURIComponent(sessionId)}/@resource/${encodeURIComponent(value)}`,
    location.origin,
  ).href;
}

/** Fetch a related resource as a Blob. Use its object URL for media or a parser that needs
 * bytes; an `<img>` can use `resourceUrl(reference)` directly. */
export async function resourceBlob(reference) {
  const response = await fetch(resourceUrl(reference));
  if (!response.ok)
    throw new Error((await response.text().catch(() => "")) || `Resource returned ${response.status}`);
  return response.blob();
}

addEventListener("keydown", (event) => {
  const key =
    event.key === "Escape"
      ? "escape"
      : (event.ctrlKey || event.metaKey) && event.key === "o"
        ? "open"
        : event.code === "Space" &&
            !event.repeat &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !(
              event.target instanceof Element &&
              event.target.closest(
                "input,textarea,select,button,[contenteditable],[role=textbox]",
              )
            )
          ? "toggle"
          : "";
  if (key) {
    event.preventDefault();
    port?.postMessage({ type: "shortcut", key });
  }
});

// Generic contribution lifecycle and opaque data-source channel.
//
// `pending(true)` declares that this session holds work the plugin has not committed — a
// draft, a crop, a rotation, whatever the plugin's own idea of a change is. `reason` is the
// wording the host shows when it has to explain a refusal. While it is set the host refuses
// to uninstall, disable or replace the plugin, and keeps the preview mounted until the plugin
// clears it.
export function pending(value, reason) {
  return request("pending", {
    pending: value,
    ...(typeof reason === "string" ? { reason } : {}),
  });
}
export function fileChanged({ returnToSource = false } = {}) {
  return request("fileChanged", { returnToSource });
}
export function mutate(method, value) {
  return request("mutate", { method, value });
}
export function sourceCall(method, value = null) {
  return request("sourceCall", { method, value });
}

export function returnView() {
  return request("returnView", {});
}

/** Opaque navigation data, scoped to this file and its shared data contract. */
export function viewState(value = null) {
  return request("viewState", { value });
}
