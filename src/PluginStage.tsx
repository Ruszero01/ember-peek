import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { GripHorizontal } from "lucide-react";
import { useT } from "./i18n";
import type { Session } from "./types";
import { keepViewMounted, visitView } from "./recentViews";
import { PluginSidebar } from './PluginSidebar';
import type { SidebarOptions, OverlayOptions } from './surfaces.mjs';
import { overlaySize } from './surfaces.mjs';

type Position = { x: number; y: number };
type Size = { width: number; height: number };
/** Height of the host's drag strip. The declared panel size stays the content area. */
const STRIP = 12;
const storageKey = "ember.overlay-positions";
/** Breathing room a panel keeps from the viewport it belongs to, on every side. */
const INSET = 16;
/**
 * Where a panel starts before the user moves it. The layer *is* the viewport the host handed
 * this plugin, so a margin measured from that viewport is right in both viewport modes: the
 * host has already decided whether the chrome overlaps the content. The remembered position
 * is used after the first drag.
 */
function defaultPoint(
  anchor: string | undefined,
  index: number,
  card: Size,
  layer: Size,
): Position {
  const name = anchor ?? "topRight";
  const bottom = name.startsWith("bottom");
  const right = name.endsWith("Right");
  const freeW = Math.max(0, layer.width - card.width);
  const freeH = Math.max(0, layer.height - card.height);
  // Panels sharing a corner cascade inward instead of landing on top of each other.
  const cascade = Math.min(Math.max(index, 0) * 32, freeH);
  const x = right ? freeW - Math.min(INSET, freeW) : Math.min(INSET, freeW);
  const y = bottom
    ? freeH - Math.min(INSET, freeH) - cascade
    : Math.min(INSET, freeH) + cascade;
  return {
    x: freeW ? Math.max(0, Math.min(1, x / freeW)) : 0,
    y: freeH ? Math.max(0, Math.min(1, y / freeH)) : 0,
  };
}
function loadPositions(): Record<string, Position> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return Object.fromEntries(
      Object.entries(value).filter(([, p]) => {
        const point = p as Position;
        return (
          point &&
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 0 &&
          point.x <= 1 &&
          point.y >= 0 &&
          point.y <= 1
        );
      }),
    ) as Record<string, Position>;
  } catch {
    return {};
  }
}
export function PluginStage({
  sessions,
  active,
  children,
  expanded,
  sidebar,
  overlayBehaviors = {},
  chromeShown = true,
}: {
  expanded: string[];
  sidebar?: { open: boolean; options: SidebarOptions };
  overlayBehaviors?: Record<string, OverlayOptions>;
  chromeShown?: boolean;
  sessions: Session[];
  active: Session | undefined;
  /** `role` tells the mount which surface it is: the plugin's view, or its floating panel. */
  children: (
    session: Session,
    visible: boolean,
    role: "view" | "panel" | "sidebar",
  ) => ReactNode;
}) {
  const t = useT();
  const [positions, setPositions] = useState(loadPositions);
  const [dragging, setDragging] = useState<string>();
  const [front, setFront] = useState<string>();
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const resizeDrag = useRef<{ id: string; pointer: number; x: number; y: number; width: number; height: number; strip: number } | null>(null);
  // Keep a bounded visit order. Only unfinished background views stay mounted; completed
  // views can be rebuilt from the runtime cache if the user returns to them.
  const [recentViews, setRecentViews] = useState<string[]>([]);
  useEffect(() => {
    if (!active?.id) return;
    setRecentViews((old) => visitView(old, active.id));
  }, [active?.id]);
  // The viewport a panel is placed in, measured rather than assumed: it is the window in
  // immersive mode and the band between the chrome bars otherwise.
  const layer = useRef<HTMLElement | null>(null);
  const [layerSize, setLayerSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = layer.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      setLayerSize((old) =>
        old.width === width && old.height === height ? old : { width, height },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    if (typeof ResizeObserver !== "function")
      return () => window.removeEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const drag = useRef<
    | {
        id: string;
        pointer: number;
        x: number;
        y: number;
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);
  function start(
    event: PointerEvent<HTMLElement>,
    id: string,
    point: Position,
  ) {
    if (event.button !== 0) return;
    const card = event.currentTarget.parentElement!;
    const area = card.parentElement!;
    const width = Math.max(0, area.clientWidth - card.offsetWidth);
    const height = Math.max(0, area.clientHeight - card.offsetHeight);
    drag.current = {
      id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      // A panel is placed with left/top percentages plus a matching negative translate, so
      // what the user sees is `point * freeSpace`. offsetLeft/offsetTop are measured before
      // that translate and made the panel trail the cursor by its own width and height.
      left: point.x * width,
      top: point.y * height,
      width,
      height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(id);
    setFront(id);
    event.preventDefault();
  }
  function move(event: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const point = {
      x: d.width ? clamp((d.left + event.clientX - d.x) / d.width) : 0,
      y: d.height ? clamp((d.top + event.clientY - d.y) / d.height) : 0,
    };
    setPositions((old) => ({ ...old, [d.id]: point }));
  }
  function remember(next: Record<string, Position>) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Position remains usable in memory. */
    }
  }
  function finish() {
    if (!drag.current) return;
    drag.current = undefined;
    setDragging(undefined);
    setPositions((old) => {
      remember(old);
      return old;
    });
  }
  function reset(id: string) {
    setPositions((old) => {
      const next = { ...old };
      delete next[id];
      remember(next);
      return next;
    });
  }
  const panels = sessions.filter((s) => s.capabilities.includes("overlay"));
  // A panel belongs to the surface it decorates: a plugin that also owns a view only shows
  // its panel while that view is the one on screen, otherwise its panel would float over
  // another plugin's content with nothing to act on.
  const current = panels.filter(
    (s) =>
      s.available &&
      s.fileId === active?.fileId &&
      (!s.capabilities.includes("view") || s.id === active?.id),
  );
  return (
    <div className="plugin-stage">
      {active?.available && sidebar?.open && <PluginSidebar key={active.id} options={sidebar.options} persistenceKey={`${active.pluginId}:${sidebar.options.side}`} label={t('stage.sidebarWidth')}>{children(active, true, 'sidebar')}</PluginSidebar>}
      <div className="plugin-primary">
      {sessions
        // The main viewport shows one source at a time, like a monitor switching inputs:
        // only the active view is mounted, so hidden plugins cost nothing while another
        // one is on screen. The exception is a session holding an unsaved draft — its view
        // must stay alive, because the draft only exists inside that view.
        .filter((s) => {
          if (!s.capabilities.includes("view"))
            return !s.capabilities.includes("overlay");
          return keepViewMounted(s, active?.id, recentViews);
        })
        .map((session) => (
          <div key={session.id} className="contribution-frame">
            {children(
              session,
              session.available &&
                session.fileId === active?.fileId &&
                session.id === active?.id,
              "view",
            )}
          </div>
        ))}
      </div>
      <aside
        className={`overlay-stack ${dragging ? "dragging" : ""}`}
        aria-label={t("stage.overlays")}
        hidden={!current.length}
        ref={layer}
      >
        {panels.map((session) => {
          const index = current.findIndex((s) => s.id === session.id);
          const open = expanded.includes(session.pluginId);
          // A closed panel is not mounted at all: hiding it would still leave a whole plugin
          // UI running in a zero-sized frame, which is exactly the cost this model avoids.
          if (index < 0 || !open) return null;
          const behavior = overlayBehaviors[session.id] ?? { movable: true, resizable: false, followToolbar: false };
          const strip = behavior.movable ? STRIP : 0;
          const size = behavior.resizable ? sizes[session.pluginId] : undefined;
          const point =
            (behavior.movable && positions[session.pluginId]) ||
            defaultPoint(
              session.overlay?.anchor,
              index,
              {
                width: session.overlay!.width,
                height: session.overlay!.height + strip,
              },
              // Before the layer has been measured (nothing open yet), the window is the
              // closest honest answer; the layer is the window in immersive mode anyway.
              layerSize.width && layerSize.height
                ? layerSize
                : { width: window.innerWidth, height: window.innerHeight },
            );
          return (
            <section
              key={session.id}
              className="overlay-slot"
              data-follow-toolbar={behavior.followToolbar ? 'true' : 'false'}
              aria-hidden={behavior.followToolbar && !chromeShown}
              style={{
                visibility: behavior.followToolbar && !chromeShown ? 'hidden' : undefined,
                minWidth: behavior.resizable ? Math.min(120, layerSize.width) : undefined,
                minHeight: behavior.resizable ? Math.min(24 + strip, layerSize.height) : undefined,
                width: size?.width ?? session.overlay!.width,
                height: size?.height ?? session.overlay!.height + strip,
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                transform: `translate(${-point.x * 100}%, ${-point.y * 100}%)`,
                zIndex: front === session.pluginId ? 2 : 1,
              }}
            >
              {behavior.movable && <header
                onPointerDown={(e) => start(e, session.pluginId, point)}
                onPointerMove={move}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onDoubleClick={() => reset(session.pluginId)}
                title={t("stage.dragHint")}
              >
                <GripHorizontal size={12} className="overlay-grip" />
              </header>}
              <div className="overlay-body">
                {children(session, !behavior.followToolbar || chromeShown, "panel")}
              </div>
              {behavior.resizable && <div className="overlay-resizer" role="button" tabIndex={0} aria-label={t('stage.resizeHint')}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  const rect = event.currentTarget.parentElement!.getBoundingClientRect();
                  setSizes(old => ({ ...old, [session.pluginId]: overlaySize({
                    width: rect.width + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0),
                    height: rect.height + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0),
                  }, layerSize, strip) }));
                }}
                onPointerDown={event => {
                  if (event.button !== 0) return;
                  const rect = event.currentTarget.parentElement!.getBoundingClientRect();
                  resizeDrag.current = { id: session.pluginId, pointer: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, strip };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging(session.pluginId); setFront(session.pluginId); event.preventDefault();
                }}
                onPointerMove={event => {
                  const d = resizeDrag.current;
                  if (!d || d.pointer !== event.pointerId) return;
                  setSizes(old => ({ ...old, [d.id]: overlaySize({
                    width: d.width + event.clientX - d.x,
                    height: d.height + event.clientY - d.y,
                  }, layerSize, d.strip) }));
                }}
                onPointerUp={() => { resizeDrag.current = null; setDragging(undefined); }}
                onPointerCancel={() => { resizeDrag.current = null; setDragging(undefined); }}
                onLostPointerCapture={() => { resizeDrag.current = null; setDragging(undefined); }}
              />}
              {session.status !== "ready" && (
                <p>{session.error || t("stage.loading")}</p>
              )}
            </section>
          );
        })}
      </aside>
    </div>
  );
}
