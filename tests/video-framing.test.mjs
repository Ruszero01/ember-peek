import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windowForVideo, videoFillsViewport } from '../plugins/video/ui/framing.js';

test('video declares the optional preparation phase and a saved framing setting', () => {
  const manifest = JSON.parse(readFileSync(new URL('../plugins/video/plugin.json', import.meta.url)));
  assert.equal(manifest.prepare, true);
  const setting = manifest.settings.find(({ key }) => key === 'frameWindow');
  assert.equal(setting?.type, 'bool');
  assert.equal(setting?.default, false);
});

test('the frame export destination is a folder the host chooses', () => {
  const manifest = JSON.parse(readFileSync(new URL('../plugins/video/plugin.json', import.meta.url)));
  const setting = manifest.settings.find(({ key }) => key === 'exportDir');
  // Empty means "beside the source video": a plugin must not force a destination on a user
  // who never chose one, and the host is the side that owns the folder picker.
  assert.equal(setting?.type, 'folder');
  assert.equal(setting?.default, '');
});

test('landscape video matches the remembered viewport width and adds ordinary host bars', () => {
  const desired = windowForVideo(
    { width: 1060, height: 740 },
    { width: 1060, height: 740 },
    { width: 1060, height: 600 },
    { width: 1920, height: 1080 },
  );
  assert.deepEqual(desired, { width: 1060, height: 736 });
  assert.equal(videoFillsViewport({ width: 1060, height: 596 }, { width: 1920, height: 1080 }), true);
});

test('portrait video starts from the saved height even after another preview narrowed the window', () => {
  const desired = windowForVideo(
    { width: 1060, height: 740 },
    { width: 320, height: 900 },
    { width: 320, height: 900 },
    { width: 1080, height: 1920 },
  );
  assert.deepEqual(desired, { width: 416, height: 740 });
  assert.equal(videoFillsViewport({ width: 416, height: 740 }, { width: 1080, height: 1920 }), true);
  assert.equal(videoFillsViewport({ width: 640, height: 740 }, { width: 1080, height: 1920 }), false);
});

test('unknown video dimensions leave the host window as it is', () => {
  assert.equal(windowForVideo(
    { width: 1060, height: 740 },
    { width: 1060, height: 740 },
    { width: 1060, height: 740 },
    { width: 0, height: 0 },
  ), null);
});
