import test from 'node:test';
import assert from 'node:assert/strict';
import { fitGeometry, constrainPan, elasticPan, reboundPosition } from '../plugins/psd/ui/geometry.js';

test('PSD fit uses document pixels rather than the sampled preview dimensions', () => {
  const pixels = { width: 13760, height: 5440 };
  const fitted = fitGeometry({ width: 1376, height: 544 }, pixels, { top: 64, bottom: 82 }, true);
  assert.deepEqual(fitted, { zoom: 0.1, x: 0, y: 0 });
  assert.equal(pixels.width * fitted.zoom, 1376);
  assert.equal(pixels.height * fitted.zoom, 544);
});

test('normal fit respects safe bars while immersive fit uses the full window', () => {
  const pixels = { width: 4000, height: 2500 };
  const viewport = { width: 800, height: 600 };
  const insets = { top: 64, bottom: 82 };
  const fitted = fitGeometry(viewport, pixels, insets, false);
  assert.equal(fitted.y, -9);
  assert.ok(pixels.width * fitted.zoom <= viewport.width - 32);
  assert.ok(pixels.height * fitted.zoom <= viewport.height - insets.top - insets.bottom + 1e-9);
  assert.deepEqual(fitGeometry(viewport, pixels, insets, true), { zoom: 0.2, x: 0, y: 0 });
});

test('pan limits leave the document reachable after dragging or shrinking it', () => {
  const viewport = { width: 800, height: 600 }, pixels = { width: 4000, height: 2500 };
  const insets = { top: 64, bottom: 82 };
  for (const zoom of [0.02, 1, 20]) {
    const position = constrainPan({ x: 1e9, y: -1e9 }, viewport, pixels, zoom, insets);
    const left = viewport.width / 2 + position.x - pixels.width * zoom / 2;
    const bottom = viewport.height / 2 + position.y + pixels.height * zoom / 2;
    assert.ok(left <= viewport.width - Math.min(56, pixels.width * zoom / 2));
    assert.ok(bottom >= insets.top + Math.min(56, pixels.height * zoom / 2));
    assert.deepEqual(constrainPan(position, viewport, pixels, zoom, insets), position);
  }
});

test('edge dragging is damped and limited to 32 pixels beyond the reachable bounds', () => {
  const viewport = { width: 800, height: 600 }, pixels = { width: 4000, height: 2500 }, insets = { top: 64, bottom: 82 };
  const inside = { x: 0, y: 0 };
  assert.deepEqual(elasticPan(inside, viewport, pixels, 1, insets), inside);
  for (const direction of [-1, 1]) {
    const far = { x: direction * 1e6, y: direction * 1e6 };
    const edge = constrainPan(far, viewport, pixels, 1, insets);
    const dragged = elasticPan(far, viewport, pixels, 1, insets);
    assert.equal(dragged.x - edge.x, direction * 32);
    assert.equal(dragged.y - edge.y, direction * 32);
    const nearby = elasticPan({ x: edge.x + direction * 10, y: edge.y + direction * 10 }, viewport, pixels, 1, insets);
    assert.ok(Math.abs(nearby.x - edge.x - direction * 2.2) < 1e-9);
  }
});

test('rebound ends exactly at the pan boundary and moves monotonically without overshoot', () => {
  const from = { x: 32, y: -32 }, target = { x: 0, y: 0 };
  assert.deepEqual(reboundPosition(from, target, 0), from);
  assert.deepEqual(reboundPosition(from, target, 1), target);
  assert.deepEqual(reboundPosition(from, target, 2), target);
  let previous = 32;
  for (const progress of [0.1, 0.25, 0.5, 0.75, 1]) {
    const position = reboundPosition(from, target, progress);
    assert.ok(position.x >= 0 && position.x < previous);
    assert.ok(position.y + position.x === 0);
    previous = position.x;
  }
});