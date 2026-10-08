// Tool API v1. The host owns the MessagePort and binds it to the installed package.
let port, next = 0;
const pending = new Map();
const listeners = new Set();
const dropListeners = new Set();
const dragListeners = new Set();
let current = {locale:"en",theme:{}};
const documentId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
let attempt = 0;
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
let bell;
function rejectPending(message) {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
  pending.clear();
}
function announce() {
  if (!port) parent.postMessage({ type: "ember-tool-ready", documentId, attempt }, "*");
}
function startAnnouncing() {
  if (bell) return;
  announce();
  bell = setInterval(announce, 400);
}
function disconnect(message, expected = port) {
  if (!expected || port !== expected) return;
  try { expected.close(); } catch {}
  port = undefined;
  attempt++;
  rejectPending(message);
  startAnnouncing();
}
window.addEventListener("message", event => {
  if (event.source !== parent || event.data?.type !== "ember-tool-connect" || !event.ports[0]) return;
  if (event.data.documentId && event.data.documentId !== documentId) return;
  const nextPort = event.ports[0];
  if (port && port !== nextPort) disconnect("Tool connection was replaced", port);
  port = nextPort;
  if (bell) { clearInterval(bell); bell = undefined; }
  nextPort.onmessage = ({data}) => {
    if (data.event === "disconnect") { disconnect(data.error || "Tool connection closed", nextPort); return; }
    if (data.event === "context") { applyContext(data); return; }
    if (data.event === "drop") { for (const fn of dropListeners) fn(data.paths || []); return; }
    if (data.event === "drag") { for (const fn of dragListeners) fn(data.state === "enter" ? "enter" : "leave"); return; }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.value);
  };
  nextPort.onmessageerror = () => disconnect("Tool connection failed", nextPort);
  applyContext(event.data);
  nextPort.start(); resolve(current);
});
// Signal after the listener exists; module loading must never depend on iframe load. It is
// repeated until a port arrives, because the host may have asked before this module ran — its
// message would be gone, and a page that announces once would wait for a port forever. The
// host answers the first announcement for this document/attempt; retries are idempotent.
startAnnouncing();
export async function call(method, params = {}, options = {}) {
  await ready;
  return new Promise((resolve,reject) => {
    const id = ++next;
    const requestPort = port;
    if (!requestPort) { reject(new Error("Tool is reconnecting")); return; }
    const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 180000;
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      reject(new Error("Tool request timed out"));
      disconnect("Tool connection became unresponsive", requestPort);
    }, timeout);
    pending.set(id, {resolve,reject,timer});
    try { requestPort.postMessage({id,method,params}); }
    catch (error) { pending.delete(id); clearTimeout(timer); disconnect("Tool connection failed", requestPort); reject(error); }
  });
}
