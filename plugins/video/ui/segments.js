/** Piece arithmetic for the video view's playback proxy.
 *
 *  A file the browser cannot decode has to be transcoded before any of it can be watched, and a
 *  long one takes longer to transcode than a viewer is willing to wait: the file is therefore cut
 *  into pieces and the first of them is played while the rest are still being written. How that
 *  cut is made is a decision the view has to make and explain, so it lives here as plain numbers
 *  in and plain numbers out, testable without a video element; view.js owns the elements, and the
 *  plugin's own native side owns the encoder. */

/** How much of the file each piece covers. Short enough that the first piece arrives quickly --
 *  a 7680x2160 screen recording takes about six seconds per piece through the capped proxy --
 *  and long enough that the encode is worth starting. */
export const SEGMENT_SECONDS = 30;
/** The most pieces held in memory around the one being watched. Every piece is a `Blob` the
 *  browser keeps in full, and a long recording is hundreds of them. */
export const MAX_BUFFERED = 4;
/** How many pieces beyond the one on screen are worth making ahead of the playhead. */
export const PREFETCH = 2;

/** How many pieces a file of this length is cut into: at least one, and exactly one when nobody
 *  knows how long the file is -- then a single piece is the whole file. */
export function segmentCount(duration, seconds = SEGMENT_SECONDS) {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(1, Math.ceil(duration / seconds));
}

/** Which piece holds a time in the file, never past the last one: the end of the file belongs to
 *  the piece that is still playing when it reaches it. */
export function segmentOf(time, duration, seconds = SEGMENT_SECONDS) {
  const asked = Number.isFinite(time) ? Math.max(0, time) : 0;
  const last = segmentCount(duration, seconds) - 1;
  return Math.min(last, Math.floor(asked / seconds));
}

/** What the encoder is asked for: where the piece begins, and how much of the file it covers.
 *  Zero seconds means the whole file, which is the only piece possible when the length is not
 *  known. An index past the end still asks for the last piece, so a piece is never empty. */
export function segmentRequest(index, duration, seconds = SEGMENT_SECONDS) {
  if (!Number.isFinite(duration) || duration <= 0) return { from: 0, seconds: 0 };
  const last = segmentCount(duration, seconds) - 1;
  const piece = Math.min(last, Math.max(0, Math.trunc(index) || 0));
  const from = piece * seconds;
  return { from, seconds: Math.min(seconds, duration - from) };
}

/** The pieces worth holding while the user watches one of them: that piece and the ones ahead of
 *  it. Near the end of the file there is nothing ahead to keep, so the window falls back behind
 *  instead of reaching past the file. */
export function bufferedWindow(index, count, total = MAX_BUFFERED) {
  const last = Math.max(0, count - 1);
  const at = Math.min(last, Math.max(0, Math.trunc(index) || 0));
  const want = Math.max(1, Math.trunc(total) || 1);
  const end = Math.min(last, at + want - 1);
  const start = Math.max(0, end - want + 1);
  const keep = [];
  for (let piece = start; piece <= end; piece += 1) keep.push(piece);
  return keep;
}

/** Which of the waiting pieces the one encode lane builds next, and which of them it drops.
 *
 *  A piece is waited for either because the user asked to see it (`ahead: false`) or because it
 *  is being made for where the playhead is going (`ahead: true`). Only one encode runs at a time,
 *  so the order is what a viewer feels: a seek they just made comes before anything made ahead of
 *  them, and within each kind the piece asked for first comes first. A look-ahead piece the window
 *  has since moved past is handed back as `dropping` rather than built: nobody will look at it,
 *  and building it would put it in front of the piece the user is waiting for. A piece the user
 *  asked for is never dropped -- that is the piece they are looking at.
 *
 *  `waiting` is the queue in arrival order; `next` is the entry to build, and both are null/empty
 *  when there is nothing left to do. */
export function nextToBuild(waiting, viewIndex, count, total = MAX_BUFFERED) {
  const keep = new Set(bufferedWindow(viewIndex, count, total));
  const dropping = waiting.filter((entry) => entry.ahead && !keep.has(entry.index));
  const staying = waiting.filter((entry) => !dropping.includes(entry));
  const next = staying.find((entry) => !entry.ahead) ?? staying[0] ?? null;
  return { next, dropping };
}
