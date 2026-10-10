import "./shortcuts.js";
import { ready, read, controls, status, presented, shortcuts, translate, onLocale, configuration, onSettings, synchronizeState } from "./sdk.js";
import { getDocument, GlobalWorkerOptions, PDFDataRangeTransport } from "./vendor/pdf.mjs";
import { pageNumber, renderGeometry, defaultFitMode } from "./geometry.js";
import { createPdfRangeReader } from "./range.js";
import { readingMode, pageAt, visiblePages } from "./pages.js";
import { pdfShortcuts, animateScroll } from "./navigation.js";
import { pdfPosition, capturePosition, restorePosition } from "./position.js";

const { file } = await ready;
const viewport = document.querySelector("#viewport");
let pages = [], rendered = new Set(), layoutDirty = true;
let reading = readingMode(configuration());
const say = translate({
  "zh-CN": { loading: "正在加载 PDF…", failed: "PDF 加载失败：{error}", password: "初版暂不支持需要密码的 PDF", page: "页码", previous: "上一页", next: "下一页", zoom: "缩放比例", fit: "适配窗口", rotate: "顺时针旋转", info: "第 {page} / {count} 页 · {zoom}%" },
  en: { loading: "Loading PDF…", failed: "PDF could not be loaded: {error}", password: "Password-protected PDFs are not supported in this baseline", page: "Page", previous: "Previous page", next: "Next page", zoom: "Zoom", fit: "Fill window", rotate: "Rotate clockwise", info: "Page {page} / {count} · {zoom}%" },
});
let documentProxy, loadingTask, worker, workerUrl, renderTask;
let defaultFit = defaultFitMode(configuration());
let page = 1, rotation = 0, mode = defaultFit, zoom = 1, revision = 0;
let queue = Promise.resolve(), usable = false, closed = false;
let jumpPage = null, cancelJump;
let positionSync, pendingPosition;

function position() {
  if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return undefined;
  if (pendingPosition?.page === page) return pendingPosition;
  const slot = reading === "continuous" ? pages[page - 1] : pages[0];
  return slot && Number(slot.dataset.page) === page && usable && !layoutDirty ? capturePosition(viewport, slot, page) : undefined;
}

function stopJump() {
  cancelJump?.();
  cancelJump = null;
  jumpPage = null;
}

function publish() {
  if (!documentProxy) return;
  controls([
    { id: "previous", kind: "button", label: say("previous"), icon: "chevron-left", run: () => navigate(page - 1) },
    ...(documentProxy.numPages > 1 ? [{ id: "page", kind: "scrub", label: say("page"), value: page, min: 1, max: documentProxy.numPages, direction: "down", run: navigate }] : []),
    { id: "next", kind: "button", label: say("next"), icon: "chevron-right", run: () => navigate(page + 1) },
    { id: "zoom", kind: "scrub", label: say("zoom"), value: zoom * 100, min: Math.min(1, zoom * 100), max: 800, suffix: "%", run: value => { mode = "manual"; zoom = Math.max(0.01, Math.min(8, Number(value) / 100)); schedule(); } },
    { id: "fit", kind: "toggle", label: say("fit"), icon: "maximize-2", active: mode === "fill", run: () => { mode = mode === "fill" ? "page" : "fill"; schedule(); } },
    { id: "rotate", kind: "button", label: say("rotate"), icon: "rotate-cw", run: () => { rotation = (rotation + 90) % 360; schedule(); } },
  ]);
  status(say("info", { page, count: documentProxy.numPages, zoom: Math.round(zoom * 100) }));
}

function navigate(value) {
  const next = pageNumber(value, documentProxy.numPages);
  if (next === page) return;
  stopJump();
  page = next;
  if (reading === "continuous" && pages.length) {
    jumpPage = page;
    const top = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight,
      pages[page - 1].offsetTop - parseFloat(getComputedStyle(viewport).paddingTop)));
    publish();
    schedule(false);
    cancelJump = animateScroll(viewport, top, () => {
      cancelJump = null;
      jumpPage = null;
      schedule(false);
    }, { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220 });
  } else {
    viewport.scrollTop = viewport.scrollLeft = 0;
    schedule();
  }
}

function failure(error) {
  if (closed) return;
  const message = say("failed", { error: error.message || String(error) });
  status(message);
  if (!usable) void presented(message);
}

function schedule(reset = true) {
  if (reset && !pendingPosition) pendingPosition = position();
  if (reset) stopJump();
  layoutDirty ||= reset;
  const current = ++revision;
  renderTask?.cancel();
  queue = queue.catch(() => {}).then(async () => {
    if (closed || current !== revision) return;
    const selectedPage = page;
    const pdfPage = await documentProxy.getPage(selectedPage);
    if (closed || current !== revision) return;
    const base = pdfPage.getViewport({ scale: 1, rotation: (pdfPage.rotate + rotation) % 360 });
    const css = getComputedStyle(viewport);
    const width = viewport.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const height = viewport.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const geometry = renderGeometry(base.width, base.height, Math.max(1, width), Math.max(1, height), mode, zoom, devicePixelRatio);
    if (layoutDirty) zoom = geometry.scale;
    if (layoutDirty) {
      layoutDirty = false;
      rendered.clear();
      viewport.replaceChildren();
      pages = Array.from({ length: reading === "continuous" ? documentProxy.numPages : 1 }, (_, index) => {
        const slot = document.createElement("div");
        slot.className = "pdf-page";
        slot.dataset.page = String(reading === "continuous" ? index + 1 : selectedPage);
        slot.style.width = `${base.width * zoom}px`;
        slot.style.height = `${base.height * zoom}px`;
        viewport.append(slot);
        return slot;
      });
      viewport.scrollTop = reading === "continuous" ? pages[selectedPage - 1].offsetTop - parseFloat(css.paddingTop) : 0;
    }
    const targets = reading === "continuous"
      ? visiblePages(pages.length, index => pages[index].offsetTop, viewport.scrollTop, viewport.clientHeight)
      : [0];
    if (jumpPage !== null && !targets.includes(jumpPage - 1)) targets.push(jumpPage - 1);
    const keep = new Set(targets);
    for (const index of rendered) {
      if (keep.has(index)) continue;
      const oldCanvas = pages[index].querySelector("canvas");
      if (oldCanvas) { oldCanvas.width = oldCanvas.height = 0; oldCanvas.remove(); }
      rendered.delete(index);
    }
    for (const index of targets.sort((a, b) => Math.abs(a - (selectedPage - 1)) - Math.abs(b - (selectedPage - 1)))) {
      if (closed || current !== revision) return;
      if (rendered.has(index)) continue;
      const slot = pages[index];
      const targetPage = await documentProxy.getPage(Number(slot.dataset.page));
      if (closed || current !== revision) return;
      const view = targetPage.getViewport({ scale: zoom, rotation: (targetPage.rotate + rotation) % 360 });
      const output = renderGeometry(view.width, view.height, width, height, "manual", 1, devicePixelRatio).outputScale;
    // Render into a detached canvas so cancelled work never replaces a complete page.
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.floor(view.width * output));
    buffer.height = Math.max(1, Math.floor(view.height * output));
    renderTask = targetPage.render({ canvasContext: buffer.getContext("2d"), viewport: view, transform: [output, 0, 0, output, 0, 0] });
    try { await renderTask.promise; }
    catch (error) { if (error.name !== "RenderingCancelledException") throw error; return; }
    finally { renderTask = null; }
    if (closed || current !== revision) return;
    slot.style.width = buffer.style.width = `${view.width}px`;
    slot.style.height = buffer.style.height = `${view.height}px`;
    slot.replaceChildren(buffer);
    rendered.add(index);
    targetPage.cleanup();
    publish();
    if (!usable) { usable = true; await presented(); }
    }
    if (pendingPosition) {
      const slot = reading === "continuous" ? pages[page - 1] : pages[0];
      restorePosition(viewport, slot, pendingPosition);
      pendingPosition = null;
      if (reading === "continuous") schedule(false);
    }
    void positionSync?.changed();
  }).catch(failure);
  return queue;
}

try {
  status(say("loading"));
  const source = await fetch(new URL("./vendor/pdf.worker.bundle.mjs", import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`PDF worker: ${response.status}`);
    return response.text();
  });
  workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  worker = new Worker(workerUrl);
  worker.addEventListener("error", () => {
    failure(new Error("PDF worker failed to start"));
    void loadingTask?.destroy();
  });
  GlobalWorkerOptions.workerPort = worker;
  const initial = await read(0, Math.min(file.size, 65536));
  const range = new PDFDataRangeTransport(file.size, initial);
  let aborted = false;
  range.abort = () => { aborted = true; };
  const readRange = createPdfRangeReader((offset, length) => aborted || closed ? Promise.reject(new Error("PDF read cancelled")) : read(offset, length));
  range.requestDataRange = (begin, end) => {
    void readRange(begin, end).then(bytes => {
      if (!closed && !aborted) range.onDataRange(begin, bytes);
    }).catch(error => { if (!aborted && !closed) { failure(error); void loadingTask?.destroy(); } });
  };
  const assets = new URL("./vendor/", import.meta.url).href;
  loadingTask = getDocument({ range, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536, isEvalSupported: false, useWorkerFetch: false, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
  loadingTask.onPassword = () => { failure(new Error(say("password"))); void loadingTask.destroy(); };
  documentProxy = await loadingTask.promise;
  const scrollBy = amount => {
    stopJump();
    pendingPosition = null;
    viewport.scrollBy({ top: amount, behavior: "auto" });
  };
  await shortcuts(pdfShortcuts({
    previous: () => navigate(page - 1), next: () => navigate(page + 1),
    scrollUp: () => scrollBy(-80), scrollDown: () => scrollBy(80),
    first: () => navigate(1), last: () => navigate(documentProxy.numPages),
  }));
  reading = readingMode(configuration());
  defaultFit = mode = defaultFitMode(configuration());
  positionSync = await synchronizeState(position, async value => {
    pendingPosition = pdfPosition(value, documentProxy.numPages);
    page = pendingPosition.page;
    await schedule();
  });
  if (!usable) schedule();
  let scrollFrame;
  viewport.addEventListener("scroll", () => {
    if (reading !== "continuous") { void positionSync?.changed(); return; }
    if (reading !== "continuous" || layoutDirty || jumpPage !== null || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (reading !== "continuous" || jumpPage !== null || !pages.length) return;
      page = pageAt(pages.length, index => pages[index].offsetTop, viewport.scrollTop + viewport.clientHeight / 2) + 1;
      publish();
      schedule(false);
    });
  });
  const interrupt = () => { stopJump(); pendingPosition = null; };
  viewport.addEventListener("wheel", interrupt, { passive: true });
  viewport.addEventListener("pointerdown", interrupt);
  onSettings(settings => {
    const previousPosition = position();
    const next = readingMode(settings);
    const nextFit = defaultFitMode(settings);
    if (next === reading && nextFit === defaultFit) return;
    reading = next;
    if (nextFit !== defaultFit) mode = nextFit;
    defaultFit = nextFit;
    pendingPosition = previousPosition;
    schedule();
  });
  new ResizeObserver(() => { if (mode !== "manual" && viewport.clientWidth > 0 && viewport.clientHeight > 0) schedule(); }).observe(viewport);
  onLocale(publish);
} catch (error) { failure(error); }

window.addEventListener("pagehide", () => {
  void positionSync?.flush();
  positionSync?.dispose();
  stopJump();
  closed = true;
  revision++;
  renderTask?.cancel();
  void loadingTask?.destroy();
  worker?.terminate();
  if (workerUrl) URL.revokeObjectURL(workerUrl);
});
