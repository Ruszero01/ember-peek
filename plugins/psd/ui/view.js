import { ready, call, controls, status, presented, prepare, hostWindow, translate, onLocale, onTheme } from "./sdk.js";
import { fitGeometry, constrainPan, elasticPan, reboundPosition } from "./geometry.js";
const { data } = await ready;
const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d", { alpha: true });
const say = translate({
  "zh-CN": { loading: "正在读取合成图像…", zoom: "缩放比例", fit: "适应窗口", actual: "原始尺寸",
    info: "{width} × {height} · {zoom}% · 合成预览 {previewWidth} × {previewHeight}" },
  en: { loading: "Reading saved composite…", zoom: "Zoom", fit: "Fit the window", actual: "Actual size",
    info: "{width} × {height} · {zoom}% · Composite preview {previewWidth} × {previewHeight}" },
});
const dimensions = data.dimensions;
const chrome = { width: Math.max(0, hostWindow().currentWidth - innerWidth), height: Math.max(0, hostWindow().currentHeight - innerHeight) };
let bitmap, zoom = 1, x = 0, y = 0, fitting = true, drag, publishedZoom, frame, settling;
function viewport() { return { width: innerWidth, height: innerHeight }; }
function presentation() {
  const css = getComputedStyle(document.documentElement);
  const mode = css.getPropertyValue("--viewport-mode").trim();
  return {
    insets: { top: parseFloat(css.getPropertyValue("--safe-top")) || 0,
      bottom: parseFloat(css.getPropertyValue("--safe-bottom")) || 0 },
    windowViewport: mode === "window" || (mode === "" && chrome.width === 0 && chrome.height === 0),
    background: css.getPropertyValue("--canvas").trim() || "#141519",
  };
}
function clampPan() {
  settling = undefined;
  ({ x, y } = constrainPan({ x, y }, viewport(), dimensions, zoom, presentation().insets));
}
function publishControls() {
  if (publishedZoom === zoom) return;
  publishedZoom = zoom;
  controls([
    { id: "zoom", kind: "scrub", label: say("zoom"), value: zoom * 100,
      min: Math.min(2, zoom * 100), max: 2000, suffix: "%",
      run: value => { if (typeof value === "number" && Number.isFinite(value)) scaleTo(value / 100); } },
    { id: "fit", kind: "button", label: say("fit"), icon: "maximize-2", run: fit },
    { id: "actual", kind: "button", label: say("actual"), icon: "scan", run() {
      settling = undefined; fitting = false; zoom = 1; x = y = 0; requestPaint();
    } },
  ]);
}
function paint(time) {
  frame = undefined;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(innerWidth * ratio)), height = Math.max(1, Math.round(innerHeight * ratio));
  // Pan and zoom reuse the bounded backing store, rather than allocating an image-sized canvas.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width / ratio, height / ratio);
  if (!bitmap) return;
  if (settling) {
    settling.start ??= time;
    const progress = (time - settling.start) / 280;
    ({ x, y } = reboundPosition(settling.from, settling.target, progress));
    if (progress >= 1) settling = undefined;
    else requestPaint();
  }
  const drawnWidth = dimensions.width * zoom, drawnHeight = dimensions.height * zoom;
  context.drawImage(bitmap, (innerWidth - drawnWidth) / 2 + x, (innerHeight - drawnHeight) / 2 + y, drawnWidth, drawnHeight);
  publishControls();
  status(say("info", { width: dimensions.width, height: dimensions.height, zoom: Math.round(zoom * 1000) / 10,
    previewWidth: bitmap.width, previewHeight: bitmap.height }));
}
function requestPaint() { frame ??= requestAnimationFrame(paint); }
function fit() {
  settling = undefined;
  const { insets, windowViewport } = presentation();
  ({ zoom, x, y } = fitGeometry(viewport(), dimensions, insets, windowViewport));
  fitting = true; requestPaint();
}
function scaleTo(value) {
  fitting = false; zoom = Math.max(0.00001, Math.min(20, value));
  clampPan(); requestPaint();
}
try {
  status(say("loading"));
  const baseline = hostWindow();
  const scale = Math.min(baseline.width / dimensions.width, baseline.height / dimensions.height);
  await prepare({ window: { width: dimensions.width * scale, height: dimensions.height * scale } });
  const result = await call("render");
  if (!Number.isSafeInteger(result.size) || result.size !== result.width * result.height * 4 || result.size > 2560 * 2560 * 4) throw new Error("Invalid preview dimensions");
  const pixels = new Uint8ClampedArray(result.size);
  for (let offset = 0; offset < pixels.length; offset += 512 * 1024) {
    const length = Math.min(512 * 1024, pixels.length - offset);
    const chunk = atob(await call("pixels", { offset, length }));
    if (chunk.length !== length) throw new Error("Incomplete preview chunk");
    for (let i = 0; i < length; i++) pixels[offset + i] = chunk.charCodeAt(i);
  }
  bitmap = await createImageBitmap(new ImageData(pixels, result.width, result.height));
  fit();
  onLocale(() => { publishedZoom = undefined; requestPaint(); });
  onTheme(() => { if (fitting) fit(); else { clampPan(); requestPaint(); } });
  addEventListener("resize", () => { if (fitting) fit(); else { clampPan(); requestPaint(); } });
  canvas.addEventListener("wheel", event => {
    event.preventDefault(); scaleTo(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    settling = undefined; fitting = false;
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.clientX; y = drag.y + event.clientY - drag.clientY;
    ({ x, y } = elasticPan({ x, y }, viewport(), dimensions, zoom, presentation().insets)); requestPaint();
  });
  function stopDrag(event) {
    if (drag?.id !== event.pointerId) return;
    drag = undefined; canvas.classList.remove("dragging");
    const target = constrainPan({ x, y }, viewport(), dimensions, zoom, presentation().insets);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { ({ x, y } = target); }
    else if (target.x !== x || target.y !== y) { settling = { from: { x, y }, target }; }
    requestPaint();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, stopDrag);
  addEventListener("pagehide", () => { if (frame !== undefined) cancelAnimationFrame(frame); bitmap?.close(); }, { once: true });
  await presented();
} catch (error) {
  const message = String(error?.message ?? error);
  status(message); await presented(message);
}
