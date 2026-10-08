/** Gesture and keyboard arithmetic for the video view.
 *
 *  The pointer's own travel decides the value, so a drag needs no round trip before the picture
 *  moves, and the two axes are the two things the picture itself can change: where in the file
 *  the user is, and how loud it is. Everything here is a plain number in and a plain number out,
 *  so the rules are testable without a video element; view.js owns the events and the elements. */

/** Travel that turns a press into a drag. Under it the press is still a play/pause click. */
export const DRAG_THRESHOLD = 4;
/** Vertical pixels per e-fold of the volume: the distance the host's own scrub control uses. */
export const PIXELS_PER_EFOLD = 40;
/** Seconds one arrow-key press moves the timeline. */
export const KEY_STEP = 5;
/** The level this plugin treats as the quietest usable volume, everywhere it writes one. */
export const MIN_VOLUME = 0.01;

/** Which axis a drag has committed to, or null while the press could still be a click. Equal
 *  travel on both axes reads as the timeline: that is the axis a viewer reaches for first, and
 *  a drag's first few pixels are far more often sideways than straight down. */
export function dragAxis(dx, dy, threshold = DRAG_THRESHOLD) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < threshold) return null;
  return Math.abs(dx) >= Math.abs(dy) ? "seek" : "volume";
}

/** Where a horizontal drag lands: one viewport width of travel covers the whole file, which is
 *  the same distance the timeline spends on it, and the file's ends are hard stops. */
export function seekFromDrag(start, dx, width, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const base = Number.isFinite(start) ? start : 0;
  const span = Number.isFinite(width) && width > 0 ? width : 1;
  return Math.min(duration, Math.max(0, base + (dx / span) * duration));
}

/** The level a vertical drag lands on: dragging up multiplies by e every 40px, dragging down
 *  divides by it, and the ends are the ends of the volume range. Multiplicative for the same
 *  reason the host's scrub control is: equal travel is an equal ratio change wherever the drag
 *  starts, so the loud end stays reachable and the quiet end stays controllable. */
export function volumeFromDrag(start, dy) {
  const base = Math.min(1, Math.max(MIN_VOLUME, Number.isFinite(start) ? start : 1));
  const level = base * Math.exp(-dy / PIXELS_PER_EFOLD);
  return Math.min(1, Math.max(MIN_VOLUME, Number.isFinite(level) ? level : base));
}

/** One keyboard step along the timeline, held inside the file. A duration that has not arrived
 *  yet (metadata still loading) only keeps the answer above zero. */
export function stepTime(current, direction, duration, step = KEY_STEP) {
  const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const base = Number.isFinite(current) ? current : 0;
  return Math.min(end, Math.max(0, base + direction * step));
}
