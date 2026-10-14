/** A bounded, gapless Web Audio scheduler for the native decoder fallback. */
export class ChunkPlayer {
  constructor(read, createContext = () => new AudioContext(), changed = () => {}) {
    this.read = read; this.createContext = createContext; this.changed = changed;
    this.context = null; this.gain = null; this.sources = new Set(); this.queue = [];
    this.generation = 0; this.intent = 0; this.wantsPlay = false; this.chain = Promise.resolve(); this.busy = false;
    this.paused = true; this.eof = false; this.duration = 0; this.rate = 1;
    this.anchor = 0; this.anchorClock = 0; this.nextClock = 0; this.volume = 0.8; this.muted = false;
  }
  get currentTime() {
    return this.anchor + (this.context ? Math.max(0, this.context.currentTime - this.anchorClock) * this.rate : 0);
  }
  async request(seek) {
    const task = this.chain.catch(() => {}).then(() => this.read(seek === undefined ? {} : { seek }));
    this.chain = task; return task;
  }
  decode(chunk) {
    const channels = chunk.channels, sampleRate = chunk.sampleRate;
    if (!Number.isInteger(channels) || channels < 1 || channels > 8 || sampleRate < 8000 || sampleRate > 192000 || typeof chunk.pcm !== 'string' || chunk.pcm.length > 2800000) throw new Error('Invalid decoded audio chunk');
    const bytes = Uint8Array.from(atob(chunk.pcm), char => char.charCodeAt(0));
    if (bytes.length % (4 * channels)) throw new Error('Incomplete audio sample frame');
    if (Number.isFinite(chunk.duration) && chunk.duration > 0) this.duration = chunk.duration;
    const frames = bytes.length / 4 / channels;
    if (!frames) return null;
    const buffer = this.context.createBuffer(channels, frames, sampleRate);
    const samples = new DataView(bytes.buffer);
    for (let channel = 0; channel < channels; channel++) {
      const output = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame++) output[frame] = samples.getFloat32((frame * channels + channel) * 4, true);
    }
    return buffer;
  }
  async initialize() {
    this.context = this.createContext(); this.gain = this.context.createGain(); this.gain.connect(this.context.destination);
    await this.context.suspend(); this.setVolume(this.volume, this.muted);
    await this.seek(0, false, false);
  }
  stopSources() {
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear(); this.queue = [];
  }
  async seek(time, resume = !this.paused, explicit = true) {
    const ticket = ++this.generation, intent = ++this.intent; this.wantsPlay = false;
    this.paused = true; this.stopSources(); await this.context.suspend();
    if (ticket !== this.generation) return;
    this.anchor = Math.max(0, Number(time) || 0); this.anchorClock = this.context.currentTime; this.nextClock = this.context.currentTime; this.eof = false;
    const chunk = await this.request(explicit ? this.anchor : undefined);
    if (ticket !== this.generation) return;
    const buffer = this.decode(chunk); this.eof = chunk.ended === true;
    if (buffer) this.queue.push(buffer);
    if (this.eof && !this.duration) this.duration = this.anchor + (buffer?.duration || 0);
    if (resume && intent === this.intent) await this.play();
    this.changed();
  }
  async play() {
    if (!this.context || !this.paused) return;
    if (this.duration && this.anchor >= this.duration) await this.seek(0, false);
    const intent = ++this.intent, ticket = this.generation; this.wantsPlay = true;
    await this.context.resume();
    if (intent !== this.intent || ticket !== this.generation) {
      if (!this.wantsPlay) await this.context.suspend();
      return;
    }
    this.paused = false;
    // Context time is frozen while paused; the previously scheduled tail remains valid.
    this.schedule(); void this.pump().catch(error => this.fail(error)); this.changed();
  }
  async pause() {
    if (!this.context) return;
    ++this.intent; this.wantsPlay = false; this.paused = true; await this.context.suspend(); this.changed();
  }
  setVolume(volume, muted = this.muted) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0)); this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : this.volume;
  }
  async setRate(rate) {
    const position = this.currentTime, resume = !this.paused;
    const nextRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
    if (nextRate === this.rate) return;
    this.rate = nextRate;
    await this.seek(position, resume);
  }
  schedule() {
    while (!this.paused && this.queue.length) {
      const buffer = this.queue.shift(), source = this.context.createBufferSource();
      source.buffer = buffer; source.playbackRate.value = this.rate; source.connect(this.gain);
      const at = Math.max(this.nextClock, this.context.currentTime + 0.02);
      // Account for an underrun once, rather than advancing the displayed position during silence.
      if (!this.sources.size && at > this.nextClock) this.anchorClock += at - this.nextClock;
      this.nextClock = at + buffer.duration / this.rate;
      this.sources.add(source);
      source.onended = () => {
        source.disconnect(); this.sources.delete(source);
        if (!this.paused && this.eof && !this.sources.size && !this.queue.length && !this.busy) {
          this.anchor = this.duration || this.currentTime; this.anchorClock = this.context.currentTime;
          this.paused = true; void this.context.suspend(); this.changed(true);
        } else if (!this.paused) void this.pump().catch(error => this.fail(error));
      };
      source.start(at);
    }
  }
  async pump() {
    if (this.busy || this.paused || this.eof) return;
    this.busy = true; const ticket = this.generation;
    try {
      // At most four seconds of scheduled playback plus one bounded decoder chunk.
      while (!this.paused && !this.eof && (this.nextClock - this.context.currentTime) * this.rate < 4) {
        const chunk = await this.request();
        if (ticket !== this.generation) return;
        const buffer = this.decode(chunk); this.eof = chunk.ended === true;
        if (buffer) { this.queue.push(buffer); if (this.eof && !this.duration) this.duration = this.currentTime + Math.max(0, this.nextClock - this.context.currentTime) * this.rate + buffer.duration; }
        if (!buffer && !this.eof) throw new Error('Decoder returned no audio');
        this.schedule();
      }
    } finally {
      this.busy = false;
      if (ticket === this.generation && this.eof && !this.paused && !this.sources.size && !this.queue.length) {
        this.anchor = this.duration || this.currentTime; this.anchorClock = this.context.currentTime;
        this.paused = true; void this.context.suspend(); this.changed(true);
      }
      if (ticket !== this.generation && !this.paused) void this.pump().catch(error => this.fail(error));
    }
  }
  fail(error) { void this.pause(); this.changed(false, error); }
  dispose() { ++this.generation; ++this.intent; this.wantsPlay = false; this.paused = true; this.stopSources(); void this.context?.close(); }
}
export function clock(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${String(seconds).padStart(2, '0')}`;
}
