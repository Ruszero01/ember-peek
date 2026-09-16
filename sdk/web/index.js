// Optional view SDK. This module is copied into each plugin package, not linked into the host.
let port;
let sequence = 0;
let settings = {};
let sessionId = "";
const pending = new Map();
const actions = new Map();
const visibilityListeners = new Set();
const settingsListeners = new Set();
const themeListeners = new Set();
const peerListeners = new Set();
let resolveReady;
export const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

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

export function onTheme(fn) {
  themeListeners.add(fn);
  return () => themeListeners.delete(fn);
}

function theme(tokens) {
  for (const [key, value] of Object.entries(tokens))
    document.documentElement.style.setProperty(`--${key}`, value);
  themeListeners.forEach((fn) => fn(tokens));
}
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.data?.type !== "ember:connect" ||
    !event.ports[0]
  )
    return;
  port?.close();
  port = event.ports[0];
  port.onmessage = (event) => {
    const message = event.data;
    if (message.type === "init") {
      sessionId = message.session || "";
      theme(message.theme);
      applySettings(message.settings);
      resolveReady(message);
    } else if (message.type === "theme") theme(message.theme);
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
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      message.error
        ? entry.reject(new Error(message.error))
        : entry.resolve(message.value);
    }
  };
  port.start();
  port.postMessage({ type: "connected" });
});

function request(method, params) {
  if (!port) return Promise.reject(new Error("Host is not connected"));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Host request timed out"));
    }, 125000);
    pending.set(id, { resolve, reject, timer });
    port.postMessage({ type: "request", id, method, params });
  });
}

export function controls(items) {
  actions.clear();
  for (const item of items) actions.set(item.id, item.run);
  port.postMessage({
    type: "controls",
    items: items.map(({ run, ...item }) => item),
  });
}
export function status(text) {
  port?.postMessage({ type: "status", text });
}
export function presented(error = null) {
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
export function call(method, value = null) {
  return request("call", { method, value });
}
export function clipboard(text) {
  return request("clipboard", { text });
}
export function onVisibility(fn) {
  visibilityListeners.add(fn);
  return () => visibilityListeners.delete(fn);
}
export async function read(offset, length) {
  const encoded = await request("read", { offset, length });
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}
export async function fileBlob(size, type) {
  const chunks = [];
  for (let offset = 0; offset < size; offset += 1024 * 1024) {
    const chunk = await read(offset, Math.min(1024 * 1024, size - offset));
    if (!chunk.length) throw new Error("File changed while reading");
    chunks.push(chunk);
  }
  return new Blob(chunks, { type });
}

/** A permission-checked URL for the session's source file. Browsers can decode media
 * directly from it without repeated Base64 IPC calls. */
export function fileUrl() {
  if (!sessionId) throw new Error("Plugin session is not ready");
  return new URL(`/${encodeURIComponent(sessionId)}/@file`, location.origin).href;
}

let lastEdge = "";
let edgeTimer;
let pendingEdge = "";
addEventListener(
  "pointermove",
  (event) => {
    const value = event.buttons
      ? ""
      : event.clientY < 6
        ? "top"
        : event.clientY > innerHeight - 6
          ? "bottom"
          : "";
    if (value === pendingEdge) return;
    pendingEdge = value;
    clearTimeout(edgeTimer);
    if (!value) {
      if (lastEdge) port?.postMessage({ type: "edge", value: "" });
      lastEdge = "";
    } else {
      edgeTimer = setTimeout(() => {
        lastEdge = value;
        port?.postMessage({ type: "edge", value });
      }, 160);
    }
  },
  { passive: true },
);
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
