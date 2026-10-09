import test from "node:test";
import assert from "node:assert/strict";
import { createStateSynchronizer } from "../sdk/web/state.js";
import { pdfPosition, capturePosition, restorePosition } from "../plugins/pdf/ui/position.js";

test("visible peers restore state groups; hidden peers never overwrite", async () => {
  let stored = { page: 2, y: 0.6, expanded: true }, writes = 0;
  const peer = async visible => {
    let state = { page: 1, y: 0 }, visibility;
    const sync = await createStateSynchronizer({
      ready: Promise.resolve({ visible }),
      viewState: async value => {
        if (value !== undefined) { stored = structuredClone(value); writes++; }
        return structuredClone(stored);
      },
      onVisibility: callback => { visibility = callback; return () => {}; },
    }, () => state, async value => { state = value; });
    return { sync, show: value => visibility(value), get: () => state, set: value => { state = value; } };
  };
  const preview = await peer(true), editor = await peer(false);
  assert.deepEqual(preview.get(), stored);
  await editor.sync.changed();
  assert.equal(writes, 0);
  preview.set({ page: 4, y: 0.3 });
  preview.show(false);
  editor.show(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(editor.get(), { page: 4, y: 0.3 });
  preview.set({ page: 1 });
  await preview.sync.changed();
  assert.deepEqual(stored, { page: 4, y: 0.3 });
  editor.set({ page: 3, y: 0.7 });
  editor.show(false);
  preview.show(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(preview.get(), { page: 3, y: 0.7 });
});

test("asynchronous restoration cannot publish an intermediate first page", async () => {
  let visibility, complete, writes = 0, state = { page: 1 };
  const sync = await createStateSynchronizer({ ready: Promise.resolve({ visible: false }),
    viewState: async value => { if (value) writes++; return { page: 8 }; },
    onVisibility: fn => { visibility = fn; return () => {}; },
  }, () => state, async value => { await new Promise(resolve => { complete = resolve; }); state = value; });
  visibility(true);
  await new Promise(resolve => setImmediate(resolve));
  await sync.changed();
  assert.equal(writes, 0);
  complete();
  await new Promise(resolve => setImmediate(resolve));
  await sync.changed();
  assert.equal(writes, 0);
  assert.equal(state.page, 8);
});

test("PDF positions clamp stale pages and preserve relative offsets across zoom", () => {
  assert.equal(capturePosition({ clientWidth: 0, clientHeight: 0, scrollTop: 0, scrollLeft: 0 },
    { offsetTop: 0, offsetWidth: 0, offsetHeight: 0 }, 2), undefined);
  assert.deepEqual(pdfPosition({ page: 100, x: -1, y: 2 }, 4), { page: 4, x: 0, y: 1 });
  assert.deepEqual(pdfPosition({ page: "2", x: NaN, y: Infinity }, 4), { page: 1, x: 0, y: 0 });
  const position = capturePosition({ scrollLeft: 100, scrollTop: 1500 },
    { offsetTop: 1000, offsetWidth: 500, offsetHeight: 1000 }, 2);
  assert.deepEqual(position, { page: 2, x: 0.2, y: 0.5 });
  const viewport = {};
  restorePosition(viewport, { offsetTop: 20, offsetWidth: 1000, offsetHeight: 2000 }, position);
  assert.deepEqual(viewport, { scrollLeft: 200, scrollTop: 1020 });
});
