export function autoHideChromeSetting(value: unknown) { return value !== false; }
export function shouldShowChrome(immersive: boolean, autoHide: boolean, hovered: boolean, scrubbing: boolean, hasPreview: boolean) {
  return !immersive || !autoHide || hovered || scrubbing || !hasPreview;
}
