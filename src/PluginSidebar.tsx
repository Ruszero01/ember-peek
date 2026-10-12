import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sidebarWidth, rememberedSidebarWidth, type SidebarOptions } from './surfaces.mjs';

export function PluginSidebar({ options, children, label, persistenceKey }: { persistenceKey: string; options: SidebarOptions; children: ReactNode; label: string }) {
  const readWidth = () => {
    try { return rememberedSidebarWidth(JSON.parse(localStorage.getItem(`ember.sidebar-width:${persistenceKey}`) || 'null'), options); }
    catch { return options.width; }
  };
  const [requested, setRequested] = useState(readWidth);
  const resize = (value: number) => {
    setRequested(value);
    try { localStorage.setItem(`ember.sidebar-width:${persistenceKey}`, JSON.stringify(value)); } catch { /* Storage can be unavailable. */ }
  };
  const [viewport, setViewport] = useState(window.innerWidth);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  useEffect(() => { setRequested(readWidth()); }, [options.width, persistenceKey]);
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => setViewport(parent.clientWidth));
    observer.observe(parent);
    setViewport(parent.clientWidth);
    return () => { observer.disconnect(); parent.classList.remove('surface-resizing'); };
  }, []);
  const width = sidebarWidth(requested, options, viewport);
  const delta = options.side === 'left' ? 1 : -1;
  return <aside ref={root} className={`plugin-sidebar ${options.side}`} style={{ width }}>
    <div className="sidebar-body">{children}</div>
    <div className="sidebar-divider" role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical"
      aria-valuemin={Math.min(options.minWidth, width)} aria-valuemax={sidebarWidth(options.maxWidth, options, viewport)} aria-valuenow={Math.round(width)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        resize(sidebarWidth(event.key === 'Home' ? options.minWidth : event.key === 'End' ? options.maxWidth : width + (event.key === 'ArrowRight' ? 16 : -16) * delta, options, viewport));
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { pointer: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        root.current?.parentElement?.classList.add('surface-resizing');
        event.preventDefault();
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (current?.pointer === event.pointerId) resize(sidebarWidth(current.width + (event.clientX - current.x) * delta, options, viewport));
      }}
      onPointerUp={() => { drag.current = null; root.current?.parentElement?.classList.remove('surface-resizing'); }}
      onPointerCancel={() => { drag.current = null; root.current?.parentElement?.classList.remove('surface-resizing'); }}
      onLostPointerCapture={() => { drag.current = null; root.current?.parentElement?.classList.remove('surface-resizing'); }}
    />
  </aside>;
}
