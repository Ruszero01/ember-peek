export function overlayOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid overlay options');
  for (const key of Object.keys(value)) {
    if (!['movable', 'resizable', 'followToolbar'].includes(key) || typeof value[key] !== 'boolean') throw new Error('Invalid overlay option');
  }
  return { movable: true, resizable: false, followToolbar: false, ...value };
}

export function sidebarOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sidebar options');
  for (const key of Object.keys(value)) if (!['side', 'width', 'minWidth', 'maxWidth'].includes(key)) throw new Error('Invalid sidebar option');
  const result = { side: 'left', width: 220, minWidth: 140, maxWidth: 480, ...value };
  if (!['left', 'right'].includes(result.side)) throw new Error('Invalid sidebar side');
  for (const key of ['width', 'minWidth', 'maxWidth']) {
    if (!Number.isFinite(result[key]) || result[key] < 80 || result[key] > 800) throw new Error('Invalid sidebar width');
  }
  if (result.minWidth > result.width || result.width > result.maxWidth) throw new Error('Invalid sidebar width range');
  return result;
}

/** Keep at least half of a narrow viewport for the primary view. */
export function sidebarWidth(width, bounds, viewport) {
  const maximum = Math.max(0, Math.min(bounds.maxWidth, (viewport - 6) / 2));
  return Math.max(Math.min(bounds.minWidth, maximum), Math.min(maximum, width));
}

export function overlaySize(size, viewport, strip = 12) {
  return {
    width: Math.max(Math.min(120, viewport.width), Math.min(viewport.width, size.width)),
    height: Math.max(Math.min(24 + strip, viewport.height), Math.min(viewport.height, size.height)),
  };
}

/** Remember the requested width, independently of temporary viewport limits. */
export function rememberedSidebarWidth(value, options) {
  return Number.isFinite(value) && value >= 80 && value <= 800
    ? Math.max(options.minWidth, Math.min(options.maxWidth, value)) : options.width;
}
