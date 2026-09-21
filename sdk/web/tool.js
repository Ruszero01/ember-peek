// Tool API v1. The host owns the MessagePort and binds it to the installed package.
let port, next = 0;
const pending = new Map();
const listeners = new Set();
const dropListeners = new Set();
const dragListeners = new Set();
let current = {locale:"en",theme:{}};
export function context() { return current; }
export function onContext(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onDrop(fn) { dropListeners.add(fn); return () => dropListeners.delete(fn); }
/** Drag state of a file being carried over the page: "enter" or "leave". Files never
 * reach the page itself, so this is only for showing where a drop would land. */
export function onDrag(fn) { dragListeners.add(fn); return () => dragListeners.delete(fn); }
function applyContext(value) {
  current = {locale:value.locale || "en",theme:value.theme || {},page:value.page === "settings" ? "settings" : "workshop"};
  for (const [key,value] of Object.entries(current.theme)) document.documentElement.style.setProperty(`--${key}`, String(value));
  document.documentElement.lang = current.locale;
  for (const fn of listeners) fn(current);
}
let resolve;
export const ready = new Promise(r => { resolve = r; });
window.addEventListener("message", event => {
  if (event.source !== parent || event.data?.type !== "ember-tool-connect" || !event.ports[0]) return;
  // The host may hand the port over more than once: it reconnects when it remounts a tool
  // page whose document is not reloaded. Keeping only the first would leave the page waiting
  // on a port the host has already closed, which shows up as a page that never appears.
  if (port) {
    try { port.close(); } catch {}
  }
  port = event.ports[0];
  port.onmessage = ({data}) => {
    if (data.event === "context") { applyContext(data); return; }
    if (data.event === "drop") { for (const fn of dropListeners) fn(data.paths || []); return; }
    if (data.event === "drag") { for (const fn of dragListeners) fn(data.state === "enter" ? "enter" : "leave"); return; }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.value);
  };
  applyContext(event.data);
  port.start(); resolve(current);
});
// Signal after the listener exists; module loading must never depend on iframe load. It is
// repeated until a port arrives, because the host may have asked before this module ran — its
// message would be gone, and a page that announces once would wait for a port forever. The
// host answers every announcement with a fresh port, so this stops on the first one.
const announce = () => {
  if (!port) parent.postMessage({ type: "ember-tool-ready" }, "*");
};
announce();
const bell = setInterval(() => {
  if (port) {
    clearInterval(bell);
    return;
  }
  announce();
}, 400);
setTimeout(() => clearInterval(bell), 12000);
export async function call(method, params = {}) {
  await ready;
  return new Promise((resolve,reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Tool request timed out")); }, 180000);
    pending.set(id, {resolve,reject,timer}); port.postMessage({id,method,params});
  });
}
