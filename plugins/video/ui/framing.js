/** Declare a window from the user's recorded size, accounting for host bars outside this view. */
export function windowForVideo(basis, current, viewport, pixels) {
  if (!Number.isFinite(pixels.width) || !Number.isFinite(pixels.height) ||
      pixels.width <= 0 || pixels.height <= 0) return null;
  const chromeWidth = Math.max(0, current.width - viewport.width);
  const chromeHeight = Math.max(0, current.height - viewport.height);
  const roomWidth = Math.max(1, basis.width - chromeWidth);
  const roomHeight = Math.max(1, basis.height - chromeHeight);
  const content = pixels.width >= pixels.height
    ? { width: roomWidth, height: roomWidth * pixels.height / pixels.width }
    : { width: roomHeight * pixels.width / pixels.height, height: roomHeight };
  return {
    width: Math.round(content.width + chromeWidth),
    height: Math.round(content.height + chromeHeight),
  };
}

/** Whole-pixel window sizing may round the short axis by one pixel. */
export function videoFillsViewport(viewport, pixels) {
  if (!pixels.width || !pixels.height) return false;
  return pixels.width >= pixels.height
    ? Math.abs(viewport.height - viewport.width * pixels.height / pixels.width) <= 1
    : Math.abs(viewport.width - viewport.height * pixels.width / pixels.height) <= 1;
}
