import { ready, call, controls, status, streamUrl, presented, configuration, onSettings, setSetting, onVisibility, createIcon, translate, onLocale, onTheme, shortcuts } from './sdk.js';
import { ChunkPlayer, clock } from './player.js';
import { WaveformTrack } from './waveform.js';
import { SettingDraft } from './setting-draft.js';
const initial = await ready;
const say = translate({
  'zh-CN': { play:'播放', pause:'暂停', mute:'静音', unmute:'取消静音', volume:'音量', loop:'循环播放', speed:'播放速度', progress:'播放进度', transport:'播放控制', loading:'正在读取音频…', compatibility:'正在使用内置解码器…', failed:'音频无法播放：{error}', paused:'已暂停', playing:'正在播放', blocked:'点击播放以开始试听', unknown:'时长未知', track:'音频轨道', waveLoading:'生成波形 {percent}%', waveUnavailable:'该编码暂不能生成波形', back:'后退 5 秒', forward:'前进 5 秒' },
  en: { play:'Play', pause:'Pause', mute:'Mute', unmute:'Unmute', volume:'Volume', loop:'Loop', speed:'Playback speed', progress:'Playback position', transport:'Playback controls', loading:'Reading audio…', compatibility:'Using the built-in decoder…', failed:'Unable to play audio: {error}', paused:'Paused', playing:'Playing', blocked:'Click Play to listen', unknown:'Unknown duration', track:'AUDIO TRACK', waveLoading:'Building waveform {percent}%', waveUnavailable:'Waveform unavailable for this codec', back:'Back 5 seconds', forward:'Forward 5 seconds' },
});
async function icon(button, name, label) {
  button.title = label; button.setAttribute('aria-label', label);
  if (button.dataset.icon === name) return;
  button.dataset.icon = name;
  const image = await createIcon(name, 22);
  if (button.dataset.icon === name) button.replaceChildren(image);
}

{
  const waveform = new WaveformTrack(document.querySelector('#waveform'), clock);
  onTheme(() => waveform.refreshTheme());
  const waveNote = document.querySelector('#wave-note');
  let waveTimer, waveBusy = false, waveDone = false, waveStarted = 0;
  const playButton = document.querySelector('#play'), timeline = document.querySelector('#timeline');
  document.querySelector('#title').textContent = initial.file?.name || '';
  document.querySelector('#format').textContent = initial.data.format;
  let dragging = false;
  const audio = document.querySelector('audio'), message = document.querySelector('#message');
  let fallback = null, disposed = false, readyToPlay = false, shown = initial.visible !== false;
  let loop = configuration().loop === true, muted = false;
  let volume = Number(configuration().volume) || 0.8, speed = 1, switching = false, volumeTimer;
  const volumeDraft = new SettingDraft(volume);
  let knownDuration = 0, codecDetails = '', errorText = '', lastControlState = '';
  const paused = () => fallback ? fallback.paused : audio.paused;
  const duration = () => fallback ? fallback.duration || knownDuration : Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : knownDuration;
  const position = () => Math.max(0, fallback ? fallback.currentTime : audio.currentTime);
  function sync(force = false) {
    if (disposed) return;
    const state = { paused:paused(), currentTime:position(), duration:duration() };
    document.querySelector('#current').textContent = clock(dragging ? Number(timeline.value) : state.currentTime);
    document.querySelector('#duration').textContent = state.duration ? clock(state.duration) : '—';
    timeline.disabled = !state.duration || !readyToPlay;
    timeline.max = String(state.duration || 1);
    if (!dragging) timeline.value = String(Math.min(state.currentTime, state.duration || 1));
    waveform.setPosition(dragging ? Number(timeline.value) : state.currentTime, state.duration);
    timeline.setAttribute('aria-label', say('progress'));
    document.querySelector('#transport').setAttribute('aria-label', say('transport'));
    playButton.disabled = !readyToPlay;
    void icon(playButton, state.paused ? 'play' : 'pause', say(state.paused ? 'play' : 'pause'));
    for (const [id, key, name] of [['back', 'back', 'rotate-ccw'], ['forward', 'forward', 'rotate-cw']]) {
      const button = document.querySelector(`#${id}`); button.disabled = !readyToPlay || !state.duration;
      void icon(button, name, say(key));
    }
    waveform.setActive(shown && !state.paused, () => {
      const time = dragging ? Number(timeline.value) : position(), total = duration();
      if (!dragging) timeline.value = String(Math.min(time, total || 1));
      const text = clock(time); if (document.querySelector('#current').textContent !== text) document.querySelector('#current').textContent = text;
      return { time, duration:total };
    });
    status([initial.data.format, codecDetails, `${clock(state.currentTime)} / ${state.duration ? clock(state.duration) : say('unknown')}`, errorText || say(state.paused ? 'paused' : 'playing')].filter(Boolean).join(' · '));
    const controlState = JSON.stringify([state.paused, muted, volume, loop, speed]);
    if (force || controlState !== lastControlState) { lastControlState = controlState; publish(); }
  }
  function showError(error) { errorText = say('failed', { error:String(error?.message || error) }); message.textContent = errorText; sync(true); }
  function publish() {
    controls([
      { id:'mute', kind:'toggle', label:say(muted ? 'unmute' : 'mute'), icon:muted ? 'volume-x' : 'volume-2', active:muted, run:() => { muted = !muted; applyVolume(); } },
      { id:'volume', kind:'scrub', defaultValue:80, label:say('volume'), icon:'volume-2', min:1, max:100, value:Math.max(1, Math.round(volume * 100)), suffix:'%', run:value => { volume = Math.max(0.01, Math.min(1, Number(value) / 100)); muted = false; volumeDraft.edit(volume); applyVolume(); clearTimeout(volumeTimer); volumeTimer = setTimeout(() => void setSetting('volume', volume).catch(() => { volume = Number(configuration().volume) || 0.8; volumeDraft.reset(volume); if (!disposed) applyVolume(); }), 400); } },
      { id:'loop', kind:'toggle', label:say('loop'), icon:'repeat', active:loop, run:() => { loop = !loop; audio.loop = loop; void setSetting('loop', loop); sync(true); } },
      { id:'speed', kind:'scrub', defaultValue:1, label:say('speed'), icon:'gauge', min:0.25, max:4, step:0.25, value:speed, suffix:'×', run:async value => { speed = Math.max(0.25, Math.min(4, Number(value) || 1)); if (fallback) await fallback.setRate(speed); else audio.playbackRate = speed; sync(true); } },
    ]);
  }
  function applyVolume() { audio.volume = volume; audio.muted = muted; fallback?.setVolume(volume, muted); sync(true); }
  async function loadWaveform() {
    if (disposed || !shown || !readyToPlay || waveBusy || waveDone) return;
    waveBusy = true;
    waveStarted ||= performance.now();
    try {
      const data = await call('waveform-read', {});
      if (disposed) return;
      if (data.done && !duration()) knownDuration = data.decodedDuration;
      await waveform.update(data, duration() || data.duration);
      waveDone = data.done === true;
      const total = duration() || data.duration || data.decodedDuration;
      waveNote.textContent = waveDone || performance.now() - waveStarted < 400 ? '' : say('waveLoading', { percent:Math.min(99, Math.round(data.decodedDuration / (total || 1) * 100)) });
      if (!waveDone && shown) waveTimer = setTimeout(() => void loadWaveform(), 16);
    } catch {
      waveDone = true; waveNote.textContent = say('waveUnavailable');
    } finally { waveBusy = false; }
  }
  async function play() {
    if (!readyToPlay || !shown || disposed) return;
    try { if (fallback) await fallback.play(); else await audio.play(); message.textContent = ''; errorText = ''; }
    catch (error) { if (error.name === 'AbortError' || !shown || disposed) return; if (error.name === 'NotAllowedError') message.textContent = say('blocked'); else showError(error); }
    sync(true);
  }
  async function pause() { audio.pause(); if (fallback) await fallback.pause(); sync(true); }
  async function toggle() { if (paused()) await play(); else await pause(); }
  async function seek(time) {
    if (!readyToPlay || !Number.isFinite(time)) return;
    const to = Math.max(0, Math.min(time, duration() || position()));
    try { if (fallback) await fallback.seek(to); else audio.currentTime = to; sync(); } catch (error) { showError(error); }
  }
  async function compatible(originalError) {
    if (switching || disposed || fallback) return;
    switching = true; readyToPlay = false; const from = position(), resume = !paused();
    audio.pause(); audio.removeAttribute('src'); audio.load(); message.textContent = say('compatibility');
    try {
      fallback = new ChunkPlayer(value => callRead(value), () => new AudioContext(), (ended, error) => {
        if (error) showError(error);
        else if (ended && loop && shown) void fallback.seek(0, true).catch(showError);
        sync();
      });
      await fallback.initialize();
      if (disposed) { fallback.dispose(); return; }
      if (from > 0) await fallback.seek(from, false);
      fallback.setVolume(volume, muted); await fallback.setRate(speed);
      readyToPlay = true; message.textContent = ''; switching = false;
      await presented(); sync(true); void loadWaveform();
      if (shown && (resume || configuration().autoplay !== false)) await play();
    } catch (error) {
      switching = false; showError(error); fallback?.dispose();
      await presented(`${String(originalError || '')} ${errorText}`.trim());
    }
  }
  async function callRead(value) {
    const chunk = await call('audio-read', value);
    if (chunk.sampleRate) codecDetails = `${(chunk.sampleRate / 1000).toFixed(1)} kHz · ${chunk.channels} ch`;
    return chunk;
  }
  playButton.addEventListener('click', () => void toggle());
  document.querySelector('#back').addEventListener('click', () => void seek(position() - 5));
  document.querySelector('#forward').addEventListener('click', () => void seek(position() + 5));
  timeline.addEventListener('input', () => { dragging = true; sync(); });
  timeline.addEventListener('change', () => { dragging = false; void seek(Number(timeline.value)); });
  const seekPreview = document.querySelector('#seek-preview');
  timeline.addEventListener('pointermove', event => {
    if (timeline.disabled) return;
    const bounds = timeline.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    seekPreview.textContent = clock(fraction * duration());
    seekPreview.style.left = `${Math.max(24, Math.min(bounds.width - 24, fraction * bounds.width))}px`;
    seekPreview.dataset.visible = 'true';
  });
  timeline.addEventListener('pointerleave', () => { seekPreview.dataset.visible = 'false'; });
  timeline.addEventListener('blur', () => { seekPreview.dataset.visible = 'false'; });
  onSettings(() => { loop = configuration().loop === true; audio.loop = loop; const incoming = Number(configuration().volume) || 0.8; if (volumeDraft.receive(incoming)) volume = incoming; applyVolume(); });
  onLocale(() => sync(true));
  onVisibility(visible => { shown = visible; if (!visible) { clearTimeout(waveTimer); void pause(); } else void loadWaveform(); });
  await shortcuts([
    { id:'toggle', key:'k', run:toggle },
    { id:'back', key:'ArrowLeft', repeat:true, run:() => seek(position() - 5) },
    { id:'forward', key:'ArrowRight', repeat:true, run:() => seek(position() + 5) },
    { id:'begin', key:'Home', run:() => seek(0) },
  ]);
  audio.loop = loop; audio.volume = volume; audio.playbackRate = speed;
  message.textContent = say('loading'); sync(true);
  let loadTimer = setTimeout(() => void compatible('Media load timeout'), 12000);
  audio.addEventListener('canplay', async () => {
    if (fallback || switching || disposed) return;
    clearTimeout(loadTimer); readyToPlay = true; message.textContent = ''; errorText = '';
    await presented(); sync(true); void loadWaveform(); if (shown && configuration().autoplay !== false) await play();
  }, { once:true });
  audio.addEventListener('error', () => { clearTimeout(loadTimer); if (!fallback && !switching) void compatible(audio.error?.message || 'Unsupported system audio codec'); });
  for (const event of ['play','pause','timeupdate','durationchange','ended']) audio.addEventListener(event, () => sync());
  audio.src = streamUrl(); audio.load();
  const tick = setInterval(() => { if (shown && fallback && !fallback.paused) sync(); }, 250);
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(loadTimer); clearTimeout(volumeTimer); clearInterval(tick); audio.pause(); audio.removeAttribute('src'); audio.load(); clearTimeout(waveTimer); waveform.dispose(); fallback?.dispose(); }, { once:true });
}
