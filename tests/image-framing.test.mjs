import test from 'node:test';
import assert from 'node:assert/strict';
import { fitGeometry, sameShape } from '../plugins/image/ui/framing.js';

test('a tall image fills a window whose narrow side was rounded', () => {
  const pixels = { width: 976, height: 4065 };
  assert.equal(sameShape({ width: 320, height: 1333 }, pixels), true);
  assert.equal(sameShape({ width: 320, height: 1040 }, pixels), false);
});

test('a landscape image also accepts its rounded short side', () => {
  const pixels = { width: 1408, height: 768 };
  assert.equal(sameShape({ width: 1060, height: 578 }, pixels), true);
  assert.equal(sameShape({ width: 1060, height: 740 }, pixels), false);
});

test('immersive fit fills the limiting window edge without reserving floating chrome', () => {
  const result = fitGeometry(
    { width: 320, height: 1040 },
    { width: 976, height: 4065 },
    { top: 64, bottom: 82 },
    true,
  );
  assert.equal(result.zoom, 1040 / 4065);
  assert.equal(result.y, 0);
  assert.equal(result.zoom * 4065, 1040);
  assert.ok(result.zoom * 976 <= 320);
});

test('immersive fit can enlarge a small image while normal fit keeps its margin', () => {
  const viewport = { width: 800, height: 600 };
  const pixels = { width: 200, height: 100 };
  const insets = { top: 64, bottom: 82 };
  assert.deepEqual(fitGeometry(viewport, pixels, insets, true), { zoom: 4, y: 0 });
  assert.deepEqual(fitGeometry(viewport, pixels, insets, false), { zoom: 1, y: -9 });
});
