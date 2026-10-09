import { useEffect, useRef, useState } from "react";
import type { Control } from "./types";
import { useT } from "./i18n";
import { scrubPosition, scrubDragValue } from "./protocol.mjs";

/**
 * Pixels of pointer travel per e-fold of the value. The mapping is exponential because one
 * control can span orders of magnitude (image zoom runs 2–2000), and a constant *ratio* per
 * pixel is what keeps the whole range reachable: at this distance a 1–100 volume takes about
 * 180px and a 2–2000 zoom about 270px, instead of the ~460/690px a 100px e-fold asked for.
 */

export function ScrubControl({ control, active, onActiveChange, onChange }: { control: Control; active: boolean; onActiveChange: (active: boolean) => void; onChange: (value: number) => void }) {
  const t = useT();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; y: number; value: number } | null>(null);
  const min = control.min!, max = control.max!;
  const value = dragValue ?? control.value!;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const change = (v: number) => { const next = clamp(v); setDragValue(next); onChange(next); };
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  const finish = () => { drag.current = null; setDragValue(null); onActiveChange(false); };
  // The thumb sits where the value sits between min and max, so the readout and the track agree
  // (a logarithmic thumb would put a 12% volume halfway up the button). The drag itself stays
  // multiplicative — that is what keeps a 2–2000 range usable — and the number is the readout
  // either way.
  const position = scrubPosition(value, min, max, control.direction);
  return <button className={`scrub-control ${dragValue !== null ? "scrubbing" : ""}`} role="slider"
    aria-label={control.label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    aria-valuetext={`${Math.round(value)}${control.suffix || ""}`} tabIndex={active ? 0 : -1}
    title={t(control.direction === "down" ? "scrub.hintDown" : "scrub.hint", { label: control.label })}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, y: event.clientY, value }; setDragValue(value); onActiveChange(true); }}
    onPointerMove={event => {
      const d = drag.current;
      if (!d || d.pointer !== event.pointerId) return;
      // A release we never saw (the window lost the pointer, a synthetic drag ended elsewhere)
      // must not leave the control following the pointer with no button held.
      if (event.buttons === 0) { finish(); return; }
      change(scrubDragValue(d.value, event.clientY - d.y, control.direction));
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish}
    onKeyDown={event => {
      const factors: Record<string, number> = { ArrowUp: 1.1, ArrowRight: 1.1, ArrowDown: 1 / 1.1, ArrowLeft: 1 / 1.1 };
      if (control.direction === "down") { factors.ArrowUp = 1 / 1.1; factors.ArrowDown = 1.1; }
      if (factors[event.key] || event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(clamp(event.key === "Home" ? min : event.key === "End" ? max : value * factors[event.key])); }
    }}>
    {/* Always in the markup: the scale is revealed by hover, focus or a drag (CSS), and it is how
        a user sees that this number can be dragged at all. */}
    <span className="scrub-track" aria-hidden="true"><span className="scrub-ticks" /><span className="scrub-thumb" style={{ bottom: `${position * 100}%` }} /></span>
    <span className="scrub-value">{Math.round(value)}{control.suffix}</span>
  </button>;
}
