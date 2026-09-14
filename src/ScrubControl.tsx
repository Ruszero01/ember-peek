import { useEffect, useRef, useState } from "react";
import type { Control } from "./types";

export function ScrubControl({ control, active, onActiveChange, onChange }: { control: Control; active: boolean; onActiveChange: (active: boolean) => void; onChange: (value: number) => void }) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; y: number; value: number } | null>(null);
  const min = control.min!, max = control.max!;
  const value = dragValue ?? control.value!;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const change = (v: number) => { const next = clamp(v); setDragValue(next); onChange(next); };
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  const finish = () => { drag.current = null; setDragValue(null); onActiveChange(false); };
  return <button className={`scrub-control ${dragValue !== null ? "scrubbing" : ""}`} role="slider"
    aria-label={control.label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    aria-valuetext={`${Math.round(value)}${control.suffix || ""}`} tabIndex={active ? 0 : -1}
    title={`${control.label} · 按住向上放大、向下缩小`}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, y: event.clientY, value }; setDragValue(value); onActiveChange(true); }}
    onPointerMove={event => { const d = drag.current; if (d && d.pointer === event.pointerId) change(d.value * Math.exp((d.y - event.clientY) / 100)); }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish}
    onKeyDown={event => {
      const factors: Record<string, number> = { ArrowUp: 1.1, ArrowRight: 1.1, ArrowDown: 1 / 1.1, ArrowLeft: 1 / 1.1 };
      if (factors[event.key] || event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(clamp(event.key === "Home" ? min : event.key === "End" ? max : value * factors[event.key])); }
    }}>
    {dragValue === null ? <span>{Math.round(value)}{control.suffix}</span> : <span className="scrub-track" aria-hidden="true"><span className="scrub-ticks" /><span className="scrub-thumb" style={{ bottom: `${Math.log(value / min) / Math.log(max / min) * 100}%` }} /></span>}
  </button>;
}
