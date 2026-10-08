// 视频插件把大文件切段转码的规则。规范写在 docs/plugins.md 的「播放代理：先给第一段」一节：首段先出、
// 其余边播边转、内存里只留画面附近那几段。这里的数字决定用户等多久、内存占多少，改一次就该有人重新想一遍。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BUFFERED,
  PREFETCH,
  SEGMENT_SECONDS,
  bufferedWindow,
  nextToBuild,
  segmentCount,
  segmentOf,
  segmentRequest,
} from '../plugins/video/ui/segments.js';

test('a file nobody can measure is one piece, and that piece is the whole file', () => {
  assert.equal(segmentCount(0), 1);
  assert.equal(segmentCount(Number.NaN), 1);
  assert.equal(segmentCount(-5), 1);
  assert.deepEqual(segmentRequest(0, 0), { from: 0, seconds: 0 });
  assert.deepEqual(segmentRequest(3, Number.NaN), { from: 0, seconds: 0 });
});

test('a file no longer than a piece is not cut at all', () => {
  assert.equal(segmentCount(12), 1);
  assert.equal(segmentCount(SEGMENT_SECONDS), 1);
  assert.equal(segmentCount(SEGMENT_SECONDS + 0.001), 2);
  assert.deepEqual(segmentRequest(0, 12), { from: 0, seconds: 12 });
});

test('the pieces tile the file exactly and the last one stops at the end', () => {
  const duration = SEGMENT_SECONDS * 5 + 4;
  const count = segmentCount(duration);
  assert.equal(count, 6);
  let at = 0;
  for (let index = 0; index < count; index += 1) {
    const piece = segmentRequest(index, duration);
    assert.equal(piece.from, at, '每一段都从上一段结束的地方开始');
    assert.ok(piece.seconds > 0, '没有一段是空的');
    assert.ok(piece.seconds <= SEGMENT_SECONDS);
    at += piece.seconds;
  }
  assert.equal(at, duration, '合起来正好是整份文件，不多也不少');
});

test('an index past the end still asks for the last piece rather than for everything', () => {
  assert.deepEqual(segmentRequest(99, 100), { from: 90, seconds: 10 });
  assert.deepEqual(segmentRequest(-4, 100), { from: 0, seconds: 30 });
});

test('the end of the file belongs to the piece that is playing when it gets there', () => {
  const duration = 100;
  assert.equal(segmentOf(0, duration), 0);
  assert.equal(segmentOf(29.9, duration), 0);
  assert.equal(segmentOf(30, duration), 1);
  assert.equal(segmentOf(95, duration), 3);
  assert.equal(segmentOf(100, duration), 3, '结尾落在最后一段，而不是段外');
  assert.equal(segmentOf(4000, duration), 3);
  assert.equal(segmentOf(Number.NaN, duration), 0);
  assert.equal(segmentOf(-3, duration), 0);
});

test('the window holds the piece on screen and the ones it is about to reach', () => {
  const count = 12;
  assert.deepEqual(bufferedWindow(0, count), [0, 1, 2, 3]);
  assert.deepEqual(bufferedWindow(5, count), [5, 6, 7, 8]);
  assert.equal(bufferedWindow(5, count).length, MAX_BUFFERED, '内存里最多就这几段');
  const ahead = bufferedWindow(5, count);
  for (let step = 1; step <= PREFETCH; step += 1)
    assert.ok(ahead.includes(5 + step), '预转的段必须留在窗口里，否则做完就被丢掉');
});

test('near the end the window keeps whole pieces instead of reaching past the file', () => {
  const count = 12;
  const tail = bufferedWindow(count - 1, count);
  assert.equal(tail.at(-1), count - 1);
  assert.equal(tail.length, MAX_BUFFERED);
  assert.deepEqual(bufferedWindow(0, 1), [0]);
  assert.deepEqual(bufferedWindow(9, 3), [0, 1, 2], '比窗口还短的文件就是它自己的全部');
  assert.deepEqual(bufferedWindow(Number.NaN, 2), [0, 1]);
});

test('the piece the user is waiting for is built before the ones made ahead of them', () => {
  const waiting = [{ index: 2, ahead: true }, { index: 1, ahead: false }];
  const { next, dropping } = nextToBuild(waiting, 0, 12);
  assert.equal(next.index, 1, '用户跳过去的段先做，预转排在它后面');
  assert.deepEqual(dropping, [], '用户要的段不会被丢掉');
});

test('pieces waiting for the same reason are built in the order they were asked for', () => {
  const asked = [{ index: 1, ahead: false }, { index: 3, ahead: false }];
  assert.equal(nextToBuild(asked, 0, 12).next.index, 1);
  const ahead = [{ index: 1, ahead: true }, { index: 2, ahead: true }];
  assert.equal(nextToBuild(ahead, 0, 12).next.index, 1, '预转也是先来的先做');
});

test('a look-ahead piece the picture has moved away from is dropped instead of built', () => {
  const waiting = [{ index: 6, ahead: true }, { index: 1, ahead: true }];
  const { next, dropping } = nextToBuild(waiting, 0, 12);
  assert.deepEqual(dropping, [waiting[0]], '没人会看的段不值一次编码，它正挡在用户要的段前面');
  assert.equal(next.index, 1, '留下的那一段就是下一个做的');
});

test('the piece a seek asked for is never dropped, however far away it is', () => {
  const waiting = [{ index: 9, ahead: false }];
  const { next, dropping } = nextToBuild(waiting, 0, 12);
  assert.equal(next.index, 9, '用户要看的段就是要做的段');
  assert.deepEqual(dropping, []);
});

test('nothing waiting means nothing to build', () => {
  const { next, dropping } = nextToBuild([], 0, 12);
  assert.equal(next, null);
  assert.deepEqual(dropping, []);
});
