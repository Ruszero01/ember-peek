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
}: {
  expanded: string[];
  sessions: Session[];
  active: Session | undefined;
  /** `role` tells the mount which surface it is: the plugin's view, or its floating panel. */
  children: (
    session: Session,
    visible: boolean,
    role: "view" | "panel",
  ) => ReactNode;
}) {
  const t = useT();
  const [positions, setPositions] = useState(loadPositions);
  const [dragging, setDragging] = useState<string>();
  const [front, setFront] = useState<string>();
  // Keep the current view and one recent view mounted. This makes quick back-and-forth
  // switching instant while placing a hard ceiling on retained WebView resources.
  const [recentViews, setRecentViews] = useState<string[]>([]);
  useEffect(() => {
    if (!active?.id) return;
    setRecentViews((old) => [
      active.id,
      ...old.filter((id) => {
        if (id === active.id) return false;
        const session = sessions.find((candidate) => candidate.id === id);
        return Boolean(session?.available && session.size <= 4 * 1024 * 1024);
      }),
    ].slice(0, 2));
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
    <>
      {sessions
        // The main viewport shows one source at a time, like a monitor switching inputs:
        // only the active view is mounted, so hidden plugins cost nothing while another
        // one is on screen. The exception is a session holding an unsaved draft — its view
        // must stay alive, because the draft only exists inside that view.
        .filter((s) => {
          if (!s.capabilities.includes("view"))
            return !s.capabilities.includes("overlay");
          return s.id === active?.id || s.pending || recentViews.includes(s.id);
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
          const point =
            positions[session.pluginId] ||
            defaultPoint(
              session.overlay?.anchor,
              index,
              {
                width: session.overlay!.width,
                height: session.overlay!.height + STRIP,
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
              style={{
                width: session.overlay!.width,
                height: session.overlay!.height + STRIP,
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                transform: `translate(${-point.x * 100}%, ${-point.y * 100}%)`,
                zIndex: front === session.pluginId ? 2 : 1,
              }}
            >
              <header
                onPointerDown={(e) => start(e, session.pluginId, point)}
                onPointerMove={move}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onDoubleClick={() => reset(session.pluginId)}
                title={t("stage.dragHint")}
              >
                <GripHorizontal size={12} className="overlay-grip" />
              </header>
              <div className="overlay-body">
                {children(session, true, "panel")}
              </div>
              {session.status !== "ready" && (
                <p>{session.error || t("stage.loading")}</p>
              )}
            </section>
          );
        })}
      </aside>
    </>
  );
}
