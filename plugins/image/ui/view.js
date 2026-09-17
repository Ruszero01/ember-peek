import {
  ready,
  controls,
  status,
  fileUrl,
  presented,
  configuration,
  onSettings,
  onTheme,
  translate,
  onLocale,
} from "./sdk.js";

const { data } = await ready;
const image = document.querySelector("img");
const message = document.querySelector("#message");

/** The plugin's own wording, in the language the host is showing. */
const say = translate({
  "zh-CN": {
    zoom: "缩放比例",
    fit: "适应窗口",
    actual: "原始尺寸",
    decoding: "正在解码图片…",
    failed: "图片加载失败：{error}",
  },
  en: {
    zoom: "Zoom",
    fit: "Fit the window",
    actual: "Actual size",
    decoding: "Decoding the image…",
    failed: "The image could not be loaded: {error}",
  },
});
// The page ships no wording of its own: what is on screen is decided here, in the
// language the host is showing.
message.textContent = say("decoding");
let zoom = 1,
  x = 0,
  y = 0,
  fitting = true,
  drag;
// Whether the user has zoomed or panned this session. Kept apart from `fitting`
// because clicking "fit the window" is an interaction that still wants resize to re-fit.
let touched = false;
let publishedZoom;
const EDGE_PEEK = 56;
const RUBBER_BAND = 0.22;
const MAX_OVERSCROLL = 32;

function viewportBounds() {
  const css = getComputedStyle(document.documentElement);
  const top = parseFloat(css.getPropertyValue("--safe-top")) || 0;
  const bottom = parseFloat(css.getPropertyValue("--safe-bottom")) || 0;
  return { left: 0, top, right: innerWidth, bottom: innerHeight - bottom };
}

// Translation is measured from the viewport centre. Keep a useful strip of the
// scaled image visible on every axis, even when the image itself is very large.
function panLimits() {
  const viewport = viewportBounds();
  // CSS Grid lays the untransformed image at the full viewport centre. The
  // safe insets only constrain where it may end up; they do not move its origin.
  const centerX = innerWidth / 2;
  const centerY = innerHeight / 2;
  const halfWidth = (image.naturalWidth * zoom) / 2;
  const halfHeight = (image.naturalHeight * zoom) / 2;
  const peekX = Math.min(EDGE_PEEK, halfWidth);
  const peekY = Math.min(EDGE_PEEK, halfHeight);
  return {
    minX: viewport.left + peekX - centerX - halfWidth,
    maxX: viewport.right - peekX - centerX + halfWidth,
    minY: viewport.top + peekY - centerY - halfHeight,
    maxY: viewport.bottom - peekY - centerY + halfHeight,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rubberBand(value, min, max) {
  if (value < min)
    return min - Math.min(MAX_OVERSCROLL, (min - value) * RUBBER_BAND);
  if (value > max)
    return max + Math.min(MAX_OVERSCROLL, (value - max) * RUBBER_BAND);
  return value;
}

function settlePan() {
  const limits = panLimits();
  const nextX = clamp(x, limits.minX, limits.maxX);
  const nextY = clamp(y, limits.minY, limits.maxY);
  if (nextX === x && nextY === y) return;
  x = nextX;
  y = nextY;
  image.classList.add("settling");
  paint();
}
function publishControls() {
  if (publishedZoom === zoom) return;
  publishedZoom = zoom;
  controls([
    {
      id: "zoom", kind: "scrub", label: say("zoom"),
      value: zoom * 100, min: Math.min(2, zoom * 100), max: 2000, suffix: "%",
      run: value => { if (typeof value === "number" && Number.isFinite(value)) scale(value / (zoom * 100)); },
    },
    {
      id: "fit",
      kind: "button",
      label: say("fit"),
      icon: "fit",
      run() {
        touched = true;
        fit();
      },
    },
    {
      id: "actual",
      kind: "button",
      label: say("actual"),
      icon: "actual",
      run() {
        touched = true;
        fitting = false;
        zoom = 1;
        x = y = 0;
        paint();
      },
    },
  ]);
}
function paint() {
  publishControls();
  image.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
  status(
    `${image.naturalWidth} × ${image.naturalHeight} · ${Math.round(zoom * 100)}%`,
  );
}
function fit() {
  const css = getComputedStyle(document.documentElement);
  const top = parseFloat(css.getPropertyValue("--safe-top")) || 0;
  const bottom = parseFloat(css.getPropertyValue("--safe-bottom")) || 0;
  zoom = Math.min(
    1,
    Math.max(1, innerWidth - 32) / image.naturalWidth,
    Math.max(1, innerHeight - top - bottom) / image.naturalHeight,
  );
  x = 0;
  y = (top - bottom) / 2;
  fitting = true;
  paint();
}
// The preference only chooses the untouched session's starting mode. Once the
// user zooms or pans, settings updates no longer overwrite that interaction.
function applyDefaultView() {
  if (configuration().fitWindow !== false) return fit();
  fitting = false;
  zoom = 1;
  x = y = 0;
  paint();
}
function scale(factor) {
  touched = true;
  fitting = false;
  zoom = Math.max(0.02, Math.min(20, zoom * factor));
  const limits = panLimits();
  x = clamp(x, limits.minX, limits.maxX);
  y = clamp(y, limits.minY, limits.maxY);
  paint();
}
try {
  image.src = fileUrl();
  await image.decode();
  message.remove();
  applyDefaultView();
  onTheme(() => {
    if (fitting) fit();
  });
  onSettings(() => {
    if (!touched) applyDefaultView();
  });
  onLocale(() => {
    // The toolbar labels are this plugin's own text: republish them even when the zoom
    // they are published with has not moved.
    publishedZoom = undefined;
    publishControls();
  });
  addEventListener("resize", () => {
    if (fitting) fit();
    else settlePan();
  });
  addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      scale(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    },
    { passive: false },
  );
  document.querySelector("main").addEventListener("pointerdown", (event) => {
    touched = true;
    image.classList.remove("settling");
    drag = {
      pointer: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x,
      y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  addEventListener("pointermove", (event) => {
    if (drag && drag.pointer === event.pointerId) {
      const limits = panLimits();
      x = rubberBand(
        drag.x + event.clientX - drag.clientX,
        limits.minX,
        limits.maxX,
      );
      y = rubberBand(
        drag.y + event.clientY - drag.clientY,
        limits.minY,
        limits.maxY,
      );
      paint();
    }
  });
  addEventListener("pointerup", (event) => {
    if (drag?.pointer !== event.pointerId) return;
    drag = undefined;
    settlePan();
  });
  addEventListener("pointercancel", (event) => {
    if (drag?.pointer !== event.pointerId) return;
    drag = undefined;
    settlePan();
  });
  image.addEventListener("transitionend", () => image.classList.remove("settling"));
  await presented();
} catch (error) {
  message.textContent = say("failed", { error: error.message });
  status(message.textContent);
  await presented(message.textContent);
}
