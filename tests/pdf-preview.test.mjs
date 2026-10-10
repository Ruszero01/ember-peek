import test from "node:test";
import assert from "node:assert/strict";
import { pageNumber, renderGeometry, defaultFitMode } from "../plugins/pdf/ui/geometry.js";
import { readPdfRange, createPdfRangeReader } from "../plugins/pdf/ui/range.js";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readingMode, pageAt, visiblePages } from "../plugins/pdf/ui/pages.js";
import { pdfShortcuts, animateScroll } from "../plugins/pdf/ui/navigation.js";
import { validateShortcuts, matchShortcut } from "../sdk/web/shortcuts.js";

test("PDF declares page navigation and vertical scrolling as separate host shortcuts", () => {
  const calls = [];
  const actions = Object.fromEntries(["previous", "next", "scrollUp", "scrollDown", "first", "last"].map(name => [name, () => calls.push(name)]));
  const declarations = pdfShortcuts(actions);
  const bindings = validateShortcuts(declarations);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    const binding = matchShortcut(bindings, { key, repeat: true });
    declarations.find(item => item.id === binding.id).run();
    assert.equal(matchShortcut(bindings, { key }, true), undefined);
  }
  assert.deepEqual(calls, ["previous", "next", "scrollUp", "scrollDown"]);
});

test("continuous page jumps animate to the target and can be interrupted", () => {
  const viewport = { scrollTop: 100 };
  let callback, finished = 0, cancelled = 0;
  const options = { now: () => 0, requestFrame: fn => { callback = fn; return 7; }, cancelFrame: id => { assert.equal(id, 7); cancelled++; } };
  const cancel = animateScroll(viewport, 900, () => finished++, options);
  callback(110);
  assert.ok(viewport.scrollTop > 100 && viewport.scrollTop < 900);
  callback(220);
  assert.equal(viewport.scrollTop, 900);
  assert.equal(finished, 1);
  const cancelNext = animateScroll(viewport, 0, () => finished++, options);
  cancelNext();
  callback(220);
  assert.equal(viewport.scrollTop, 900);
  assert.equal(finished, 1);
  assert.equal(cancelled, 1);
});

test("PDF reading mode defaults to single page and supports continuous reading", () => {
  assert.equal(readingMode({}), "single");
  assert.equal(readingMode({ viewMode: "single" }), "single");
  assert.equal(readingMode({ viewMode: "continuous" }), "continuous");
});

test("continuous PDF reading locates pages and retains only the visible neighborhood", () => {
  const offsets = [16, 832, 1248, 2064];
  assert.equal(pageAt(4, i => offsets[i], 0), 0);
  assert.equal(pageAt(4, i => offsets[i], 1400), 2);
  assert.equal(pageAt(4, i => offsets[i], 9999), 3);
  assert.deepEqual(visiblePages(4, i => offsets[i], 16, 500), [0, 1]);
  assert.deepEqual(visiblePages(10000, i => i * 816, 81600, 600), [99, 100, 101]);
});

test("PDF worker boots as a classic script inside an isolated worker scope", async () => {
  const messages = [];
  const scope = { onmessage: null, postMessage: message => messages.push(message), addEventListener() {}, removeEventListener() {} };
  const source = await readFile(new URL("../plugins/pdf/ui/vendor/pdf.worker.bundle.mjs", import.meta.url), "utf8");
  vm.runInNewContext(source, { self: scope, console, TextDecoder, TextEncoder, URL, setTimeout, clearTimeout, structuredClone, AbortController });
  assert.ok(messages.some(message => message.action === "ready"));
});

test("PDF ranges larger than the SDK read budget return one complete response", async () => {
  const source = Uint8Array.from({ length: 2 * 1024 * 1024 + 71 }, (_, i) => i % 251);
  const calls = [];
  const result = await readPdfRange(async (offset, length) => {
    calls.push([offset, length]);
    return source.slice(offset, offset + length);
  }, 17, source.length);
  assert.deepEqual(result, source.slice(17));
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([, length]) => length <= 1024 * 1024));
});

test("PDF ranges handle partial reads and reject unexpected EOF", async () => {
  assert.deepEqual(await readPdfRange(async () => new Uint8Array([42]), 5, 8), new Uint8Array([42, 42, 42]));
  await assert.rejects(readPdfRange(async () => new Uint8Array(), 0, 10), /Unexpected end/);
});

test("PDF navigation clamps and rounds page requests", () => {
  assert.equal(pageNumber(-10, 20), 1);
  assert.equal(pageNumber(21, 20), 20);
  assert.equal(pageNumber(5.7, 20), 6);
  assert.equal(pageNumber(NaN, 20), 1);
});

test("PDF window filling covers the available edges and bounds canvas allocation", () => {
  assert.equal(defaultFitMode({}), "fill");
  assert.equal(defaultFitMode({ fitWindow: true }), "fill");
  assert.equal(defaultFitMode({ fitWindow: false }), "page");
  assert.equal(renderGeometry(600, 800, 900, 600, "page", 1).scale, 0.75);
  assert.equal(renderGeometry(800, 600, 600, 900, "page", 1).scale, 0.75);
  assert.equal(renderGeometry(600, 800, 900, 600, "fill", 1).scale, 1.5);
  assert.equal(renderGeometry(800, 600, 600, 900, "fill", 1).scale, 1.5);
  assert.equal(renderGeometry(600, 800, 900, 600, "manual", 2).scale, 2);
  const result = renderGeometry(14400, 14400, 900, 600, "manual", 8, 3);
  assert.ok(14400 * result.scale * result.outputScale <= 4096);
  assert.ok((14400 * result.scale * result.outputScale) ** 2 <= 16 * 1024 * 1024);
});

async function pdfTransportStream() {
  const source = await readFile(new URL("../plugins/pdf/ui/vendor/pdf.mjs", import.meta.url), "utf8");
  const base = source.slice(source.indexOf("class BasePDFStream {"), source.indexOf(";// ./src/display/transport_stream.js"));
  const transport = source.slice(source.indexOf("function getArrayBuffer(val)"), source.indexOf(";// ./src/display/fetch_stream.js"));
  return vm.runInNewContext(base + transport + "; PDFDataTransportStream", {
    Uint8Array, Promise, assert: (condition, message) => assert.ok(condition, message),
  });
}

test("PDF transport drops late responses after individual cancellation without disrupting active ranges", async () => {
  const Stream = await pdfTransportStream();
  let receive;
  const requested = [];
  const range = {
    initialData: new Uint8Array(), length: 100,
    addRangeListener: listener => { receive = listener; },
    addProgressListener() {}, addProgressiveReadListener() {}, addProgressiveDoneListener() {}, transportReady() {},
    requestDataRange: (begin, end) => requested.push([begin, end]), abort() {},
  };
  const stream = new Stream({ pdfDataRangeTransport: range, disableStream: true });
  const cancelled = stream.getRangeReader(0, 10);
  const pending = cancelled.read();
  const active = stream.getRangeReader(20, 30);
  cancelled.cancel(new Error("Reading cancelled"));
  assert.equal((await pending).done, true);
  assert.doesNotThrow(() => receive(0, new Uint8Array(10)));
  receive(20, new Uint8Array(10).fill(42));
  assert.deepEqual(new Uint8Array((await active.read()).value), new Uint8Array(10).fill(42));
  assert.equal((await active.read()).done, true);
  const remaining = stream.getRangeReader(40, 50);
  stream.cancelAllRequests(new Error("Document closed"));
  assert.doesNotThrow(() => receive(40, new Uint8Array(10)));
  assert.equal((await remaining.read()).done, true);
  assert.deepEqual(requested, [[0, 10], [20, 30], [40, 50]]);
});

test("PDF range bursts stay within four SDK reads and recover after a failed request", async () => {
  let active = 0, maximum = 0;
  const reader = createPdfRangeReader(async offset => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (offset === 0) throw new Error("Read failed");
    return new Uint8Array([offset]);
  });
  const results = await Promise.allSettled(Array.from({ length: 80 }, (_, index) => reader(index, index + 1)));
  assert.equal(maximum, 4);
  assert.equal(active, 0);
  assert.equal(results[0].status, "rejected");
  for (let index = 1; index < results.length; index++) {
    assert.equal(results[index].status, "fulfilled");
    assert.deepEqual(results[index].value, new Uint8Array([index]));
  }
});
