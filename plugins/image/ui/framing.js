/** A prepared viewport differs by at most one rounded CSS pixel on its short axis. */
export function sameShape(viewport, pixels) {
  if (!pixels.width || !pixels.height) return false;
  return pixels.width >= pixels.height
    ? Math.abs(viewport.height - viewport.width * pixels.height / pixels.width) <= 1
    : Math.abs(viewport.width - viewport.height * pixels.width / pixels.height) <= 1;
}

/** Fit without cropping. In a window-sized viewport, the chrome floats over the image, so
 * neither its insets nor the normal view's side margin should shrink the picture. */
export function fitGeometry(viewport, pixels, insets, windowViewport) {
  if (windowViewport) {
    return {
      zoom: Math.min(viewport.width / pixels.width, viewport.height / pixels.height),
      y: 0,
    };
  }
  return {
    zoom: Math.min(
      1,
      Math.max(1, viewport.width - 32) / pixels.width,
      Math.max(1, viewport.height - insets.top - insets.bottom) / pixels.height,
    ),
    y: (insets.top - insets.bottom) / 2,
  };
}
