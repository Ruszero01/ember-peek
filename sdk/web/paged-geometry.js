export function documentPreferences(settings = {}) {
  return { reading: settings.viewMode === 'continuous' ? 'continuous' : 'single', mode: settings.fitWindow === false ? 'page' : 'fill' };
}
export function documentZoom(value) { return Math.max(.01, Math.min(8, (Number(value) || 100) / 100)); }
export function pageGeometry(width, height, rotation, availableWidth, availableHeight, mode, zoom) {
  const angle = ((rotation % 360) + 360) % 360;
  const swapped = angle === 90 || angle === 270;
  const w = swapped ? height : width, h = swapped ? width : height;
  const scale = mode === 'manual' ? zoom : (mode === 'fill' ? Math.max : Math.min)(availableWidth / w, availableHeight / h);
  const bounded = Math.max(.01, Math.min(8, scale));
  const translation = angle === 90 ? [height, 0] : angle === 180 ? [width, height] : angle === 270 ? [0, width] : [0, 0];
  return { width: w * bounded, height: h * bounded, scale: bounded,
    transform: `scale(${bounded}) translate(${translation[0]}px, ${translation[1]}px) rotate(${angle}deg)` };
}
/** Keep lazy slide rendering bounded, even when many tiny pages are visible. */
export function pageNeighborhood(page, count, visibleLast = page) {
  const length = Math.min(count, 32, Math.max(5, visibleLast - page + 3));
  return Array.from({length}, (_, offset) => Math.max(0, Math.min(count - length, page - 2)) + offset);
}

/** Fill sizing must not feed horizontal scrollbar height back into its own scale. */
export function documentViewportSize(viewport, css, mode) {
  const px = key => parseFloat(css[key]) || 0;
  const height = mode === 'fill' ? viewport.offsetHeight - px('borderTopWidth') - px('borderBottomWidth') : viewport.clientHeight;
  return {
    width: Math.max(1, viewport.clientWidth - px('paddingLeft') - px('paddingRight')),
    height: Math.max(1, height - px('paddingTop') - px('paddingBottom')),
  };
}
