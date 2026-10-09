export function pageNumber(value, count) {
  return Math.max(1, Math.min(count, Math.round(Number(value) || 1)));
}

export function defaultFitMode(settings) {
  return settings.fitWindow === false ? "page" : "fill";
}

export function renderGeometry(width, height, availableWidth, availableHeight, mode, zoom, dpr = 1) {
  const scale = mode === "fill"
    ? Math.max(availableWidth / width, availableHeight / height)
    : mode === "page" ? Math.min(availableWidth / width, availableHeight / height) : zoom;
  const cssScale = Math.max(0.01, Math.min(8, scale));
  // Bound canvas memory even for oversized pages and high-DPI screens.
  const outputScale = Math.min(Math.max(1, dpr), 4096 / (width * cssScale), 4096 / (height * cssScale), Math.sqrt(16 * 1024 * 1024 / (width * height * cssScale ** 2)));
  return { scale: cssScale, outputScale };
}
