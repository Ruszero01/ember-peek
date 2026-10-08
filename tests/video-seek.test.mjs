// 视频插件跳转的规则。规范写在 docs/plugins.md 的「播放代理：先给第一段」一节：时间轴上按下的
// 第一下就开始跳、等待目标段期间画圆环、圆环只填用户要的那一段。这两条都决定用户看到什么，
// 改一次就该有人重新想一遍，所以钉在这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { RING_WAITING, ringFill, timelineSeek } from '../plugins/video/ui/seek.js';

test('时间轴落在哪一格，那一下就开始跳', () => {
  // 按下本身不带走任何值（滑块要在按下之后才挪到落点），第一次 input 才是落点。
  const pressed = timelineSeek(false, 'press', 60);
  assert.equal(pressed.seek, null);
  assert.equal(pressed.asked, false);
  const landed = timelineSeek(pressed.asked, 'input', 278);
  assert.deepEqual(landed.seek, { value: 278, commit: true }, '落点直接问，不等手停下');
  // 手继续拖：中间经过的时刻只是预览，不为每一格都排一次转码。
  const dragged = timelineSeek(landed.asked, 'input', 300);
  assert.deepEqual(dragged.seek, { value: 300, commit: false });
  assert.deepEqual(timelineSeek(dragged.asked, 'input', 301).seek, { value: 301, commit: false });
  // 手停下：按停下的位置再问一次，这一次交互结束。
  const stopped = timelineSeek(true, 'end', 305);
  assert.deepEqual(stopped.seek, { value: 305, commit: true });
  assert.equal(stopped.asked, false, '下一次交互重新从落点问起');
});

test('松开手和 change 都算一次结束，重复问同一个时刻不会有第二种答案', () => {
  // 指针松开和浏览器的 change 都会结束一次拖动，两边问的都是停下的值。
  const first = timelineSeek(true, 'end', 305);
  const second = timelineSeek(first.asked, 'end', 305);
  assert.deepEqual(first.seek, second.seek);
});

test('方向键没有指针事件，每一次按键都算一次落点', () => {
  // 键盘只给 input + change：input 问、change 结束这次交互，于是连按不会退化成「只有第一次算数」。
  let asked = false;
  for (const to of [120, 125, 130]) {
    const stepped = timelineSeek(asked, 'input', to);
    assert.deepEqual(stepped.seek, { value: to, commit: true });
    asked = timelineSeek(stepped.asked, 'end', to).asked;
  }
});

test('没有值的 input 什么都不问', () => {
  assert.equal(timelineSeek(true, 'input', Number.NaN).seek, null);
  assert.equal(timelineSeek(false, 'input', undefined).seek, null);
  assert.equal(timelineSeek(true, 'input', Number.NaN).asked, true, '状态不被空值打乱');
});

test('还不认识的进度是一个明确的「还不知道」，不是 0 也不是上一个数字', () => {
  assert.equal(ringFill(undefined), null);
  assert.equal(ringFill(Number.NaN), null);
  assert.equal(ringFill(''), null);
  assert.equal(ringFill(0), 0);
  assert.equal(ringFill(0.25), 0.25);
  assert.equal(ringFill(1), 1);
  assert.equal(ringFill(-1), 0, '越界即停在两端');
  assert.equal(ringFill(3), 1);
});

test('排队等待的圆环画成看得见的一小段，而不是空圈', () => {
  assert.ok(RING_WAITING > 0 && RING_WAITING < 1, '空圈转起来什么也看不见，满圈转起来看不出在转');
});
