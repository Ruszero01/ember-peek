/** Zoom is measured against the document dimensions, independent of preview sampling. */
export function fitGeometry(viewport, pixels, insets, windowViewport) {
  return {
    zoom: windowViewport
      ? Math.min(viewport.width / pixels.width, viewport.height / pixels.height)
      : Math.min(1, Math.max(1, viewport.width - 32) / pixels.width,
          Math.max(1, viewport.height - insets.top - insets.bottom) / pixels.height),
    x: 0,
    y: windowViewport ? 0 : (insets.top - insets.bottom) / 2,
  };
}
/** Keep a strip of the document reachable after any zoom, drag or resize. */
export function constrainPan(position, viewport, pixels, zoom, insets) {
  const halfWidth = pixels.width * zoom / 2;
  const halfHeight = pixels.height * zoom / 2;
  const peekX = Math.min(56, halfWidth), peekY = Math.min(56, halfHeight);
  return {
    x: Math.max(peekX - viewport.width / 2 - halfWidth,
      Math.min(viewport.width / 2 - peekX + halfWidth, position.x)),
    y: Math.max(insets.top + peekY - viewport.height / 2 - halfHeight,
      Math.min(viewport.height / 2 - insets.bottom - peekY + halfHeight, position.y)),
  };
}

/** Match the image preview's damped overflow: 22% movement, capped at 32 CSS pixels. */
export function elasticPan(position, viewport, pixels, zoom, insets) {
  const target = constrainPan(position, viewport, pixels, zoom, insets);
  const overflow = value => Math.sign(value) * Math.min(32, Math.abs(value) * 0.22);
  return { x: target.x + overflow(position.x - target.x), y: target.y + overflow(position.y - target.y) };
}
/** A bounded ease-out return with exact endpoints and no overshoot. */
export function reboundPosition(from, target, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - t) ** 3;
  return { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
}