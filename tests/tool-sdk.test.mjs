import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = readFileSync(fileURLToPath(new URL("../sdk/web/tool.js", import.meta.url)), "utf8");
function fixture() {
  let listener;
  const announcements = [];
  const parent = { postMessage: (message) => announcements.push(message) };
  const module = { exports: {} };
  const document = { documentElement: { style: { setProperty() {} }, lang: "" } };
  runInNewContext(transformSync(source, { format: "cjs" }).code, {
    module, exports: module.exports, window: { addEventListener: (_, fn) => { listener = fn; } },
    parent, document,
    // A page has these; the retry loop that keeps announcing until a port arrives needs them,
    // and unref'd handles keep the test process from waiting on the 12-second cap.
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; },
    clearTimeout,
    setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref?.(); return timer; },
    clearInterval,
  });
  const messages = [];
  const port = { start() {}, close() {}, postMessage: message => messages.push(message), onmessage: null, onmessageerror: null };
  return { api: module.exports, parent, listener, messages, port, document, announcements };
}
test("tool SDK asks its host for a port until one arrives, and then stops asking", async () => {
  const f = fixture();
  // The host may have asked before this module ran, in which case that message is gone. The
  // page has to keep announcing, or it waits for a port that nobody will send again.
  assert.equal(f.announcements.length, 1, "it announces as soon as it can listen");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(f.announcements.length > 1, "and keeps announcing while it has no port");
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", locale: "en" }, ports: [f.port] });
  await Promise.resolve();
  const settled = f.announcements.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(f.announcements.length, settled, "and stops once it is connected");
});
test("tool SDK accepts only a port from its host parent and correlates replies", async () => {
  const f = fixture();
  f.listener({ source: {}, data: { type: "ember-tool-connect" }, ports: [f.port] });
  assert.equal(f.port.onmessage, null);
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", locale: "en" }, ports: [f.port] });
  assert.equal((await f.api.ready).locale, "en");
  const request = f.api.call("state");
  await Promise.resolve();
  assert.equal(f.messages[0].method, "state");
  f.port.onmessage({ data: { id: f.messages[0].id, value: { projects: [] } } });
  assert.equal((await request).projects.length, 0);
});
test("tool SDK propagates service failures without treating them as successful output", async () => {
  const f = fixture();
  f.listener({ source: f.parent, data: { type: "ember-tool-connect" }, ports: [f.port] });
  const request = f.api.call("export", { id: "p1" });
  const rejected = assert.rejects(request, /must pass preview/);
  await Promise.resolve();
  f.port.onmessage({ data: { id: f.messages[0].id, error: "Build must pass preview" } });
  await rejected;
});
test("tool SDK rejects in-flight work when the host explicitly replaces its channel", async () => {
  const f = fixture();
  const documentId = f.announcements[0].documentId;
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", documentId }, ports: [f.port] });
  const request = f.api.call("state");
  await Promise.resolve();
  const replacement = { start() {}, close() {}, postMessage() {}, onmessage: null, onmessageerror: null };
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", documentId }, ports: [replacement] });
  await assert.rejects(request, /replaced/);
});
test("tool SDK ignores a connection intended for a different iframe document", async () => {
  const f = fixture();
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", documentId: "stale-document" }, ports: [f.port] });
  assert.equal(f.port.onmessage, null);
  assert.ok(f.announcements[0].documentId);
});
test("tool SDK requests a new channel generation after a disconnect", async () => {
  const f = fixture();
  const { documentId, attempt } = f.announcements[0];
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", documentId, attempt }, ports: [f.port] });
  f.port.onmessage({ data: { event: "disconnect", error: "closed for test" } });
  assert.equal(f.announcements.at(-1).documentId, documentId);
  assert.equal(f.announcements.at(-1).attempt, attempt + 1);
  const messages = [];
  const replacement = { start() {}, close() {}, postMessage: message => messages.push(message), onmessage: null, onmessageerror: null };
  f.listener({ source: f.parent, data: { type: "ember-tool-connect", documentId, attempt: attempt + 1 }, ports: [replacement] });
  const request = f.api.call("state");
  await Promise.resolve();
  replacement.onmessage({ data: { id: messages[0].id, value: { projects: [] } } });
  assert.equal((await request).projects.length, 0);
});
