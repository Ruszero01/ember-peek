import { WaveSurfer, Timeline } from './vendor/wavesurfer.js';

/** Adapt native signed extrema to bounded, uniformly spaced WaveSurfer samples. */
export function waveformPeaks(data, duration) {
  if (!Array.isArray(data?.peaks) || data.peaks.length > 2048 || !Number.isFinite(duration) || duration <= 0) return null;
  const secondsPerPeak = Number(data.samplesPerPeak) / Number(data.sampleRate);
  if (!Number.isFinite(secondsPerPeak) || secondsPerPeak <= 0) return null;
  const bins = Math.min(2048, Math.max(1, Math.ceil(duration / secondsPerPeak)));
  const samples = new Float32Array(bins * 2);
  for (let bin = 0; bin < bins; bin++) {
    const first = Math.floor(bin / bins * duration / secondsPerPeak);
    const last = Math.min(data.peaks.length, Math.ceil((bin + 1) / bins * duration / secondsPerPeak));
    let low = 0, high = 0;
    for (let index = first; index < last; index++) {
      const pair = data.peaks[index];
      if (!Array.isArray(pair)) continue;
      low = Math.min(low, Number.isFinite(pair[0]) ? pair[0] : 0);
      high = Math.max(high, Number.isFinite(pair[1]) ? pair[1] : 0);
    }
    samples[bin * 2] = Math.max(-1, low);
    samples[bin * 2 + 1] = Math.min(1, high);
  }
  return [samples];
}

export function progressRatio(time, duration) {
  return Number.isFinite(time) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
}

export class WaveformTrack {
  constructor(root, clock, library = { WaveSurfer, Timeline }) {
    this.root = root; this.duration = 0; this.position = 0; this.active = false; this.frame = 0; this.disposed = false;
    const colors = getComputedStyle(root);
    this.themeKey = `${colors.getPropertyValue('--muted').trim()}|${colors.getPropertyValue('--accent').trim()}`;
    const timeline = library.Timeline.create({ container:document.querySelector('#ruler'), height:20, formatTimeCallback:clock, secondaryLabelOpacity:0.7, style:{ color:'var(--muted)', fontSize:'10px' } });
    // A source-less media element isolates visual updates from both real playback backends.
    // Never pass the file URL: only bounded native peaks reach WaveSurfer.
    this.wave = library.WaveSurfer.create({ container:root.querySelector('#wave-renderer'), media:document.createElement('audio'), height:'auto', waveColor:colors.getPropertyValue('--muted').trim(), progressColor:colors.getPropertyValue('--accent').trim(), cursorColor:colors.getPropertyValue('--accent').trim(), cursorWidth:2, normalize:true, barWidth:2, barGap:1, barRadius:1, barMinHeight:0, barHeight:0.88, interact:false, dragToSeek:false, hideScrollbar:true, autoScroll:false, plugins:[timeline] });
    this.unsubscribe = this.wave.on('redrawcomplete', () => this.setPosition(this.position, this.duration));
  }
  async update(data, duration) {
    if (this.disposed) return;
    const total = Math.max(duration || 0, data.decodedDuration || 0);
    if (data.done !== true) return;
    const peaks = waveformPeaks(data, total);
    if (!peaks) return;
    this.duration = total;
    await this.wave.load('', peaks, total);
    if (!this.disposed) {
      this.root.dataset.ready = 'true';
      this.setPosition(this.position, this.duration);
    }
  }
  setPosition(time, duration) {
    this.position = time;
    if (!this.disposed && this.duration > 0) this.wave.setTime(progressRatio(time, duration || this.duration) * this.duration);
  }
  refreshTheme() {
    if (this.disposed) return;
    const colors = getComputedStyle(this.root);
    const key = `${colors.getPropertyValue('--muted').trim()}|${colors.getPropertyValue('--accent').trim()}`;
    if (key === this.themeKey) return;
    this.themeKey = key;
    this.wave.setOptions({ waveColor:colors.getPropertyValue('--muted').trim(), progressColor:colors.getPropertyValue('--accent').trim(), cursorColor:colors.getPropertyValue('--accent').trim() });
    this.setPosition(this.position, this.duration);
  }
  setActive(active, readState) {
    this.readState = readState;
    if (this.active === active) return;
    this.active = active;
    if (active) this.frame = requestAnimationFrame(() => this.animate());
    else { cancelAnimationFrame(this.frame); this.frame = 0; }
  }
  animate() {
    if (!this.active || this.disposed) return;
    const state = this.readState(); this.setPosition(state.time, state.duration);
    this.frame = requestAnimationFrame(() => this.animate());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.setActive(false); this.unsubscribe(); this.wave.destroy();
  }
}
