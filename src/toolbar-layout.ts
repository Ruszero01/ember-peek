/** Keep plugin controls reachable without forcing an excessively wide window. */
export function toolbarMinimumWidth(actions: number, padding: number, screenWidth: number, informationWidth = 120) {
  const limit = Math.max(320, Math.min(800, Math.floor(screenWidth * 0.8)));
  return Math.max(320, Math.min(limit, Math.ceil(actions + padding + Math.max(120, informationWidth) + 12 + 12)));
}

export function toolbarWheelPosition(left: number, width: number, viewport: number, event: {deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean}) {
  if (event.ctrlKey) return left;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const pixels = delta * (event.deltaMode === 1 ? 30 : event.deltaMode === 2 ? viewport : 1);
  return Math.max(0, Math.min(Math.max(0, width - viewport), left + pixels));
}

export function toolbarRowWidth(widths: number[], gap: number) {
  return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
}

export function toolbarNeedsResize(currentWidth: number, minimumWidth: number, previousMinimum = 0) {
  return minimumWidth !== previousMinimum && currentWidth < minimumWidth;
}



/** Auto alignment space is not part of the toolbar content width. */
export function toolbarScrollSpacing(paddingLeft: number, paddingRight: number, marginRight: number) {
  return Math.max(0, paddingLeft + paddingRight + marginRight);
}
