import test from 'node:test';
import assert from 'node:assert/strict';
import { waveformPeaks, progressRatio, WaveformTrack } from '../plugins/audio/ui/waveform.js';

const data = { peaks:[[-0.2,0.4],[-0.8,0.7],[-0.1,0.1],[0,0]], samplesPerPeak:100, sampleRate:100, done:true };
test('WaveSurfer peak adapter preserves signed extrema and pads undecoded time with silence', () => {
  const [samples] = waveformPeaks(data, 4);
  assert.equal(samples.length, 8);
  assert.ok(Math.abs(samples[2] + 0.8) < 1e-6);
  assert.ok(Math.abs(samples[3] - 0.7) < 1e-6);
  const [partial] = waveformPeaks({ ...data, peaks:data.peaks.slice(0, 1) }, 4);
  assert.deepEqual([...partial.slice(2)], [0,0,0,0,0,0]);
});
test('long or malformed peak payloads stay finite and bounded', () => {
  const [samples] = waveformPeaks({ ...data, peaks:[[NaN,Infinity],[-2,2]] }, 86400);
  assert.equal(samples.length, 4096);
  assert.ok([...samples].every(value => Number.isFinite(value) && Math.abs(value) <= 1));
  assert.equal(waveformPeaks({ ...data, peaks:Array(2049).fill([-1,1]) }, 4), null);
  assert.equal(waveformPeaks(data, 0), null);
  assert.equal(waveformPeaks({ ...data, sampleRate:0 }, 4), null);
});
test('peak downsampling retains transients when declared duration exceeds the native bin budget', () => {
  const peaks = Array.from({ length:2048 }, (_, index) => index === 1001 ? [-1,1] : [0,0]);
  const [samples] = waveformPeaks({ ...data, peaks }, 4096);
  assert.ok(samples.includes(-1)); assert.ok(samples.includes(1));
});
test('playhead clamps seeks and tolerates unknown duration', () => {
  assert.equal(progressRatio(5,10),0.5); assert.equal(progressRatio(-5,10),0);
  assert.equal(progressRatio(50,10),1); assert.equal(progressRatio(NaN,10),0); assert.equal(progressRatio(5,0),0);
});
test('waveform updates use peaks without a file URL and preserve current progress', async () => {
  const original = Object.fromEntries(['document','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const media = { currentTime:0, src:'' }, loads = [], times = [], frames = new Map();
  let sequence = 0, destroyed = 0, redraw, options, updatedColors, color = '#888';
  const wave = { on:(_event, handler) => { redraw = handler; return () => {}; }, load:async (...args) => { loads.push(args); }, setTime:value => times.push(value), setOptions:value => { updatedColors = value; }, destroy:() => destroyed++ };
  try {
    globalThis.document = { querySelector:() => ({}), createElement:() => media };
    globalThis.getComputedStyle = () => ({ getPropertyValue:() => color });
    globalThis.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    const root = { querySelector:() => ({}), dataset:{} };
    const track = new WaveformTrack(root, String, { WaveSurfer:{ create:value => { options = value; return wave; } }, Timeline:{ create:() => ({}) } });
    assert.equal(options.media, media); assert.equal(options.url, undefined);
    track.setPosition(2, 4);
    await track.update({...data,done:false},4);
    assert.equal(loads.length,0); assert.equal(root.dataset.ready,undefined);
    await track.update(data, 4);
    assert.equal(root.dataset.ready,'true');
    assert.equal(loads[0][0], ''); assert.ok(loads[0][1][0] instanceof Float32Array); assert.equal(loads[0][2], 4);
    assert.equal(times.at(-1), 2); redraw(); assert.equal(times.at(-1), 2);
    track.refreshTheme(); assert.equal(updatedColors, undefined);
    color = '#aaa'; track.refreshTheme(); assert.equal(updatedColors.progressColor, '#aaa'); assert.equal(times.at(-1), 2);
    track.setActive(true, () => ({ time:3, duration:4 }));
    const [id, callback] = frames.entries().next().value; frames.delete(id); callback();
    assert.equal(times.at(-1), 3); assert.equal(frames.size, 1);
    track.setActive(false); assert.equal(frames.size, 0);
    track.dispose(); track.dispose(); await track.update(data, 4);
    assert.equal(destroyed, 1); assert.equal(loads.length, 1); assert.equal(media.src, '');
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
