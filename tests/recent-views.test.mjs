import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const source = readFileSync(fileURLToPath(new URL('../src/recentViews.ts', import.meta.url)), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const { visitView, keepViewMounted } = await import(`data:text/javascript,${encodeURIComponent(code)}`);

test('only recent unfinished views continue loading after a switch', () => {
  let recent = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) recent = visitView(recent, id);
  assert.deepEqual(recent, ['e', 'd', 'c', 'b']);
  const view = (id, status, viewReady = false, pending = false) =>
    ({ id, status, viewReady, pending, available: true });
  assert.equal(keepViewMounted(view('d', 'loading'), 'e', recent), true);
  assert.equal(keepViewMounted(view('c', 'ready'), 'e', recent), true);
  assert.equal(keepViewMounted(view('b', 'ready', true), 'e', recent), false);
  assert.equal(keepViewMounted(view('a', 'loading'), 'e', recent), false);
  assert.equal(keepViewMounted(view('a', 'ready', true, true), 'e', recent), true);
});
