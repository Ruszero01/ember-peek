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
  prepare,
  hostWindow,
} from "./sdk.js";
import { fitGeometry, sameShape } from "./framing.js";

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
// Whether the user has zoomed, panned or resized this session. Kept apart from `fitting`
// because clicking "fit the window" is an interaction that still wants resize to re-fit.
let touched = false;
/** The picture's own size in pixels, from the header the native half read while opening the
 *  file. Absent for a drawing with no intrinsic size, which is a picture this plugin shows in
 *  the window it was given. */
const pixels = data?.dimensions;
/** Whether the window is meant to be the picture. The preference is the plugin's whole
 *  interaction — no control on the toolbar, because opening the image is when it applies. */
let framing = configuration().frameWindow === true;
/** What the host draws inside the preview window that is not this view: the two chrome bars in
 *  the normal viewport, nothing at all in immersive mode. Measured rather than assumed: the
 *  view knows its own rectangle, and the host told it the window it sits in. */
const chrome = {
  width: Math.max(0, hostWindow().currentWidth - innerWidth),
  height: Math.max(0, hostWindow().currentHeight - innerHeight),
};
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
      icon: "maximize-2",
      run() {
        touched = true;
        fit();
      },
    },
    {
      id: "actual",
      kind: "button",
      label: say("actual"),
      icon: "scan",
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
/** Whether the rectangle this view was given is the picture's own shape, which is the one case
 *  where the picture reaches every edge. Measured from the viewport rather than remembered from
 *  the preparation: a window is the user's to resize, and the moment it is not the picture's
 *  shape any more the picture is fitted inside it instead of being stretched across it. */
function framed() {
  if (!framing || !image.naturalWidth || !image.naturalHeight) return false;
  // Compare the dimension rounded by the preparation. On a tall image, a half-pixel rounding
  // of its narrow width can mean several pixels along its height; testing the height instead
  // incorrectly turns an exactly framed portrait back into a padded "fit" view.
  return sameShape(
    { width: innerWidth, height: innerHeight },
    { width: image.naturalWidth, height: image.naturalHeight },
  );
}
function paint() {
  publishControls();
  image.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
  status(
    `${image.naturalWidth} × ${image.naturalHeight} · ${Math.round(zoom * 100)}%`,
  );
}
/** Fill the rectangle the host gave this view: the picture is scaled to it, so it reaches every
 * edge and the window ends up being the picture. The larger of the two ratios wins because the
 * host's size is whole pixels — covering the fraction it can be off by is what makes the edge
 * disappear, and the sliver cropped by it is not visible. */
function fill(width = innerWidth, height = innerHeight) {
  fitting = false;
  zoom = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  x = 0;
  y = 0;
  paint();
}
/** What this plugin states during its preparation: the window size that shows the picture at
 *  the size the user's own window has. The picture's longest edge is matched to the room there
 *  is and the other edge follows, so a tall picture is not turned into a window taller than the
 *  screen and a picture is never asked for at its own pixel size. The chrome the host draws in
 *  the window is added back, because what was fitted is this view's rectangle, not the window.
 *
 *  The host applies it while the window is still hidden and then shows it, so the picture is
 *  already filling the window the first time the user sees it. */
function preparedWindow() {
  const room = {
    width: Math.max(1, hostWindow().width - chrome.width),
    height: Math.max(1, hostWindow().height - chrome.height),
  };
  const viewport =
    pixels.width >= pixels.height
      ? {
          width: room.width,
          height: (room.width * pixels.height) / pixels.width,
        }
      : {
          width: (room.height * pixels.width) / pixels.height,
          height: room.height,
        };
  return {
    width: Math.round(viewport.width + chrome.width),
    height: Math.round(viewport.height + chrome.height),
  };
}
function fit() {
  const css = getComputedStyle(document.documentElement);
  const top = parseFloat(css.getPropertyValue("--safe-top")) || 0;
  const bottom = parseFloat(css.getPropertyValue("--safe-bottom")) || 0;
  const mode = css.getPropertyValue("--viewport-mode").trim();
  const windowViewport = mode === "window" ||
    (mode === "" && chrome.width === 0 && chrome.height === 0);
  const fitted = fitGeometry(
    { width: innerWidth, height: innerHeight },
    { width: image.naturalWidth, height: image.naturalHeight },
    { top, bottom },
    windowViewport,
  );
  zoom = fitted.zoom;
  x = 0;
  y = fitted.y;
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
  // The host is holding the window back until this view prepares or reports ready, so the size
  // is stated before anything is decoded: the header the native half read is enough to know it,
  // and the picture itself is loaded afterwards without the user watching a window change size.
  // The preference is a setting rather than a control of the plugin's own: opening an image is
  // the whole interaction, and turning it off happens in the settings page.
  if (framing && pixels) {
    try {
      await prepare({ window: preparedWindow() });
    } catch (error) {
      // A host that does not understand a preparation is a host that shows the window itself,
      // and the picture is then fitted inside the window it was given.
      status(String(error?.message ?? error));
    }
  } else {
    // The setting is off, or this drawing has no intrinsic dimensions. Release the host's
    // preparation hold immediately instead of making it wait for the full image decode.
    await prepare();
  }
  image.src = fileUrl();
  await image.decode();
  message.remove();
  applyDefaultView();
  if (framed()) fill();
  onTheme(() => {
    if (fitting) fit();
  });
  onSettings(() => {
    // A setting reaches the window in use only as far as the view's own rendering goes: the
    // host sizes a window when it opens it, and this one is already open, so turning the
    // preference on here re-renders the picture rather than resizing what the user is looking
    // at. The next image opens to the new preference.
    framing = configuration().frameWindow === true;
    if (touched) return;
    if (framing && framed()) return fill();
    applyDefaultView();
  });
  onLocale(() => {
    // The toolbar labels are this plugin's own text: republish them even when the zoom
    // they are published with has not moved.
    publishedZoom = undefined;
    publishControls();
  });
  addEventListener("resize", () => {
    // The host applies the prepared size before it shows the window, so a resize the view sees
    // is either the user's own or that one being applied. Both are answered the same way: the
    // picture fills the rectangle if it is the picture's shape, and is fitted into it if not.
    if (!touched && framed()) {
      fill();
      return;
    }
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
