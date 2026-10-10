import {
  ready,
  shortcuts,
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
  translate,
  onLocale,
  prepare,
  hostWindow,
} from "./sdk.js";
import { videoFillsViewport, windowForVideo } from "./framing.js";
import { dragAxis, seekFromDrag, stepTime, volumeFromDrag } from "./gestures.js";
import {
  PREFETCH,
  SEGMENT_SECONDS,
  bufferedWindow,
  nextToBuild,
  segmentCount,
  segmentOf,
  segmentRequest,
} from "./segments.js";
import { RING_WAITING, ringFill, timelineSeek } from "./seek.js";

/** How many bytes of a piece one read call carries: the plugin's native side reads at most this
 *  much at a time. */
const READ_CHUNK = 512 * 1024;
/** How often a running encode is asked how far along it is. */
const POLL_MS = 400;

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
    converting: "原始编码不受系统播放器支持，正在生成兼容播放代理：{percent}%",
    convertingPiece: "原始编码不受系统播放器支持，正在转码第 {index}/{count} 段：{percent}%",
    seeking: "正在跳转到这一段",
    lostProxy: "这一段的播放代理没有生成完成，请重试",
    failed: "视频无法播放：{error}",
    exported: "当前帧已导出：{path}",
    exporting: "正在导出当前帧…",
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
    converting: "The original codec is unsupported; building a playback proxy: {percent}%",
    convertingPiece: "The original codec is unsupported; transcoding piece {index} of {count}: {percent}%",
    seeking: "Seeking to this position",
    lostProxy: "The playback proxy for this piece was not finished; try again",
    failed: "The video could not be played: {error}",
    exported: "Current frame exported: {path}",
    exporting: "Exporting current frame…",
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
  /** Whether this interaction has already asked the picture for a time; see `timelineSeek()`. */
  let asked = false;
  /** One timeline event. The value the hand lands on is already the destination -- the slider
   *  jumps to the spot under it -- so it is asked for at once, and waiting for the hand to stop is
   *  only for the values a drag passes over on the way. The end of the interaction asks for where
   *  it stopped. */
  function track(event) {
    const outcome = timelineSeek(asked, event, Number(timeline.value));
    asked = outcome.asked;
    if (!outcome.seek) return;
    current.textContent = clock(outcome.seek.value);
    postTo("view", { type: "seek", value: outcome.seek.value, commit: outcome.seek.commit });
  }
  timeline.addEventListener("pointerdown", () => {
    dragging = true;
    track("press");
  });
  timeline.addEventListener("input", () => track("input"));
  // The hand coming off the slider is the end of the drag, and so is `change` -- which the browser
  // fires for every arrow key as well, and which is the only end a keyboard ever reports.
  const finish = () => {
    dragging = false;
    track("end");
  };
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
  const hud = document.querySelector("#hud");
  const ring = document.querySelector("#loading");
  const arc = document.querySelector("#loading-arc");
  let shown = initial.visible !== false;
  let presentedOnce = false;
  let note = "";
  let panelOpen = false;
  let messageTimer;
  let hudTimer;
  /** What the probe said the file is: the whole file's length, and -- for a file the browser
   *  cannot decode -- the shape a proxy is scaled to. */
  const probedDuration = Number(initial.data.duration) || 0;
  /** How many pieces a proxied file is cut into, and the piece the element is showing. A piece
   *  carries a timeline of its own that begins at zero, so the file's own time is `pieceStart`
   *  plus the element's; a file the browser can play is one piece that is the whole file. */
  let pieceCount = 1;
  let segmented = false;
  let attachedIndex = -1;
  let pieceStart = 0;
  /** The piece the user is looking at: the one worth keeping, and the one worth predicting from.
   *  It moves as soon as a seek is asked for, before that piece exists. */
  let viewIndex = 0;
  /** The time the user has asked for that the element has not reached yet; see `position()`. */
  let pendingTime;
  /** Pieces already here (`index` to `{url}`), and the pieces waiting for the one encode lane. */
  const pieces = new Map();
  /** The pieces waiting for that lane, oldest first: `{ index, ahead, promise, resolve, reject }`.
   *  `ahead` marks one that is only being made for where the playhead is going. */
  const waiting = [];
  /** Whether the lane is building one of them right now. */
  let laneBusy = false;
  /** Whether a proxy must be encoded even though its video could be copied as it is. */
  let proxyForce = false;
  /** The line this document is showing while it is not ready yet; see `noteProgress()`. */
  let progressText = "";
  /** The working line that is actually on screen, and the piece it is about: they are what
   *  `endProgress()` may take back, and neither is the latest progress on its own -- another
   *  piece's encode moves that on without touching this line. */
  let shownProgress = "";
  let shownPiece = null;
  /** The piece the picture is being held for, and whether it should be running once that piece is
   *  here. Only this piece's progress may fill the ring, and only this wait may stop the picture:
   *  a look-ahead piece's encode is not something the user asked for or can act on. */
  let waitPiece = null;
  let waitPlay = false;
  /** The loop setting, kept beside the element: a piece switch needs this document to decide
   *  where the file continues, so the element's own `loop` cannot be the only copy. */
  let loop = configuration().loop === true;
  /** Say something the user has to see, in the view overlay that belongs to this plugin.
   *  The panel keeps only a timeline row, so a result reported through `note` would have no
   *  reader; a result that names a written file is worth a line on screen either way. The line
   *  leaves on its own, which is what separates it from the one `noteProgress()` writes. */
  function announce(text) {
    clearTimeout(messageTimer);
    progressText = "";
    shownProgress = "";
    shownPiece = null;
    message.textContent = text;
    messageTimer = setTimeout(() => {
      if (message.textContent === text) message.textContent = "";
    }, 8000);
  }
  /** The line the user reads while this document is not ready yet. It does not expire: work that
   *  takes seconds has to keep saying what it is doing, and `endProgress()` takes it back when it
   *  is over. The text is kept so that a line which has since replaced it survives. */
  function noteProgress(text, piece = null) {
    clearTimeout(messageTimer);
    progressText = text;
    shownProgress = text;
    shownPiece = piece;
    message.textContent = text;
  }
  /** Takes the working line back: the piece that wrote it, when it names one, and otherwise
   *  whatever working line is on screen. A result that replaced the line in the meantime is not
   *  this function's to clear, and neither is a line another piece has since written. */
  function endProgress(piece) {
    if (piece !== undefined && shownPiece !== piece) return;
    const text = shownProgress;
    progressText = "";
    shownProgress = "";
    shownPiece = null;
    if (!text) return;
    if (message.textContent === text) message.textContent = "";
    sync("");
  }
  /** Which piece is being made and how far along it is. The host's own information area gets this
   *  either way, numbers and all, whether the piece was asked for or is only being made ahead of
   *  the playhead. The picture itself only shows it for the piece the user is waiting for, as the
   *  ring that took the place of the old line. */
  function showProgress(index, ratio) {
    const percent = Math.round((ringFill(ratio) ?? 0) * 100);
    progressText = pieceCount > 1
      ? say("convertingPiece", { index: index + 1, count: pieceCount, percent })
      : say("converting", { percent });
    if (index === waitPiece) drawRing(ratio);
    else if (index === viewIndex) noteProgress(progressText, index);
    sync(progressText);
  }
  /** How full the ring is drawn. A ratio nobody has reported yet is the turning quarter rather
   *  than an empty ring: this piece is waiting its turn behind the one encode lane, and a ring
   *  that has not moved for ten seconds reads as a hang. The value is dropped while it is unknown,
   *  so that neither the arc nor the accessibility tree can report the last number as this one. */
  function drawRing(ratio) {
    const known = ringFill(ratio);
    ring.dataset.state = known === null ? "waiting" : "building";
    arc.style.strokeDashoffset = String(1 - (known ?? RING_WAITING));
    if (known === null) ring.removeAttribute("aria-valuenow");
    else ring.setAttribute("aria-valuenow", String(Math.round(known * 100)));
  }
  /** Holds the picture where it is for a seek that has to wait for its piece, and puts the ring up
   *  in its place. A seek whose piece is already here never gets this far: freezing the picture
   *  for a wait that lasts a frame reads as a stutter, not as a seek. */
  function beginWait(index, play) {
    waitPiece = index;
    waitPlay = play;
    // The ring is the wait from here on, so the line that would otherwise say the same thing
    // beside it goes away -- one readout per wait, and it is the one on the picture.
    endProgress();
    if (!video.paused) video.pause();
    ring.hidden = false;
    drawRing(null);
  }
  /** The wait is over: the picture is where the seek asked for. A wait that a newer seek has
   *  replaced is not this call's to end -- the newer one puts the ring down itself. */
  function endWait() {
    if (waitPiece === null) return;
    waitPiece = null;
    waitPlay = false;
    ring.hidden = true;
  }
  /** While a seek waits, the ring is the only thing in the middle of the picture; what it means
   *  has to be readable without seeing it. */
  function labelRing() {
    ring.setAttribute("aria-label", say("seeking"));
  }
  /** The readout a gesture writes while it changes something. The value is the point, so it is
   *  drawn large in the middle of the picture and leaves on its own; it never takes the pointer,
   *  which is still holding the drag that put it there. */
  function showHud(text) {
    clearTimeout(hudTimer);
    hud.textContent = text;
    hud.hidden = false;
  }
  /** Let the readout outlive the hand for a moment, so the value can still be read afterwards. */
  function clearHudSoon() {
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.hidden = true; }, 900);
  }
  // Framing is an opening preference. A later settings change applies to the next video.
  const frameOnOpen = configuration().frameWindow === true;
  let preparationSent = false;
  const windowBasis = hostWindow();
  const currentWindow = {
    width: windowBasis.currentWidth,
    height: windowBasis.currentHeight,
  };
  const connectedViewport = { width: innerWidth, height: innerHeight };
  const probedPixels = {
    width: Number(initial.data.width),
    height: Number(initial.data.height),
  };
  async function prepareOnce(pixels) {
    if (preparationSent) return;
    preparationSent = true;
    const window = frameOnOpen && windowForVideo(
      windowBasis, currentWindow, connectedViewport, pixels,
    );
    try {
      await prepare(window ? { window } : {});
    } catch (error) {
      status(String(error?.message ?? error));
    }
  }
  function fitVideo() {
    // Cover only a viewport that still has the video's shape. The host's screen and minimum
    // size limits, or a user resize, can change that shape; contain then preserves every frame.
    video.style.objectFit = frameOnOpen && videoFillsViewport(
      { width: innerWidth, height: innerHeight },
      { width: video.videoWidth, height: video.videoHeight },
    ) ? "cover" : "contain";
  }
  addEventListener("resize", fitVideo);
  video.addEventListener("resize", fitVideo);
  // The declared settings come first: the toolbar button reflects them, not the other way round.
  // A file that has to be cut into pieces is looped by this document instead, because crossing a
  // piece boundary is a switch the element cannot make on its own; `load()` settles that.
  video.loop = loop;
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
        active: loop,
        run: () => {
          loop = !loop;
          video.loop = loop && !segmented;
          publishControls();
          void setSetting("loop", loop);
        },
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
  labelRing();
  onLocale(() => {
    publishControls();
    labelRing();
  });

  const state = () => ({
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    currentTime: position(),
    duration: duration(),
  });
  function sync(nextNote = note) {
    note = nextNote;
    void postTo("panel", { type: "state", state: state(), note });
    // The picture is a proxy of the source when the codec needed one, so the source's own pixels
    // are what this line reports: the probe's answer when there is one, the element's otherwise.
    const pixels = probedPixels.width && probedPixels.height
      ? `${probedPixels.width} × ${probedPixels.height}`
      : video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : "";
    const facts = [
      pixels,
      initial.data.videoCodec || "",
      `${clock(position())} / ${clock(duration())}`,
    ].filter(Boolean);
    // A wait the plugin is in the middle of comes before the file's own facts: the resolution has
    // not changed, and the line the user is watching for has to be somewhere they can read it. It
    // is here rather than on the picture because the exact number belongs to the host's own area.
    status(progressText || facts.join(" · "));
  }
  /** How long the whole file is. A piece's own element duration covers only that piece, so the
   *  timeline, the clock and the arrow keys read the probe's answer whenever there is one. */
  function duration() {
    if (segmented) return probedDuration;
    const measured = video.duration;
    return Number.isFinite(measured) && measured > 0 ? measured : probedDuration;
  }
  /** Where the user is in the file: the piece's start plus the element's own time. A seek to
   *  another piece cannot move the element until that piece exists, and until then the answer is
   *  where the user is going rather than where they left. */
  function position() {
    const reached = pieceStart + (video.currentTime || 0);
    if (pendingTime === undefined) return reached;
    // The element reports its own time the moment it is really there, which is what ends the wait.
    if (Math.abs(reached - pendingTime) < 1) {
      pendingTime = undefined;
      return reached;
    }
    return pendingTime;
  }
  /** Moves the element inside the piece it is already showing. A time asked for by hand means the
   *  element is the truth again, so a destination still pending is dropped. */
  function positionAt(time) {
    pendingTime = undefined;
    video.currentTime = Math.max(0, time);
  }
  /** Keeps a time inside the file, for a duration that may not have arrived yet. */
  function clampTime(time) {
    const asked = Number.isFinite(time) ? Math.max(0, time) : 0;
    const end = duration();
    return end > 0 ? Math.min(end, asked) : asked;
  }
  /** Starts the picture, and says so when the browser refuses: a rejected `play()` is not a
   *  failure worth a stack trace, it is the reason nothing is moving. */
  async function start() {
    try {
      await video.play();
    } catch {
      sync(say("paused"));
    }
  }
  /** The bytes of one piece, encoding it first if this is the first time it was asked for. Only
   *  one encode runs at a time: each one holds a decoder's own frame buffers, and a file the
   *  browser cannot play is exactly the file that is expensive to transcode. Asking twice for the
   *  same piece joins the work already queued for it, and a piece being made ahead of the
   *  playhead stops being one the moment the user asks for it. */
  function obtain(index, ahead = false) {
    const here = pieces.get(index);
    if (here) return Promise.resolve(here);
    const queued = waiting.find((entry) => entry.index === index);
    if (queued) {
      if (!ahead) queued.ahead = false;
      return queued.promise;
    }
    const entry = { index, ahead };
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    waiting.push(entry);
    void runLane();
    return entry.promise;
  }
  /** Builds the waiting pieces in the order `nextToBuild` picks: one encode at a time, the piece
   *  the user is waiting for before the ones being made ahead of them, and none of the look-ahead
   *  pieces the picture has moved away from. A piece that fails settles its own promise and the
   *  lane keeps going, or nothing asked for after it would ever start. */
  async function runLane() {
    if (laneBusy) return;
    laneBusy = true;
    try {
      for (;;) {
        const { next, dropping } = nextToBuild(waiting, viewIndex, pieceCount);
        for (const entry of dropping) {
          waiting.splice(waiting.indexOf(entry), 1);
          entry.reject(new Error("look-ahead piece dropped"));
        }
        if (!next) return;
        waiting.splice(waiting.indexOf(next), 1);
        try {
          const piece = await buildPiece(next.index);
          pieces.set(next.index, piece);
          // A piece that arrived after the user moved on goes again: the window around the picture
          // is the only part of a long file worth holding on to.
          if (!bufferedWindow(viewIndex, pieceCount).includes(next.index)) forget(next.index);
          next.resolve(piece);
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      laneBusy = false;
    }
  }
  /** Asks the native side for one piece and waits for it to be written. The call only starts the
   *  encode -- one long enough to outlive a blocking call -- so the wait is a poll, and every poll
   *  says which piece is being made and how far along it is, because a file that needs this is a
   *  file that would otherwise sit there looking stuck. */
  async function buildPiece(index) {
    const request = segmentRequest(index, probedDuration);
    await call("preparePlayback", {
      force: proxyForce,
      index,
      from: request.from,
      seconds: request.seconds,
    });
    for (;;) {
      const report = await call("playbackStatus", { index });
      if (report.state === "done") {
        endProgress(index);
        return { url: await readPiece(index, report.size) };
      }
      if (report.state === "failed") throw new Error(report.error);
      if (report.state === "none") throw new Error(say("lostProxy"));
      showProgress(index, report.ratio);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
  /** One piece's bytes as the element can use them. The native side reads a bounded chunk per
   *  call, and the piece becomes one `Blob` once it is all here. */
  async function readPiece(index, size) {
    const chunks = [];
    for (let offset = 0; offset < size; offset += READ_CHUNK) {
      const encoded = await call("readPlayback", {
        index,
        offset,
        length: Math.min(READ_CHUNK, size - offset),
      });
      chunks.push(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
    }
    return URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
  }
  /** Hands one source to the element and waits for its metadata. Every piece is a fresh load,
   *  which is why the picture is put back on its time right afterwards. */
  async function attachUrl(url) {
    video.src = url;
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
  /** Forgets a piece and lets its bytes go. The one on screen keeps what it is showing until
   *  something else takes its place, so its URL is left alone. */
  function forget(index) {
    const piece = pieces.get(index);
    if (!piece) return;
    pieces.delete(index);
    if (index === attachedIndex) attachedIndex = -1;
    else URL.revokeObjectURL(piece.url);
  }
  /** Keeps the window of pieces around the picture and drops the rest. */
  function keepAround(index) {
    const keep = new Set(bufferedWindow(index, pieceCount));
    for (const held of [...pieces.keys()]) if (!keep.has(held)) forget(held);
  }
  /** While the user watches one piece, the next few are worth making: the encode is the slow
   *  part, and it can happen behind a picture that is already playing. This is the "transcode
   *  while playing" half of the deal -- the first piece is the wait, the rest are not. */
  function prefetch() {
    if (!segmented) return;
    for (let index = viewIndex + 1; index <= viewIndex + PREFETCH; index += 1) {
      if (index >= pieceCount) return;
      if (pieces.has(index) || waiting.some((entry) => entry.index === index)) continue;
      // A piece nobody asked for must never break the one that is playing.
      void obtain(index, true).catch(() => {});
    }
  }
  /** Puts the picture on a piece, at a time inside it, and says when it is there. */
  async function showPiece(index, local, play) {
    const piece = await obtain(index);
    // A seek asked for after this one has moved the destination on: that request owns the
    // element now, and this piece is left where it is -- in the cache, where it was wanted.
    if (index !== viewIndex) return;
    if (attachedIndex !== index) {
      attachedIndex = index;
      pieceStart = index * SEGMENT_SECONDS;
      await attachUrl(piece.url);
    }
    // Set directly rather than through `positionAt()`: while a seek is in flight the reported
    // time is the destination, and it is `position()` that decides when the element has arrived.
    video.currentTime = Math.max(0, local);
    keepAround(index);
    endProgress();
    endWait();
    if (play) await start();
    prefetch();
  }
  /** Puts the picture at a time in the whole file, still playing if it already was: a piece
   *  switch reloads the element, which would otherwise stop a video the user is watching. */
  async function seekTo(time, play = false) {
    const absolute = clampTime(time);
    if (!segmented) {
      positionAt(absolute);
      if (play) await start();
      return;
    }
    const index = segmentOf(absolute, probedDuration);
    viewIndex = index;
    // Whether the picture is running once it is really at the new time, read before the wait below
    // stops it: a seek must not start a video the user had stopped, nor leave stopped one they had
    // been watching when an earlier seek in the same drag held it.
    const resume = play || waitPlay || !video.paused;
    if (index === attachedIndex) {
      endWait();
      positionAt(absolute - pieceStart);
      if (resume) await start();
      return;
    }
    pendingTime = absolute;
    // A piece that is not here yet is a wait, and the picture is what says so: holding it where it
    // is, instead of letting it carry on from the old position under a readout that already says
    // the new time, is the difference between a seek in flight and a seek that did nothing.
    if (pieces.has(index)) endWait();
    else beginWait(index, resume);
    // The timeline and the host's information line follow the request straight away; the picture
    // follows as soon as the piece holding it exists.
    sync();
    await showPiece(index, absolute - index * SEGMENT_SECONDS, resume);
  }
  /** Follows the hand while the timeline is being dragged. A target inside the piece on screen
   *  moves the picture; one that another piece holds cannot be shown yet, so the readout is the
   *  only thing that follows until the hand stops and the piece is asked for. */
  function previewSeek(time) {
    const absolute = clampTime(time);
    if (!segmented || segmentOf(absolute, probedDuration) === attachedIndex)
      positionAt(absolute - pieceStart);
    showHud(`${clock(absolute)} / ${clock(duration())}`);
  }
  /** A seek the user asked for. A piece that cannot be built is worth saying out loud, because
   *  waiting for it was the only sign that anything was happening. */
  function seek(time, play = false) {
    void seekTo(time, play).catch((error) => {
      endProgress();
      endWait();
      const text = say("failed", { error: error?.message || error });
      noteProgress(text);
      status(text);
    });
  }
  async function load() {
    noteProgress(say("loading"));
    if (initial.data.needsProxy && initial.data.ffmpegAvailable) {
      // A file the browser cannot decode is handed over as a proxy, and a long one is cut into
      // pieces so the first of them can be watched while the rest are still being written.
      pieceCount = segmentCount(probedDuration);
      segmented = pieceCount > 1;
      // Crossing a piece boundary is this document's job, so the element never loops a piece.
      video.loop = loop && !segmented;
      try {
        await showPiece(0, 0, false);
      } catch (originalError) {
        // A file whose video is already h264 is remuxed rather than re-encoded, and a remux that
        // fails is worth asking for as an encode before the user is told it is over.
        if (proxyForce) throw originalError;
        proxyForce = true;
        forget(0);
        await showPiece(0, 0, false);
      }
    } else {
      await attachUrl(streamUrl());
    }
    endProgress();
    await prepareOnce({ width: video.videoWidth, height: video.videoHeight });
    fitVideo();
    sync("");
    if (shown && configuration().autoplay !== false) await start();
    if (!presentedOnce) {
      presentedOnce = true;
      await presented();
    }
  }
  async function exportFrame() {
    try {
      // The frame is cut out of the source file, so the time is the file's own and not the
      // piece's: a proxy is only what the picture on screen is made of.
      const time = position();
      // One click writes the frame: the destination comes from this plugin settings, which
      // the host fills through its own folder picker, so nothing is asked at export time.
      const dir = String(configuration().exportDir || "");
      sync(say("exporting"));
      message.textContent = say("exporting");
      let result;
      try {
        result = await mutate("exportFrame", { time, dir });
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
        result = await mutate("saveFrame", { data: btoa(binary), time, dir });
      }
      announce(say("exported", { path: result.path }));
    } catch (error) {
      announce(String(error));
    }
  }
  onMessage((command) => {
    if (command?.type === "toggle") video.paused ? void video.play() : video.pause();
    else if (command?.type === "seek" && Number.isFinite(command.value)) {
      // A drag along the timeline reports as it goes and commits once at the end: only the
      // commit is worth transcoding a piece for.
      if (command.commit) seek(command.value);
      else previewSeek(command.value);
    } else if (command?.type === "panelReady") sync();
  });
  // A piece is not the file: the end of one is the end of the file only when nothing is left to
  // play, and where the file continues is something only this document knows.
  video.addEventListener("ended", () => {
    if (!segmented) return;
    if (attachedIndex + 1 < pieceCount) return seek((attachedIndex + 1) * SEGMENT_SECONDS, true);
    if (loop) seek(0, true);
  });
  for (const event of ["play", "pause", "volumechange", "durationchange", "timeupdate"])
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
  // Gestures on the picture: a horizontal drag moves along the timeline, a vertical drag sets the
  // volume, and a press that never moves is still the play/pause click it always was. The axis is
  // decided once, by the direction the hand actually took, so a crooked drag does not flip between
  // the two while it is in flight.
  let gesture;
  /** Ends the current gesture and hands it back, so the caller can tell a click from a drag. */
  function endGesture(pointer) {
    if (!gesture || (pointer !== undefined && gesture.pointer !== pointer)) return undefined;
    const ended = gesture;
    gesture = undefined;
    if (ended.axis) clearHudSoon();
    return ended;
  }
  video.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // Keys go to whoever holds focus, and the picture is what the user just aimed at: claiming
    // focus here is what makes the arrow keys work without a second, separate click.
    window.focus();
    gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      axis: "",
      startTime: position(),
      startVolume: video.volume,
    };
  });
  video.addEventListener("pointermove", (event) => {
    const drag = gesture;
    if (!drag || drag.pointer !== event.pointerId) return;
    // A release this document never saw must not leave the picture following the pointer.
    if (event.buttons === 0) { endGesture(event.pointerId); return; }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.axis) {
      drag.axis = dragAxis(dx, dy) || "";
      if (!drag.axis) return;
      // A release that arrives before this move is handled leaves nothing to capture; the
      // gesture still works, because the picture is the whole viewport it started in.
      try { video.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    }
    if (drag.axis === "seek") {
      previewSeek(seekFromDrag(
        drag.startTime, dx, video.clientWidth || innerWidth, duration(),
      ));
    } else {
      video.volume = volumeFromDrag(drag.startVolume, dy);
      showHud(`${say("volume")} ${Math.round(video.volume * 100)}%`);
    }
  });
  video.addEventListener("pointerup", (event) => {
    const ended = endGesture(event.pointerId);
    if (!ended) return;
    // A press that never moved is the click it always was; one that moved has done its work, and
    // the time it stopped on is asked for now that the hand is out of the way.
    if (ended.axis === "seek") {
      seek(seekFromDrag(
        ended.startTime, event.clientX - ended.x, video.clientWidth || innerWidth, duration(),
      ));
    } else if (!ended.axis && event.button === 0) {
      video.paused ? void video.play() : video.pause();
    }
  });
  video.addEventListener("pointercancel", (event) => endGesture(event.pointerId));
  video.addEventListener("lostpointercapture", () => endGesture());
  await shortcuts([-1, 1].map(direction => ({
    id: direction < 0 ? "seekBack" : "seekForward",
    key: direction < 0 ? "ArrowLeft" : "ArrowRight",
    repeat: true,
    run: () => {
      const to = stepTime(position(), direction, duration());
      seek(to);
      showHud(`${clock(to)} / ${clock(duration())}`);
      clearHudSoon();
    },
  })));
  onSettings(() => {
    // Either route reaches here — the toolbar button or the settings window — so the video and
    // the toggle both follow the stored value instead of each holding its own copy.
    loop = configuration().loop === true;
    video.loop = loop && !segmented;
    publishControls();
    sync();
  });
  onVisibility((visible) => {
    shown = visible;
    if (!shown && !video.paused) video.pause();
  });
  addEventListener("beforeunload", () => {
    for (const piece of pieces.values()) URL.revokeObjectURL(piece.url);
    pieces.clear();
  });
  try {
    // A native probe already ran for playback decisions, so use its dimensions before loading
    // frames. Without a probe, the existing media element supplies metadata; the host timeout
    // keeps the window from waiting forever for a damaged or slow video.
    if (!frameOnOpen || windowForVideo(
      windowBasis, currentWindow, connectedViewport, probedPixels,
    )) await prepareOnce(probedPixels);
    await load();
  } catch (error) {
    await prepareOnce({ width: 0, height: 0 });
    const text = say("failed", { error: error.message || error });
    noteProgress(text);
    status(text);
    if (!presentedOnce) await presented(text);
  }
}
