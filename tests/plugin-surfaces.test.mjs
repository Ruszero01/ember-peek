import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayOptions, sidebarOptions, sidebarWidth, overlaySize, rememberedSidebarWidth } from '../src/surfaces.mjs';

test('overlay options preserve existing behavior and validate each independent choice', () => {
  assert.deepEqual(overlayOptions(), { movable: true, resizable: false, followToolbar: false });
  assert.deepEqual(overlayOptions({ movable: false, resizable: true, followToolbar: true }), { movable: false, resizable: true, followToolbar: true });
  for (const value of [null, [], { movable: 0 }, { resizable: 'true' }, { unrelated: true }]) assert.throws(() => overlayOptions(value));
});

test('sidebar bounds reject untrusted geometry and support either side', () => {
  assert.equal(sidebarOptions().side, 'left');
  assert.equal(sidebarOptions({ side: 'right' }).side, 'right');
  for (const value of [null, [], { side: 'top' }, { width: NaN }, { width: Infinity }, { width: '220' }, { minWidth: 400 }, { maxWidth: 100 }, { width: 801 }, { html: '<script>' }]) assert.throws(() => sidebarOptions(value));
});

test('sidebar resizing respects declared bounds and leaves room in narrow windows', () => {
  const bounds = sidebarOptions();
  assert.equal(sidebarWidth(10, bounds, 1200), 140);
  assert.equal(sidebarWidth(900, bounds, 1200), 480);
  assert.equal(sidebarWidth(220, bounds, 320), 157);
  assert.equal(sidebarWidth(220, bounds, 100), 47);
  assert.equal(sidebarWidth(220, bounds, 0), 0);
});

test('overlay resizing retains usable content with or without its movement strip', () => {
  const viewport = {width: 1000, height: 700};
  assert.deepEqual(overlaySize({width: 500, height: 300}, viewport), {width: 500, height: 300});
  assert.deepEqual(overlaySize({width: 1, height: 1}, viewport), {width: 120, height: 36});
  assert.deepEqual(overlaySize({width: 1, height: 1}, viewport, 0), {width: 120, height: 24});
  assert.deepEqual(overlaySize({width: 2000, height: 1000}, viewport), viewport);
  assert.deepEqual(overlaySize({width: 2000, height: 1000}, {width: 100, height: 20}), {width: 100, height: 20});
});

test('remembered sidebar widths validate stored data and survive temporary narrow viewports', () => {
  const options = sidebarOptions();
  for (const value of [null, '300', {}, NaN, 900]) assert.equal(rememberedSidebarWidth(value, options), 220);
  assert.equal(rememberedSidebarWidth(300, options), 300);
  assert.equal(sidebarWidth(300, options, 320), 157);
  assert.equal(rememberedSidebarWidth(300, options), 300);
  assert.equal(rememberedSidebarWidth(600, options), 480);
});
