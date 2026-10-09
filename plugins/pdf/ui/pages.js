export function readingMode(settings) {
  return settings.viewMode === "continuous" ? "continuous" : "single";
}

// Find the page whose top precedes a position, without scanning a long document.
export function pageAt(count, topAt, position) {
  let low = 0, high = count - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (topAt(middle) <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function visiblePages(count, topAt, top, height) {
  const first = Math.max(0, pageAt(count, topAt, top) - 1);
  const last = Math.min(count - 1, pageAt(count, topAt, top + height) + 1);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
