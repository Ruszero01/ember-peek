import {
  ready,
  call,
  controls,
  status,
  streamUrl,
  presented,
  configuration,
  onSettings,
  setSetting,
  onVisibility,
  onMessage,
  postTo,
  panel,
  mutate,
  createIcon,
  confirmDialog,
  translate,
  onLocale,
} from "./sdk.js";

const initial = await ready;
const say = translate({
  "zh-CN": {
    openControls: "播放控制",
    play: "播放",
    pause: "暂停",
    mute: "静音",
    unmute: "取消静音",
    volume: "音量",
    loop: "循环播放",
    progress: "播放进度",
    exportFrame: "导出当前帧",
    loading: "正在读取视频…",
    converting: "原始编码不受系统播放器支持，正在生成兼容播放代理…",
    failed: "视频无法播放：{error}",
    exported: "当前帧已导出：{name}",
    exporting: "正在导出当前帧…",
    confirmTitle: "导出当前帧？",
    confirmMessage: "将把 PNG 截图保存到源视频所在目录。",
    confirmAction: "导出 PNG",
    cancel: "取消",
    paused: "已暂停",
    playing: "正在播放",
  },
  en: {
    openControls: "Playback controls",
    play: "Play",
    pause: "Pause",
    mute: "Mute",
    unmute: "Unmute",
    volume: "Volume",
    loop: "Loop",
    progress: "Playback position",
    exportFrame: "Export current frame",
    loading: "Reading video…",
    converting: "The original codec is unsupported; creating a compatible playback proxy…",
    failed: "The video could not be played: {error}",
    exported: "Current frame exported: {name}",
    exporting: "Exporting current frame…",
    confirmTitle: "Export the current frame?",
    confirmMessage: "A PNG screenshot will be saved beside the source video.",
    confirmAction: "Export PNG",
    cancel: "Cancel",
    paused: "Paused",
    playing: "Playing",
  },
});

const clock = (value) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
};

async function icon(button, name, label) {
  if (button.dataset.icon !== name) {
    button.replaceChildren(await createIcon(name, 17));
    button.dataset.icon = name;
  }
  button.title = label;
  button.setAttribute("aria-label", label);
}

if (initial.role === "panel") {
  document.querySelector("#transport").hidden = false;
  const play = document.querySelector("#play");
  const timeline = document.querySelector("#timeline");
  const current = document.querySelector("#current");
  const duration = document.querySelector("#duration");
  let state = { paused: true, muted: false, volume: 1, currentTime: 0, duration: 0 };
  let dragging = false;

  async function paint() {
    current.textContent = clock(dragging ? Number(timeline.value) : state.currentTime);
    duration.textContent = clock(state.duration);
    if (!dragging) {
      timeline.max = String(Math.max(0.001, state.duration || 1));
      timeline.value = String(Math.min(state.currentTime || 0, Number(timeline.max)));
    }
    await icon(play, state.paused ? "play" : "pause", state.paused ? say("play") : say("pause"));
    timeline.setAttribute("aria-label", say("progress"));
  }
  onMessage((message) => {
    if (message?.type === "state") {
      state = { ...state, ...message.state };
      void paint();
    }
  });
  play.addEventListener("click", () => postTo("view", { type: "toggle" }));
  timeline.addEventListener("pointerdown", () => { dragging = true; });
  timeline.addEventListener("input", () => {
    current.textContent = clock(Number(timeline.value));
    postTo("view", { type: "seek", value: Number(timeline.value) });
  });
  const finish = () => { dragging = false; };
  timeline.addEventListener("pointerup", finish);
  timeline.addEventListener("pointercancel", finish);
  timeline.addEventListener("change", finish);
  onLocale(() => void paint());
  await paint();
  await postTo("view", { type: "panelReady" });
} else {
  document.querySelector("#viewer").hidden = false;
  const video = document.querySelector("video");
  const message = document.querySelector("#message");
  let sourceUrl;
  let shown = true;
  let presentedOnce = false;
  let attemptedProxy = false;
  let note = "";
  let panelOpen = false;
  // The declared settings come first: the toolbar button reflects them, not the other way round.
  video.loop = configuration().loop === true;
  // The volume is declared `hidden`: the host stores it and never draws a control, so the level
  // the user left behind comes back on the next file without becoming a setting to read.
  const rememberedVolume = Number(configuration().volume);
  video.volume = Number.isFinite(rememberedVolume) ? Math.max(0.01, Math.min(1, rememberedVolume)) : 1;
  // What storage already holds. Applying the level above fires `volumechange` as well, and that
  // is not the user changing anything — without this a write would land on every file opened.
  let storedVolume = video.volume;
  let volumeSave;

  function publishControls() {
    controls([
      {
        id: "transport",
        kind: "toggle",
        label: say("openControls"),
        icon: "sliders-horizontal",
        active: panelOpen,
        run: () => {
          panelOpen = !panelOpen;
          publishControls();
          void panel(panelOpen);
        },
      },
      {
        id: "mute",
        kind: "toggle",
        label: video.muted || video.volume === 0 ? say("unmute") : say("mute"),
        icon: video.muted || video.volume === 0 ? "volume-x" : "volume-2",
        active: video.muted || video.volume === 0,
        run: () => { video.muted = !video.muted; },
      },
      {
        id: "volume",
        kind: "scrub",
        label: say("volume"),
        icon: "volume-2",
        value: Math.max(1, Math.round(video.volume * 100)),
        min: 1,
        max: 100,
        suffix: "%",
        run: (value) => {
          video.volume = Math.max(0.01, Math.min(1, Number(value) / 100));
          video.muted = false;
        },
      },
      {
        // The button and the declared setting are one state: pressing it writes the setting,
        // so the choice survives this file and every later open.
        id: "loop",
        kind: "toggle",
        label: say("loop"),
        icon: "repeat",
        active: video.loop,
        run: () => { video.loop = !video.loop; publishControls(); void setSetting("loop", video.loop); },
      },
      {
        id: "export-frame",
        kind: "button",
        label: say("exportFrame"),
        icon: "image-down",
        run: () => void exportFrame(),
      },
    ]);
  }
  publishControls();
  onLocale(() => publishControls());

  const state = () => ({
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    currentTime: video.currentTime || 0,
    duration: Number.isFinite(video.duration) ? video.duration : (initial.data.duration || 0),
  });
  function sync(nextNote = note) {
    note = nextNote;
    void postTo("panel", { type: "state", state: state(), note });
    const facts = [
      video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : "",
      initial.data.videoCodec || "",
      `${clock(video.currentTime)} / ${clock(state().duration)}`,
    ].filter(Boolean);
    status(facts.join(" · "));
  }
  async function proxyBlob(force) {
    message.textContent = say("converting");
    sync(say("converting"));
    const proxy = await call("preparePlayback", { force });
    const chunks = [];
    for (let offset = 0; offset < proxy.size; offset += 512 * 1024) {
      const encoded = await call("readPlayback", {
        offset,
        length: Math.min(512 * 1024, proxy.size - offset),
      });
      chunks.push(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
    }
    return new Blob(chunks, { type: "video/mp4" });
  }
  async function attach(source, objectUrl = false) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = objectUrl ? URL.createObjectURL(source) : undefined;
    video.src = sourceUrl || source;
    video.load();
    await new Promise((resolve, reject) => {
      const loaded = () => { clean(); resolve(); };
      const failed = () => { clean(); reject(new Error(video.error?.message || `media error ${video.error?.code || "unknown"}`)); };
      const clean = () => {
        video.removeEventListener("loadedmetadata", loaded);
        video.removeEventListener("error", failed);
      };
      video.addEventListener("loadedmetadata", loaded, { once: true });
      video.addEventListener("error", failed, { once: true });
    });
  }
  async function load() {
    message.textContent = say("loading");
    try {
      if (initial.data.needsProxy && initial.data.ffmpegAvailable) {
        attemptedProxy = true;
        await attach(await proxyBlob(false), true);
      } else {
        await attach(streamUrl());
      }
    } catch (originalError) {
      if (attemptedProxy || !initial.data.ffmpegAvailable) throw originalError;
      attemptedProxy = true;
      await attach(await proxyBlob(true), true);
    }
    message.textContent = "";
    sync("");
    if (configuration().autoplay !== false) {
      try { await video.play(); } catch { sync(say("paused")); }
    }
    if (!presentedOnce) {
      presentedOnce = true;
      await presented();
    }
  }
  async function exportFrame() {
    try {
      const time = video.currentTime || 0;
      const planned = await call("plannedFrame", { time });
      const choice = await confirmDialog({
        title: say("confirmTitle"),
        message: say("confirmMessage"),
        detail: planned.fileName,
        cancelLabel: say("cancel"),
        actions: [{ id: "export", label: say("confirmAction"), primary: true }],
      });
      if (choice !== "export") return;
      sync(say("exporting"));
      let result;
      try {
        result = await mutate("exportFrame", { time });
      } catch (error) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob || blob.size > 5 * 1024 * 1024) throw error;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 32768)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        result = await mutate("saveFrame", { data: btoa(binary), time });
      }
      sync(say("exported", { name: result.fileName }));
    } catch (error) {
      sync(String(error));
    }
  }
  onMessage((command) => {
    if (command?.type === "toggle") video.paused ? void video.play() : video.pause();
    else if (command?.type === "seek" && Number.isFinite(command.value)) {
      video.currentTime = Math.max(0, Math.min(state().duration || 0, command.value));
    } else if (command?.type === "panelReady") sync();
  });
  for (const event of ["play", "pause", "volumechange", "durationchange", "timeupdate", "ended"])
    video.addEventListener(event, () => {
      sync(event === "play" ? say("playing") : event === "pause" ? say("paused") : note);
      if (event === "volumechange") {
        publishControls();
        if (video.volume === storedVolume) return;
        storedVolume = video.volume;
        // Remember the level without making it a setting: a drag reports every pixel, so the
        // write waits for the hand to stop instead of hitting storage on each one.
        clearTimeout(volumeSave);
        volumeSave = setTimeout(() => void setSetting("volume", video.volume), 400);
      }
    });
  video.addEventListener("click", () => video.paused ? void video.play() : video.pause());
  onSettings(() => {
    // Either route reaches here — the toolbar button or the settings window — so the video and
    // the toggle both follow the stored value instead of each holding its own copy.
    video.loop = configuration().loop === true;
    publishControls();
    sync();
  });
  onVisibility((visible) => {
    shown = visible;
    if (!shown && !video.paused) video.pause();
  });
  addEventListener("beforeunload", () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); });
  try {
    await load();
  } catch (error) {
    const text = say("failed", { error: error.message || error });
    message.textContent = text;
    status(text);
    if (!presentedOnce) await presented(text);
  }
}
