/** Bounded file transport for independent document viewers. Inject the session read function. */
export async function readDocument(read, size) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 64 * 1024 * 1024) throw new Error('Document exceeds the 64 MiB preview budget');
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 1024 * 1024) {
    const length = Math.min(1024 * 1024, size - offset);
    const part = await read(offset, length);
    if (part.length !== length) throw new Error('Document changed or was truncated during loading');
    bytes.set(part, offset);
  }
  return bytes.buffer;
}
export function pageIndex(value, count) { return Math.max(0, Math.min(count - 1, Math.round(Number(value) || 1) - 1)); }
export function zoomFactor(percent) { return Math.max(0.1, Math.min(4, (Number(percent) || 100) / 100)); }
/** Calculate a bounded row window instead of mounting a complete spreadsheet. */
export function rowWindow(scrollTop, rowHeight, count, viewportHeight, overscan = 8) {
  const first = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const last = Math.max(first, Math.min(count, first + 200, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan));
  return { first: Math.min(first, count), last, top: first * rowHeight, bottom: Math.max(0, count - last) * rowHeight };
}
/** Prevent document hyperlinks, forms and embedded HTML from navigating a preview frame. */
export function lockDocumentLinks(root) {
  const prevent = event => { if (event.target.closest?.('a,form')) event.preventDefault(); };
  root.addEventListener('click', prevent, true);
  root.addEventListener('submit', event => event.preventDefault(), true);
}

/** Fit both axes while preserving the slide aspect ratio. */
export function fitDocument(width, height, contentWidth, contentHeight) {
  return Math.max(.1, Math.min(4, Math.max(0, width) / contentWidth, Math.max(0, height) / contentHeight));
}

function viewportCenter(viewport) {
  const rect = viewport.getBoundingClientRect(), css = getComputedStyle(viewport);
  const padding = key => parseFloat(css[key]) || 0;
  return {
    x: rect.left + (viewport.clientLeft || 0) + (viewport.clientWidth + padding('paddingLeft') - padding('paddingRight')) / 2,
    y: rect.top + (viewport.clientTop || 0) + (viewport.clientHeight + padding('paddingTop') - padding('paddingBottom')) / 2,
  };
}

/** Preserve the content point at the usable viewport center across zoom or reflow. */
export function captureZoomCenter(viewport, content) {
  if (!content) return null;
  const rect = content.getBoundingClientRect(), center = viewportCenter(viewport);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: Math.max(0, Math.min(1, (center.x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (center.y - rect.top) / rect.height)) };
}

export function restoreZoomCenter(viewport, content, anchor) {
  if (!content || !anchor) return;
  const rect = content.getBoundingClientRect(), center = viewportCenter(viewport);
  viewport.scrollLeft += rect.left + rect.width * anchor.x - center.x;
  viewport.scrollTop += rect.top + rect.height * anchor.y - center.y;
}
