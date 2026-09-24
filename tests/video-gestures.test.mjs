// 视频插件的拖动与方向键规则。规范写在 docs/plugins.md 的「插件吃自己矩形里的指针与键盘」一节：
// 左右拖=时间轴、上下拖=音量、没动过的按下仍是播放/暂停、方向键每次 5 秒。这里钉住这几条数字，
// 因为它们决定手感，改一次就应该有人重新想一遍。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAG_THRESHOLD,
  KEY_STEP,
  MIN_VOLUME,
  PIXELS_PER_EFOLD,
  dragAxis,
  seekFromDrag,
  stepTime,
  volumeFromDrag,
} from '../plugins/video/ui/gestures.js';

test('a press stays a click until the hand has actually moved', () => {
  assert.equal(dragAxis(0, 0), null);
  assert.equal(dragAxis(DRAG_THRESHOLD - 1, 0), null);
  assert.equal(dragAxis(0, -(DRAG_THRESHOLD - 1)), null);
  assert.equal(dragAxis(DRAG_THRESHOLD, 0), 'seek');
});

test('the axis is the direction the hand took, and a tie goes to the timeline', () => {
  assert.equal(dragAxis(30, 6), 'seek');
  assert.equal(dragAxis(-30, 6), 'seek');
  assert.equal(dragAxis(6, 30), 'volume');
  assert.equal(dragAxis(6, -30), 'volume');
  assert.equal(dragAxis(20, 20), 'seek');
});

test('one viewport width of horizontal travel covers the whole file', () => {
  assert.equal(seekFromDrag(60, 0, 800, 240), 60);
  assert.equal(seekFromDrag(60, 400, 800, 240), 180);
  assert.equal(seekFromDrag(60, -400, 800, 240), 0, 'the start of the file is a wall');
  assert.equal(seekFromDrag(60, 4000, 800, 240), 240, 'so is the end');
  // A viewport with no measured width, or a file whose duration has not arrived, must not
  // produce NaN or a negative time.
  assert.ok(Number.isFinite(seekFromDrag(60, 40, 0, 240)));
  assert.equal(seekFromDrag(12, 50, 800, Number.NaN), 0);
});

test('vertical travel is a ratio, so the same gesture works at any level', () => {
  assert.ok(Math.abs(volumeFromDrag(0.3, -PIXELS_PER_EFOLD) - 0.3 * Math.E) < 1e-9);
  assert.ok(Math.abs(volumeFromDrag(0.3, PIXELS_PER_EFOLD) - 0.3 / Math.E) < 1e-9);
  const loud = volumeFromDrag(0.3, -PIXELS_PER_EFOLD) / 0.3;
  const quiet = volumeFromDrag(0.15, -PIXELS_PER_EFOLD) / 0.15;
  assert.ok(Math.abs(loud - quiet) < 1e-9, 'the same travel is the same ratio change');
});

test('a drag never leaves the volume range, and one it could not read keeps the level', () => {
  assert.equal(volumeFromDrag(1, -PIXELS_PER_EFOLD * 4), 1);
  assert.equal(volumeFromDrag(MIN_VOLUME, PIXELS_PER_EFOLD * 4), MIN_VOLUME);
  assert.equal(volumeFromDrag(0.4, 0), 0.4);
  assert.equal(volumeFromDrag(Number.NaN, 0), 1);
});

test('arrow keys step the timeline and stop at the file ends', () => {
  assert.equal(stepTime(30, 1, 240), 30 + KEY_STEP);
  assert.equal(stepTime(30, -1, 240), 30 - KEY_STEP);
  assert.equal(stepTime(239, 1, 240), 240);
  assert.equal(stepTime(2, -1, 240), 0);
  assert.equal(stepTime(30, 1, 240, 1), 31);
  assert.equal(stepTime(30, 1, Number.NaN), 35, 'metadata that has not arrived does not block a step');
});
