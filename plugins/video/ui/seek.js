/** What a jump asks the picture for, and what the picture shows while it waits.
 *
 *  Seeking a file the browser cannot decode is not always a move of the element: the time asked
 *  for can live in a piece that has not been transcoded yet, which is a wait the user has to see.
 *  Both halves of that story -- when the timeline asks, and how far the ring is drawn -- are
 *  decided here as plain values in and plain values out, so they are testable without a slider or
 *  a video element; view.js owns the elements, and the plugin's native side owns the encoder.
 *  The rules themselves are in docs/plugins.md, the playback-proxy section. */

/** How much of the ring is drawn while the piece that holds the destination is only queued behind
 *  another encode, so nothing about it is known yet. Not zero: a ring that has not moved for ten
 *  seconds reads as a hang, and this is not one -- it is waiting its turn, which is what a turning
 *  quarter says and what an empty ring cannot. */
export const RING_WAITING = 0.25;

/** A ratio the ring may be filled by, or `null` when nothing about it is known yet. The ends are
 *  the ends, and an answer that is missing -- nothing, a blank, or a number that is not one -- is
 *  never read as zero: a ring that keeps the previous piece's progress, or invents a zero for one
 *  it has not heard about, is exactly the reading the user cannot tell apart from a real one. */
export function ringFill(ratio) {
  if (ratio === null || ratio === undefined || ratio === "") return null;
  const value = Number(ratio);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/** What one event on the timeline asks for, given whether this interaction has already asked.
 *
 *  The value a press lands on is already the destination -- the slider jumps to the spot under the
 *  hand -- so the first value of an interaction is asked for at once instead of waiting for the
 *  hand to stop. That wait is what made a click on the timeline feel late: the picture kept
 *  playing the old piece while only the readout moved. Every later value of the same interaction
 *  is a preview: a drag passes over many times, and asking for each one would queue a transcode of
 *  its own and put the piece the user finally wants behind all of them. `"end"` is the end of the
 *  interaction (`change` in the browser, which arrives when the hand comes off the slider and
 *  after every arrow key): it asks for the value the interaction stopped on, and frees the next
 *  one to ask at once again -- which is what makes every arrow-key press a landing of its own.
 *
 *  The answer is `{ asked, seek }`: `asked` is what the next call should be given, and `seek` is
 *  the request to send, or `null` when this event asks for nothing. */
export function timelineSeek(asked, event, value) {
  if (event === "press") return { asked: false, seek: null };
  if (!Number.isFinite(Number(value))) return { asked, seek: null };
  if (event === "end") return { asked: false, seek: { value: Number(value), commit: true } };
  return { asked: true, seek: { value: Number(value), commit: !asked } };
}
