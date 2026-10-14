import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkPlayer, clock } from '../plugins/audio/ui/player.js';

function chunk(start = 0, ended = false, seconds = 2, channels = 2) {
  const bytes = Buffer.alloc(8000 * seconds * channels * 4);
  for (let i = 0; i < bytes.length / 4; i++) bytes.writeFloatLE(i % channels ? -0.25 : 0.5, i * 4);
  return { pcm:bytes.toString('base64'), sampleRate:8000, channels, start, duration:20, ended };
}
class Context {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.created = []; this.destination = {}; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return { gain:{ value:1 }, connect() {} }; }
  createBuffer(channels, frames, rate) {
    const data = Array.from({ length:channels }, () => new Float32Array(frames));
    return { duration:frames / rate, getChannelData:i => data[i] };
  }
  createBufferSource() {
    const source = { playbackRate:{ value:1 }, connect() {}, disconnect() {}, stop() { this.stopped = true; }, start(at) { this.at = at; } };
    this.created.push(source); return source;
  }
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('fallback deinterleaves PCM and schedules adjacent chunks without accumulating a whole file', async () => {
  const context = new Context(); let reads = 0;
  const player = new ChunkPlayer(async () => chunk(reads++ * 2), () => context);
  await player.initialize(); assert.equal(context.state, 'suspended');
  await player.play(); await flush();
  assert.equal(context.created[0].buffer.getChannelData(0)[0], 0.5);
  assert.equal(context.created[0].buffer.getChannelData(1)[0], -0.25);
  assert.equal(context.created[1].at, context.created[0].at + 2);
  assert.equal(reads, 2); assert.equal(player.sources.size, 2);
  await player.pause(); assert.equal(context.state, 'suspended');
  const before = reads; await player.pump(); assert.equal(reads, before);
  player.dispose(); assert.equal(context.state, 'closed');
});
test('a later seek supersedes a late decode reply and requests remain serial', async () => {
  const context = new Context(); let finishOld; const calls = [];
  const player = new ChunkPlayer(value => {
    calls.push(value);
    if (value.seek === 8) return new Promise(resolve => { finishOld = resolve; });
    return Promise.resolve(chunk(value.seek || 0));
  }, () => context);
  await player.initialize();
  const old = player.seek(8, false); await flush();
  const latest = player.seek(16, false); await flush();
  assert.equal(calls.length, 2);
  finishOld(chunk(8)); await Promise.all([old, latest]);
  assert.equal(player.currentTime, 16); assert.equal(player.queue.length, 1);
  assert.equal(calls.at(-1).seek, 16); assert.equal(player.paused, true);
  player.dispose();
});
test('changing speed preserves position and bounds source-time prebuffering', async () => {
  const context = new Context(); let reads = 0;
  const player = new ChunkPlayer(async () => { reads++; return chunk(); }, () => context);
  await player.initialize(); await player.setRate(1); assert.equal(reads, 1);
  await player.setRate(4); await player.play(); await flush();
  assert.equal(context.created[0].playbackRate.value, 4);
  assert.ok(player.sources.size <= 2);
  player.setVolume(0.3, true); assert.equal(player.gain.gain.value, 0);
  player.setVolume(0.3, false); assert.equal(player.gain.gain.value, 0.3);
  player.dispose();
});
test('the last scheduled chunk ends once and invalid PCM cannot allocate unbounded buffers', async () => {
  const context = new Context(); let ended = 0;
  const player = new ChunkPlayer(async () => chunk(0, true), () => context, value => { if (value) ended++; });
  await player.initialize(); await player.play();
  assert.equal(context.created.length, 1);
  context.created[0].onended(); assert.equal(ended, 1); assert.equal(player.paused, true);
  assert.throws(() => player.decode({ ...chunk(), channels:99 }), /Invalid/);
  assert.throws(() => player.decode({ ...chunk(), pcm:'A'.repeat(2800001) }), /Invalid/);
  assert.throws(() => player.decode({ ...chunk(), pcm:Buffer.alloc(3).toString('base64') }), /Incomplete/);
  player.dispose();
});
test('audio clocks remain readable for long recordings', () => {
  assert.equal(clock(65.9), '1:05'); assert.equal(clock(3661), '1:01:01'); assert.equal(clock(-2), '0:00');
});
test('pausing while a seek is decoding prevents delayed playback from restarting', async () => {
  const context = new Context(); let finish;
  const player = new ChunkPlayer(value => value.seek === 8 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(chunk()), () => context);
  await player.initialize(); await player.play(); await flush();
  const seek = player.seek(8, true); await flush();
  await player.pause(); finish(chunk(8)); await seek;
  assert.equal(player.paused, true); assert.equal(context.state, 'suspended'); assert.equal(player.sources.size, 0);
  player.dispose();
});
test('pausing during an AudioContext resume cannot schedule hidden audio', async () => {
  const context = new Context(); let finish;
  const player = new ChunkPlayer(async () => chunk(), () => context);
  await player.initialize();
  context.resume = () => new Promise(resolve => { finish = () => { context.state = 'running'; resolve(); }; });
  const play = player.play(); await flush(); await player.pause(); finish(); await play;
  assert.equal(player.paused, true); assert.equal(context.state, 'suspended'); assert.equal(context.created.length, 0);
  player.dispose();
});
