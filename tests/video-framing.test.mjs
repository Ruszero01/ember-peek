import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windowForVideo, videoFillsViewport } from '../plugins/video/ui/framing.js';

test('video layout fits the viewport without intrinsic portrait dimensions expanding its grid', () => {
  const css = readFileSync(new URL('../plugins/video/ui/style.css', import.meta.url), 'utf8');
  const viewer = css.match(/#viewer\s*\{([^}]+)\}/)?.[1];
  const video = css.match(/\nvideo\s*\{([^}]+)\}/)?.[1];
  assert.match(viewer, /grid-template:\s*minmax\(0,\s*1fr\)\s*\/\s*minmax\(0,\s*1fr\)/);
  for (const axis of ['width', 'height']) {
    assert.match(video, new RegExp(`(?:^|[;\\s])min-${axis}:\\s*0\\s*;`));
    assert.match(video, new RegExp(`(?:^|[;\\s])${axis}:\\s*100%\\s*;`));
  }
  assert.match(video, /object-fit:\s*contain\s*;/);
});

test('video letterboxing exposes the host viewport backdrop', () => {
  const css = readFileSync(new URL('../plugins/video/ui/style.css', import.meta.url), 'utf8');
  for (const selector of [':root', '#viewer', 'video']) {
    const rule = css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]+)\\}`))?.[1];
    assert.match(rule, /background:\s*transparent\s*;/, selector);
  }
});

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
