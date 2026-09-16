import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_VERSION, APP_VERSION_SHORT } from "./version";
import {
  FolderOpen,
  Package,
  Palette,
  Info,
  Settings2,
  Minus,
  Square,
  X,
  Sun,
  Moon,
  Monitor,
  Check,
  Search,
  Copy,
  Plus,
  Maximize,
  ChevronUp,
  ChevronDown,
  RotateCw,
  Download,
  Trash2,
  File,
  LoaderCircle,
  SlidersHorizontal,
  TextWrap,
  Save,
  RotateCcw,
  Hash,
  Code,
  GripVertical,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ScrubControl } from "./ScrubControl";
import { Toggle } from "./Toggle";
import { PluginView } from "./PluginView";
import { PluginStage } from "./PluginStage";
import { PluginDetails } from "./PluginDetails";
import { PluginConfirm, type PluginAction } from "./PluginConfirm";
import { Marketplace } from "./Marketplace";
import { Welcome } from "./Welcome";
import { call, desktop, windowAction } from "./bridge";
import { Selection, isContributionCurrent } from "./protocol.mjs";
import { pluginIcon } from "./pluginIcons";
import type {
  Plugin,
  PluginSetting,
  Snapshot,
  Theme,
  ViewReport,
} from "./types";
import "./style.css";

const initial: Snapshot = {
  plugins: [],
  sessions: [],
  active: null,
  warnings: [],
  pluginDirectory: "",
  // Nothing is shown until the host answers, and the chooser is the host's decision.
  onboarded: true,
};
const icons: Record<string, typeof Search> = {
  search: Search,
  check: Check,
  copy: Copy,
  plus: Plus,
  minus: Minus,
  fit: Maximize,
  actual: Square,
  up: ChevronUp,
  down: ChevronDown,
  "text-wrap": TextWrap,
  save: Save,
  "rotate-ccw": RotateCcw,
  hash: Hash,
  code: Code,
};
const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`;
type Settings = { theme: "light" | "dark" | "system"; immersive: boolean };
function savedSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem("ember.settings") || "{}");
    return {
      theme: ["light", "dark", "system"].includes(v.theme) ? v.theme : "system",
      immersive: v.immersive !== false,
    };
  } catch {
    return { theme: "system", immersive: true };
  }
}

const settingsWindow =
  new URLSearchParams(location.search).get("window") === "settings";

/**
 * One declared plugin setting. The control comes from the manifest declaration, so a
 * plugin never ships form markup. Text and number inputs keep a local draft and commit
 * on change/blur, so re-rendering from a refreshed snapshot cannot fight the caret.
 */
function SettingField({
  setting,
  value,
  busy,
  onChange,
}: {
  setting: PluginSetting;
  value: unknown;
  busy: boolean;
  onChange: (value: unknown) => void;
}) {
  const current = value === undefined ? setting.default : value;
  const numeric = setting.type === "number";
  const displayMultiplier = numeric ? (setting.displayMultiplier ?? 1) : 1;
  const displayMin = numeric && setting.min !== undefined
    ? setting.min * displayMultiplier
    : undefined;
  const displayMax = numeric && setting.max !== undefined
    ? setting.max * displayMultiplier
    : undefined;
  const displayStep = numeric
    ? (setting.step ?? 1) * displayMultiplier
    : 1;
  const displayed = numeric
    ? String(Math.round(Number(current) * displayMultiplier))
    : String(current ?? "");
  const [draft, setDraft] = useState(() => displayed);
  // Re-sync when the stored value changes from elsewhere (reset, another window,
  // a refreshed snapshot after a failed save). Edited drafts are only pushed, never
  // pulled mid-typing, so this cannot fight the caret.
  useEffect(() => setDraft(displayed), [displayed]);

  if (setting.type === "bool")
    return (
      <div className="setting-row">
        <SettingLabel setting={setting} />
        <div className="setting-control">
          <Toggle
            checked={Boolean(current)}
            label={setting.label}
            busy={busy}
            onChange={onChange}
          />
        </div>
      </div>
    );
  if (setting.type === "select")
    return (
      <div className="setting-row">
        <SettingLabel setting={setting} />
        <div className="setting-control">
          <select
            aria-label={setting.label}
            disabled={busy}
            value={String(current ?? "")}
            onChange={(event) => onChange(event.target.value)}
          >
            {setting.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );

  function commit() {
    if (!numeric) {
      if (draft !== String(current ?? "")) onChange(draft);
      return;
    }
    const parsed = Number(draft) / displayMultiplier;
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(displayed);
      return;
    }
    if (parsed !== current) onChange(parsed);
  }
  function stepNumber(direction: -1 | 1) {
    const source = Number(draft);
    const currentDisplay = Number.isFinite(source)
      ? source
      : Number(current) * displayMultiplier;
    const stepped = currentDisplay + displayStep * direction;
    const bounded = Math.min(
      displayMax ?? Number.POSITIVE_INFINITY,
      Math.max(displayMin ?? Number.NEGATIVE_INFINITY, stepped),
    );
    const next = String(Math.round(bounded * 1e8) / 1e8);
    setDraft(next);
    onChange(bounded / displayMultiplier);
  }
  return (
    <div className="setting-row">
      <SettingLabel setting={setting} />
      <div className="setting-control">
        <span className={`setting-input${numeric && setting.suffix ? " has-suffix" : ""}`}>
          <input
          aria-label={setting.label}
          disabled={busy}
          type={setting.type === "number" ? "number" : "text"}
          {...(setting.type === "number"
            ? {
                min: displayMin,
                max: displayMax,
                step: displayStep,
              }
            : {})}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            // Text commits per keystroke; there is no partial value the host could
            // reject into a surprising state. Numbers commit on blur or Enter instead.
            if (!numeric && event.target.value !== String(current ?? ""))
              onChange(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            else if (event.key === "Escape") setDraft(displayed);
          }}
          />
          {numeric && setting.suffix && (
            <span className="setting-input-suffix" aria-hidden="true">
              {setting.suffix}
            </span>
          )}
          {numeric && (
            <span className="setting-number-stepper">
              <button
                type="button"
                tabIndex={-1}
                aria-label={`增大${setting.label}`}
                disabled={busy || (displayMax !== undefined && Number(draft) >= displayMax)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => stepNumber(1)}
              >
                <ChevronUp size={10} />
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`减小${setting.label}`}
                disabled={busy || (displayMin !== undefined && Number(draft) <= displayMin)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => stepNumber(-1)}
              >
                <ChevronDown size={10} />
              </button>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SettingLabel({ setting }: { setting: PluginSetting }) {
  return (
    <span className="setting-label">
      <strong>{setting.label}</strong>
      {setting.help && <small>{setting.help}</small>}
    </span>
  );
}

/**
 * The settings page of one plugin, reached from the sidebar. The host owns this page
 * entirely: it renders whatever the plugin declared and persists every change, so a
 * plugin never ships settings markup.
 */
function ActivationSettings({ plugin }: { plugin: Plugin }) {
  const [activation, setActivation] = useState(plugin.activation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => setActivation(plugin.activation),
    [plugin.id, plugin.activation.mode, plugin.activation.priority],
  );
  async function update(next: Plugin["activation"]) {
    setActivation(next);
    setBusy(true);
    setError("");
    try {
      await call("set_activation", { id: plugin.id, activation: next });
    } catch (error) {
      setActivation(plugin.activation);
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="plugin-activation"
      title="自动激活：打开文件时按左侧列表顺序选择；没有自动激活的视口时使用可用视口。"
    >
      <Toggle
        label="自动激活"
        checked={activation.mode === "auto"}
        busy={busy}
        onChange={(value) =>
          void update({ ...activation, mode: value ? "auto" : "manual" })
        }
      />
      <span className="plugin-activation-label">自动激活</span>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PluginSettingsPane({ plugin }: { plugin: Plugin | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Values the user just chose, kept until a snapshot confirms them.
  //
  // The host polls `desktop_snapshot` on a timer and `poll` applies whatever arrives
  // unconditionally. A poll already in flight when the user clicks therefore lands
  // after the save carrying the pre-click value, which snaps the control back and then
  // forward again. A pending choice is shown until a snapshot agrees with it, so a late
  // reply cannot undo an edit the user just made.
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const pluginId = plugin?.id;
  const confirmed = plugin?.values;

  // A pending choice stops mattering the moment the snapshot reports that same value.
  // The runtime persists before answering, so this always happens; it is never cleared
  // on a timeout, and it is dropped when switching plugins so it cannot leak across.
  useEffect(() => {
    setPending((current) => {
      if (!confirmed) return {};
      const kept = Object.entries(current).filter(
        ([key, value]) => !(key in confirmed) || confirmed[key] !== value,
      );
      return kept.length === Object.keys(current).length
        ? current
        : Object.fromEntries(kept);
    });
  }, [confirmed]);
  useEffect(() => setPending({}), [pluginId]);

  if (!plugin)
    return (
      <section className="card">
        <p className="quiet-note">该插件已不可用，请刷新插件列表。</p>
      </section>
    );
  const Icon = pluginIcon(plugin.icon);
  const values = plugin.values ?? {};

  async function change(key: string, value: unknown) {
    if (!plugin) return;
    setPending((current) => ({ ...current, [key]: value }));
    setBusy(true);
    setError("");
    try {
      await call("set_plugin_setting", { id: plugin.id, key, value });
    } catch (problem) {
      setError(String(problem));
      // Nothing was stored, so stop claiming the value the user picked.
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="plugin-head">
          <span className="plugin-icon">
            <Icon size={23} />
          </span>
          <div>
            <h2>
              {plugin.name}
              <span className="plugin-version">v{plugin.version}</span>
            </h2>
            <p>
              {plugin.enabled
                ? "已启用"
                : "已停用：插件停用期间无法打开对应格式，设置仍然保留"}
            </p>
          </div>
          <ActivationSettings key={plugin.id} plugin={plugin} />
        </div>
        {plugin.settings.length ? (
          <div className="setting-list">
            {plugin.settings.map((setting) => (
              <SettingField
                key={`${plugin.id}:${setting.key}`}
                setting={setting}
                value={
                  setting.key in pending
                    ? pending[setting.key]
                    : values[setting.key]
                }
                busy={busy || !plugin.enabled}
                onChange={(value) => void change(setting.key, value)}
              />
            ))}
          </div>
        ) : (
          <p className="quiet-note">此插件暂无额外设置。</p>
        )}
      </section>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

type DesktopStatus = {
  revision: number;
  error: string | null;
  settingsPage: string;
  settingsRevision: number;
};

function DelayedLoading({ visible, name }: { visible: boolean; name: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), 140);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible || !shown) return null;
  return (
    <div className="surface-state">
      <LoaderCircle size={25} className="spinner" />
      <strong>正在加载 {name}</strong>
      <p>可以继续打开其他文件，此任务会在后台完成</p>
    </div>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const [page, setPage] = useState<
    "preview" | "general" | "plugins" | "about" | "plugin" | "welcome"
  >(settingsWindow ? "general" : "preview");
  // Which plugin the "plugin" page is configuring. Kept beside `page` so selecting a
  // plugin does not have to encode the plugin id into the page state itself.
  const [pluginPage, setPluginPage] = useState<string | null>(null);
  const [settings, setSettings] = useState(savedSettings);
  const [theme, setTheme] = useState<Theme>({});
  const [reports, setReports] = useState<Record<string, ViewReport>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [pluginTab, setPluginTab] = useState<"market" | "installed">("market");
  const [hot, setHot] = useState("");
  const [scrubbingControl, setScrubbingControl] = useState(false);
  const [opening, setOpening] = useState(false);
  const selection = useRef(new Selection());
  const senders = useRef(
    new Map<string, (id: string, value?: unknown) => void>(),
  );
  // A control can be clicked before its plugin is on screen: only the current view is
  // mounted, so switching to it and immediately sending would reach nobody. The action waits
  // here until that view connects, and is dropped if it never does.
  const queuedActions = useRef(
    new Map<string, { id: string; value?: unknown; at: number }[]>(),
  );
  // Which controls each session has actually declared. Connecting is not the same as being
  // ready: the view publishes its controls only once its own script has run, and an action
  // sent before that is dropped by the plugin with no way to tell.
  const publishedControls = useRef(new Map<string, Set<string>>());
  // One plugin can be mounted twice (view + panel). Those two mounts are separate
  // documents that cannot see each other, so the host keeps the pipe between them: it
  // forwards opaque payloads and never looks inside.
  const peers = useRef(
    new Map<string, Map<string, (payload: unknown, from: string) => void>>(),
  );
  const registerPeer = useCallback(
    (
      id: string,
      role: string,
      send: ((payload: unknown, from: string) => void) | null,
    ) => {
      const mounted = peers.current.get(id) ?? new Map();
      if (send) mounted.set(role, send);
      else mounted.delete(role);
      if (mounted.size) peers.current.set(id, mounted);
      else peers.current.delete(id);
    },
    [],
  );
  const current = snapshot.sessions.find((s) => s.id === active);
  /**
   * The host owns the viewport. In immersive mode a plugin gets the whole window and the two
   * chrome bars float above it; otherwise the plugin gets exactly the band the bars leave
   * between them, so neither bar can cover content or steal a pointer meant for the plugin.
   * The band comes from flex layout. Insets additionally reserve scrollable edge space,
   * measured independently of the chrome reveal animation.
   */
  const windowViewport = settings.immersive || !current;
  const [safeInsets, setSafeInsets] = useState({ top: 44, bottom: 44 });
  useLayoutEffect(() => {
    if (page !== "preview") return;
    const root = document.querySelector<HTMLElement>(".preview-app");
    const top = root?.querySelector<HTMLElement>(".title-layer");
    const bottom = root?.querySelector<HTMLElement>(".preview-overlays");
    if (!root || !top || !bottom) return;
    const measure = () => {
      const fade =
        parseFloat(
          getComputedStyle(
            root.querySelector(".preview-canvas") || root,
          ).getPropertyValue("--viewport-fade"),
        ) || 0;
      // Use layout dimensions, never animated rectangles: revealing chrome must not reflow text.
      const next = {
        top: Math.ceil(
          Math.max(
            fade,
            windowViewport
              ? top.offsetHeight + (parseFloat(getComputedStyle(top).top) || 0)
              : 0,
          ) + (windowViewport ? 8 : 6),
        ),
        bottom: Math.ceil(
          Math.max(
            fade,
            windowViewport
              ? bottom.offsetHeight +
                  (parseFloat(getComputedStyle(bottom).bottom) || 0)
              : 0,
          ) + (windowViewport ? 8 : 6),
        ),
      };
      setSafeInsets((old) =>
        old.top === next.top && old.bottom === next.bottom ? old : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(top);
    observer.observe(bottom);
    observer.observe(root);
    return () => observer.disconnect();
  }, [page, windowViewport]);
  const viewTheme = useMemo(
    () => ({
      ...theme,
      "safe-top": `${safeInsets.top}px`,
      "safe-bottom": `${safeInsets.bottom}px`,
    }),
    [theme, safeInsets],
  );
  const chromeShown = scrubbingControl || !settings.immersive || hot !== "" || !current;
  const viewReport = active ? reports[active] : undefined;
  const contributors = snapshot.sessions
    .filter((s) => s.fileId === current?.fileId && s.available)
    .sort((a, b) => a.label.localeCompare(b.label));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [focusedTool, setFocusedTool] = useState<string | null>(null);
  const focusSequence = useRef(0);
  async function focusContribution(id: string) {
    const ticket = ++focusSequence.current;
    const contributor = snapshot.sessions.find(
      (s) => s.id === id && s.available,
    );
    if (!contributor) return false;
    if (contributor.capabilities.includes("view")) {
      if (id !== active) await call("select_preview", { id });
      if (ticket !== focusSequence.current) return false;
      setActive(id);
    } else if (contributor.capabilities.includes("overlay")) {
      setExpanded((old) =>
        old.includes(contributor.pluginId)
          ? old
          : [...old.slice(-2), contributor.pluginId],
      );
    }
    setFocusedTool(id);
    return true;
  }
  useEffect(() => {
    setExpanded(
      contributors
        .filter(
          (s) =>
            s.capabilities.includes("overlay") &&
            // A plugin that also owns a view keeps its panel shut until asked: auto-opening
            // it would cover the file the user just opened.
            !s.capabilities.includes("view") &&
            snapshot.plugins.find((p) => p.id === s.pluginId)?.activation
              .mode === "auto",
        )
        .slice(0, 3)
        .map((s) => s.pluginId),
    );
  }, [current?.fileId]);
  const register = useCallback(
    (id: string, send: ((id: string, value?: unknown) => void) | null) => {
      if (send) {
        senders.current.set(id, send);
        return;
      }
      senders.current.delete(id);
      // The view is gone, so what it had declared is gone with it: the next mount has to
      // announce its controls again before anything may be sent to it.
      publishedControls.current.delete(id);
    },
    [],
  );
  /** Send a control action, waiting for a view that is still mounting. */
  const sendControl = useCallback(
    (id: string, control: string, value?: unknown) => {
      const send = senders.current.get(id);
      if (send && publishedControls.current.get(id)?.has(control)) {
        send(control, value);
        return;
      }
      queuedActions.current.set(id, [
        ...(queuedActions.current.get(id) ?? []),
        { id: control, value, at: Date.now() },
      ]);
    },
    [],
  );
  const report = useCallback((id: string, value: Partial<ViewReport>) => {
    setReports((old) => ({
      ...old,
      [id]: {
        ...(old[id] ?? { controls: [], status: "" }),
        ...value,
      },
    }));
    // A view declares its controls once it is up, which is the first moment an action can
    // reach it. Anything clicked while it was still mounting is delivered now, and only if
    // that control is still on offer.
    if (!value.controls) return;
    publishedControls.current.set(
      id,
      new Set(value.controls.map((control) => control.id)),
    );
    const pending = queuedActions.current.get(id);
    if (!pending) return;
    queuedActions.current.delete(id);
    const send = senders.current.get(id);
    if (!send) return;
    const offered = publishedControls.current.get(id)!;
    for (const action of pending)
      if (offered.has(action.id) && Date.now() - action.at < 5000)
        send(action.id, action.value);
  }, []);
  const refresh = useCallback(async () => {
    const next = await call<Snapshot>("snapshot");
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let seenRevision = -1;
    let seenSettingsRevision = -1;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    let pending = false;
    let unlisten: (() => void) | undefined;
    const poll = async () => {
      clearTimeout(timer);
      if (disposed) return;
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      let loading = false;
      try {
        const { snapshot: next, status } = await call<{
          snapshot: Snapshot;
          status: DesktopStatus;
        }>("desktop_snapshot");
        if (!disposed) {
          loading = next.sessions.some(
            (session) =>
              session.status === "loading" ||
              (session.id === next.active &&
                session.status === "ready" &&
                !session.viewReady),
          );
          setSnapshot(next);
          setActive(next.active);
          if (status.revision !== seenRevision) {
            seenRevision = status.revision;
            if (!settingsWindow) {
              setError(status.error || "");
            }
          }
          if (
            settingsWindow &&
            status.settingsRevision !== seenSettingsRevision
          ) {
            seenSettingsRevision = status.settingsRevision;
            setPage(
              status.settingsPage === "plugins"
                ? "plugins"
                : status.settingsPage === "about"
                  ? "about"
                  : status.settingsPage === "welcome"
                    ? "welcome"
                    : "general",
            );
          }
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        inFlight = false;
        // Completion is noticed quickly without paying that polling cost while idle.
        if (!disposed) timer = setTimeout(poll, pending ? 0 : loading ? 50 : 650);
        pending = false;
      }
    };
    void getCurrentWindow()
      .listen("desktop-changed", () => void poll())
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error) => {
        if (!disposed) setError(String(error));
      });
    void poll();
    return () => {
      unlisten?.();
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const ids = new Set(snapshot.sessions.map((s) => s.id));
    setReports((old) =>
      Object.fromEntries(Object.entries(old).filter(([id]) => ids.has(id))),
    );
  }, [
    snapshot.sessions
      .map((s) => s.id)
      .sort()
      .join("|"),
  ]);
  useEffect(() => {
    localStorage.setItem("ember.settings", JSON.stringify(settings));
    const system = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? system.matches
            ? "dark"
            : "light"
          : settings.theme;
      const css = getComputedStyle(document.documentElement);
      setTheme(
        Object.fromEntries(
          [
            "bg",
            "panel",
            "card",
            "raised",
            "hover",
            "border",
            "text",
            "muted",
            "faint",
            "accent",
            "accent-bg",
            "canvas",
            "radius-control",
            "radius-pill",
            "radius-card",
            "control-h",
            "control-h-sm",
            "space-1",
            "space-2",
            "space-3",
            "space-4",
            "font-ui",
            "font-mono",
            "mono-size",
            "mono-leading",
            "field-label-w",
          ].map((key) => [key, css.getPropertyValue(`--${key}`).trim()]),
        ),
      );
    };
    update();
    system.addEventListener("change", update);
    return () => system.removeEventListener("change", update);
  }, [settings]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "ember.settings") setSettings(savedSettings());
    };
    addEventListener("storage", changed);
    return () => removeEventListener("storage", changed);
  }, []);
  function settingsPage(page: "general" | "plugins") {
    if (desktop) void guard(() => call("show_settings", { page }));
    else setPage(page);
  }
  async function guard(action: () => Promise<unknown>) {
    setError("");
    try {
      return await action();
    } catch (e) {
      setError(String(e));
    }
  }
  async function open(path: string) {
    const ticket = selection.current.begin();
    setOpening(true);
    setError("");
    try {
      await call("open_file", { path });
      if (!selection.current.current(ticket)) return;
      await refresh();
      // The native selection is authoritative, including Explorer and tray requests.
    } catch (e) {
      if (selection.current.current(ticket)) setError(String(e));
    } finally {
      if (selection.current.current(ticket)) setOpening(false);
    }
  }
  async function pick() {
    await guard(async () => {
      const path = await call<string | null>("pick_path", { folder: false });
      if (path) await open(path);
    });
  }
  async function select(id: string | null) {
    const ticket = selection.current.begin();
    setOpening(false);
    await guard(async () => {
      await call("select_preview", { id });
      if (selection.current.current(ticket)) {
        await refresh();
      }
    });
  }
  const shortcutRef = useRef<(key: string) => void>(() => {});
  shortcutRef.current = (key) => {
    if (key === "open") void pick();
    if (key === "settings") settingsPage("general");
    if (key === "toggle" && !settingsWindow) void windowAction("close");
    if (key === "escape") {
      void windowAction("close");
    }
  };
  const shortcut = useCallback((key: string) => shortcutRef.current(key), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "o") {
        event.preventDefault();
        shortcut("open");
      } else if (event.key === "Escape") shortcut("escape");
      else if (
        event.code === "Space" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !settingsWindow &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,button,[contenteditable],[role=textbox]",
          )
        )
      ) {
        event.preventDefault();
        shortcut("toggle");
      }
    };
    addEventListener("keydown", key);
    let cleanup: (() => void) | undefined;
    let disposed = false;
    if (desktop)
      void getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === "drop" && event.payload.paths[0])
            void open(event.payload.paths[0]);
        })
        .then((un) => {
          if (disposed) un();
          else cleanup = un;
        });
    return () => {
      disposed = true;
      cleanup?.();
      removeEventListener("keydown", key);
    };
  }, []);
  async function manage(action: () => Promise<unknown>) {
    setBusy(true);
    await guard(async () => {
      await action();
      await refresh();
    });
    setBusy(false);
  }
  const [pluginAction, setPluginAction] = useState<PluginAction | null>(null);
  async function install() {
    await manage(async () => {
      const path = await call<string | null>("pick_path", { folder: true });
      if (path) setPluginAction({ name: "本地插件", detail: path, kind: "install", run: async progress => {
        progress("正在校验并安装本地插件…"); await call("install_plugin", { path }); progress("正在刷新插件列表…"); await refresh();
      } });
    });
  }
  const title = (
    <header className="titlebar">
      <div
        className="brand"
        onMouseDown={(e) => {
          if (e.button === 0) void windowAction("startDragging");
        }}
      >
        <BrandMark size={21} />
        <span>
          ember<span className="brand-light">peek</span>
        </span>
        <span className="version">{APP_VERSION_SHORT}</span>
      </div>
      <div
        className="drag-zone"
        onMouseDown={(e) => {
          if (e.button === 0) void windowAction("startDragging");
        }}
        onDoubleClick={() => {
          // In immersive mode this row is under the plugin's content and does not take the
          // pointer at all, so a double click here only reaches the window when it is safe.
          if (settings.immersive) void windowAction("toggleMaximize");
        }}
      />
      <div className="window-buttons">
        <button title="最小化" onClick={() => void windowAction("minimize")}>
          <Minus size={15} />
        </button>
        <button
          title="最大化 / 还原"
          onClick={() => void windowAction("toggleMaximize")}
        >
          <Square size={12} />
        </button>
        <button
          className="window-close"
          title="关闭"
          onClick={() => void windowAction("close")}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
  const retainedViews = useMemo(
    () => (settingsWindow ? [] : snapshot.sessions),
    [snapshot.sessions],
  );
  // Views are addressed by plugin id, so a settings change reaches every open
  // session of that plugin without the view having to ask for it.
  const pluginSettings = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const plugin of snapshot.plugins) map[plugin.id] = plugin.values ?? {};
    return map;
  }, [snapshot.plugins]);
  const [dragPlugin, setDragPlugin] = useState<string | null>(null);
  const [dropPlugin, setDropPlugin] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  const [sortingPlugins, setSortingPlugins] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const orderedPlugins = [...snapshot.plugins].sort(
    (a, b) =>
      pendingOrder ? pendingOrder.indexOf(a.id) - pendingOrder.indexOf(b.id) : b.activation.priority - a.activation.priority || a.id.localeCompare(b.id),
  );
  async function reorderPlugin(target: string, after: boolean, keyboardSource?: string) {
    const source = keyboardSource ?? dragPlugin;
    setDragPlugin(null);
    setDropPlugin(null);
    if (!source || source === target || sortingPlugins) return;
    const ids = orderedPlugins.map((p) => p.id).filter((id) => id !== source);
    const targetIndex = ids.indexOf(target);
    if (targetIndex < 0) return;
    ids.splice(targetIndex + (after ? 1 : 0), 0, source);
    setPendingOrder(ids);
    setSortingPlugins(true);
    try {
      await guard(async () => {
        await call("reorder_plugins", { ids });
        await refresh();
      });
    } finally {
      setPendingOrder(null);
      setSortingPlugins(false);
    }
  }
  const currentPlugin = useMemo(
    () => snapshot.plugins.find((plugin) => plugin.id === pluginPage),
    [snapshot.plugins, pluginPage],
  );
  return (
    <div
      className={`app ${page === "preview" ? "preview-app" : "settings-app"}`}
      data-viewport={windowViewport ? "window" : "band"}
    >
      {pluginAction && <PluginConfirm action={pluginAction} onClose={() => setPluginAction(null)} />}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button title="关闭提示" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {!desktop && (
        <div className="browser-banner">
          界面预览 · 文件和插件功能请使用桌面窗口
        </div>
      )}
      <div
        className="preview-canvas"
        style={{ visibility: page === "preview" ? "visible" : "hidden" }}
      >
        <PluginStage
          expanded={expanded}
          sessions={retainedViews}
          active={page === "preview" ? current : undefined}
        >
          {(session, visible, role) => {
            // A panel mount of a plugin that also owns a view is secondary: it may draw and
            // call native methods, but it never reports controls or session state.
            const secondary =
              role === "panel" && session.capabilities.includes("view");
            return session.status === "ready" ? (
              <PluginView
                key={`${session.id}-${role}`}
                session={session}
                role={role}
                visible={visible && page === "preview"}
                interactive={
                  session.available &&
                  session.fileId === current?.fileId &&
                  page === "preview" &&
                  (role === "panel" || session.id === active)
                }
                theme={role === "panel" ? theme : viewTheme}
                settings={pluginSettings[session.pluginId]}
                controls={
                  secondary ? [] : (reports[session.id]?.controls ?? [])
                }
                report={report}
                register={register}
                registerPeer={registerPeer}
                peer={(to, payload) => {
                  const target = peers.current.get(session.id)?.get(to);
                  // The other mount may legitimately be absent: a view still broadcasts its
                  // state while its panel is closed. Report that instead of inventing it.
                  if (!target) return false;
                  target(payload, role);
                  return true;
                }}
                edge={setHot}
                shortcut={shortcut}
                panel={(open) =>
                  setExpanded((old) =>
                    open
                      ? [
                          ...old.filter((id) => id !== session.pluginId),
                          session.pluginId,
                        ]
                      : old.filter((id) => id !== session.pluginId),
                  )
                }
              />
            ) : null;
          }}
        </PluginStage>
        {!current && !opening && (
          <div className="empty-state">
            <div className="empty-art">
              <BrandMark size={43} />
            </div>
            <h1>即刻一览</h1>
            <p>拖入文件，或选择一个文件开始预览</p>
            <button className="primary-button" onClick={() => void pick()}>
              <FolderOpen size={16} />
              打开文件<kbd>Ctrl O</kbd>
            </button>
            <div className="format-hints">
              {snapshot.plugins.filter((p) => p.enabled).length
                ? `${snapshot.plugins.filter((p) => p.enabled).length} 个预览插件已就绪`
                : "尚未安装预览插件"}
              <button
                className="text-button"
                onClick={() => settingsPage("plugins")}
              >
                管理插件
              </button>
            </div>
          </div>
        )}
        <DelayedLoading
          visible={
            opening ||
            current?.status === "loading" ||
            Boolean(
              current?.status === "ready" &&
                !current.viewReady &&
                !viewReport?.error,
            )
          }
          name={current?.name || "文件"}
        />
        {(current?.status === "error" || viewReport?.error) && (
          <div className="surface-state">
            <Package size={30} />
            <strong>插件预览失败</strong>
            <p>{current?.error || viewReport?.error}</p>
            <button className="secondary-button" onClick={() => void pick()}>
              打开其他文件
            </button>
          </div>
        )}
      </div>
      {page === "preview" ? (
        <>
          <div
            className="edge top"
            onPointerEnter={(event) => {
              if (!event.buttons) setHot("top");
            }}
          />
          <div
            className="edge bottom"
            onPointerEnter={(event) => {
              if (!event.buttons) setHot("bottom");
            }}
          />
          <div
            className={`title-layer ${chromeShown ? "shown" : ""}`}
            onPointerEnter={() => setHot("top")}
            onPointerLeave={() => setHot("")}
          >
            {title}
          </div>
          <footer
            className={`preview-overlays ${chromeShown ? "shown" : ""}`}
            onPointerEnter={() => setHot("bottom")}
            onPointerLeave={() => setHot("")}
          >
            <div className="floating-file-info">
              <span className="file-icon">
                <File size={17} />
              </span>
              <div>
                <strong>{current?.name || "Ember Peek"}</strong>
                <span>
                  {current
                    ? `${bytes(current.size)} · ${viewReport?.status || current.pluginId}`
                    : "由插件提供每一种预览能力"}
                </span>
              </div>
            </div>
            <div className="preview-action-groups">
              {contributors.map((contributor) => {
                // The bubble of the plugin in front unfolds; the rest stay compact. A
                // panel-only plugin counts as in front while its panel is open.
                const isCurrent = isContributionCurrent(
                  contributor, active, focusedTool, expanded,
                );
                const items = reports[contributor.id]?.controls || [];
                return (
                  <div
                    className={`toolbar-actions plugin-bubble ${isCurrent ? "current" : ""}`}
                    key={contributor.id}
                    aria-label={contributor.label}
                  >
                    <button
                      className="plugin-activate"
                      aria-pressed={isCurrent}
                      title={contributor.error || `打开${contributor.label}`}
                      onClick={() =>
                        void guard(async () => {
                          if (
                            contributor.capabilities.includes("overlay") &&
                            // A plugin with both a view and a panel switches its view from
                            // the bubble; only a panel-only plugin toggles its panel here.
                            !contributor.capabilities.includes("view") &&
                            expanded.includes(contributor.pluginId)
                          ) {
                            setExpanded((old) =>
                              old.filter((id) => id !== contributor.pluginId),
                            );
                            return;
                          }
                          await focusContribution(contributor.id);
                        })
                      }
                    >
                      {contributor.label}
                      {/* The dot means the plugin is holding work it has not committed. */}
                      {contributor.pending ? " ●" : ""}
                      {contributor.status === "loading"
                        ? " …"
                        : contributor.status === "error"
                          ? " !"
                          : ""}
                    </button>
                    {/* Kept mounted so the fold can animate both ways; collapsed controls
                        are neither focusable nor announced. */}
                    <div
                      className={`bubble-controls ${isCurrent && items.length ? "open" : ""}`}
                      aria-hidden={!isCurrent}
                    >
                      <div className="bubble-controls-inner">
                        {items.map((control) => {
                          if (control.kind === "scrub") return <ScrubControl key={control.id} control={control} active={isCurrent} onActiveChange={setScrubbingControl} onChange={value => sendControl(contributor.id, control.id, value)} />;
                          const Icon =
                            icons[control.icon || ""] || SlidersHorizontal;
                          return (
                            <button
                              key={control.id}
                              tabIndex={isCurrent ? 0 : -1}
                              title={control.label}
                              aria-label={control.label}
                              aria-pressed={
                                control.kind === "toggle"
                                  ? Boolean(control.active)
                                  : undefined
                              }
                              className={
                                control.kind === "toggle" && control.active
                                  ? "on"
                                  : ""
                              }
                              onClick={() =>
                                void guard(async () => {
                                  if (
                                    !(await focusContribution(contributor.id))
                                  )
                                    return;
                                  // Controls are opaque to the host: it focuses the plugin and
                                  // forwards the id. What the plugin does with it is its own
                                  // business, including opening its own panel.
                                  sendControl(contributor.id, control.id);
                                })
                              }
                            >
                              <Icon size={16} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="toolbar-host-actions">
                <button title="打开文件" onClick={() => void pick()}>
                  <FolderOpen size={16} />
                </button>
                <button title="设置" onClick={() => settingsPage("general")}>
                  <Settings2 size={16} />
                </button>
              </div>
            </div>
          </footer>
        </>
      ) : page === "welcome" ? (
        <Welcome
          onDone={async () => {
            setPage("plugins");
            setPluginTab("market");
          }}
        />
      ) : (
        <>
          {title}
          <div className="settings-layout">
            <aside className="sidebar">
              <div className="sidebar-content">
                <div className="sidebar-heading">设置</div>
                {(
                  [
                    { id: "about", name: "关于", icon: Info },
                    { id: "general", name: "通用", icon: Palette },
                    { id: "plugins", name: "插件", icon: Package },
                  ] as const
                ).map((item) => (
                  <button
                    className={`nav-item ${page === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => setPage(item.id)}
                  >
                    <item.icon size={19} />
                    <strong>{item.name}</strong>
                    {page === item.id && <span className="nav-dot" />}
                  </button>
                ))}
                {snapshot.plugins.length > 0 && (
                  <div className="plugin-sidebar-section">
                    <div className="plugin-sidebar-scroll">
                      <div className="plugin-sidebar-heading">
                        <h2>插件设置</h2>
                        <p>拖动左侧手柄调整顺序</p>
                      </div>
                      {orderedPlugins.map((plugin, index) => {
                        const selected =
                          page === "plugin" && pluginPage === plugin.id;
                        const Icon = pluginIcon(plugin.icon);
                        return (
                          <div
                            className={`nav-item plugin-nav-item ${selected ? "active" : ""} ${dropPlugin?.id === plugin.id ? (dropPlugin.after ? "drop-after" : "drop-target") : ""} ${dragPlugin === plugin.id ? "is-dragging" : ""}`}
                            onClick={() => {
                              setPluginPage(plugin.id);
                              setPage("plugin");
                            }}
                            onDragOver={(event) => {
                              if (dragPlugin && dragPlugin !== plugin.id && !sortingPlugins) {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                const rect =
                                  event.currentTarget.getBoundingClientRect();
                                setDropPlugin({
                                  id: plugin.id,
                                  after:
                                    event.clientY >= rect.top + rect.height / 2,
                                });
                              }
                            }}
                            onDragLeave={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPlugin(null);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              void reorderPlugin(
                                plugin.id,
                                event.clientY >= rect.top + rect.height / 2,
                              );
                            }}
                            onDragEnd={() => {
                              setDragPlugin(null);
                              setDropPlugin(null);
                            }}
                            key={plugin.id}
                            title={
                              plugin.enabled
                                ? plugin.name
                                : `${plugin.name}（已停用）`
                            }
                          >
                            <button type="button" className="plugin-drag-handle" title="拖动调整顺序" aria-label={`拖动排序 ${plugin.name}`} disabled={sortingPlugins}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); const target = orderedPlugins[index + (e.key === "ArrowUp" ? -1 : 1)]; if (target) void reorderPlugin(target.id, e.key === "ArrowDown", plugin.id); } }}
                            draggable={!sortingPlugins}
                            onDragStart={(event) => {
                              setDragPlugin(plugin.id);
                              const row = event.currentTarget.closest(".plugin-nav-item");
                              if (row) event.dataTransfer.setDragImage(row, 24, 20);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                plugin.id,
                              );
                            }}
                            ><GripVertical size={14} /></button>
                            <button className="plugin-nav-link" aria-current={selected ? "page" : undefined}>
                            <Icon size={19} />
                            <strong>
                              {plugin.name}
                              {!plugin.enabled && (
                                <span className="nav-note">已停用</span>
                              )}
                            </strong>
                            <span
                              className="plugin-order-number"
                              aria-label={`加载顺序 ${index + 1}`}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="sidebar-bottom">
                <span className="version">v{APP_VERSION}</span>
              </div>
            </aside>
            <main className="settings-main">
              <div className="page-top">
                <h1>
                  {page === "general"
                    ? "通用"
                    : page === "plugins"
                      ? "插件"
                      : page === "plugin"
                        ? (currentPlugin?.name ?? "插件设置")
                        : "关于"}
                </h1>
              </div>
              {page === "plugin" && (
                <PluginSettingsPane plugin={currentPlugin} />
              )}
              {page === "general" && (
                <>
                  <section className="card">
                    <div className="section-heading">
                      <span className="section-icon">
                        <Sun size={18} />
                      </span>
                      <div>
                        <h2>外观</h2>
                        <p>界面主题</p>
                      </div>
                    </div>
                    <div className="theme-options">
                      {(
                        [
                          { id: "light", label: "浅色", icon: Sun },
                          { id: "dark", label: "深色", icon: Moon },
                          { id: "system", label: "跟随系统", icon: Monitor },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          className={`theme-option ${settings.theme === t.id ? "selected" : ""}`}
                          onClick={() =>
                            setSettings({ ...settings, theme: t.id })
                          }
                        >
                          <div className={`theme-preview theme-${t.id}`}>
                            <div className="mock-sidebar" />
                            <div className="mock-content">
                              <i />
                              <i />
                              <i />
                              <div />
                            </div>
                          </div>
                          <span>
                            <t.icon size={15} />
                            {t.label}
                            {settings.theme === t.id && <Check size={14} />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <div className="section-heading">
                      <span className="section-icon">
                        <Monitor size={18} />
                      </span>
                      <div>
                        <h2>界面</h2>
                        <p>预览窗口显示方式</p>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>沉浸模式</strong>
                        <p>
                          关闭时视口只占标题栏与功能栏之间；开启后视口铺满窗口，鼠标移到顶部或底部时浮出操作栏，栏间空隙不挡插件操作。
                        </p>
                      </div>
                      <Toggle
                        checked={settings.immersive}
                        label="沉浸模式"
                        onChange={(immersive) =>
                          setSettings({ ...settings, immersive })
                        }
                      />
                    </div>
                  </section>
                </>
              )}
              {page === "plugins" && (
                <>
                  <div className="plugin-tabs">
                    <button
                      className={pluginTab === "market" ? "selected" : ""}
                      onClick={() => setPluginTab("market")}
                    >
                      插件市场
                    </button>
                    <button
                      className={pluginTab === "installed" ? "selected" : ""}
                      onClick={() => setPluginTab("installed")}
                    >
                      插件管理
                    </button>
                  </div>
                  <div className="list-toolbar">
                    <span>{snapshot.plugins.length} 个已安装插件</span>
                    <div>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void manage(() => call("refresh_plugins"))
                        }
                      >
                        <RotateCw size={14} />
                        刷新
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void install()}
                      >
                        <Download size={14} />
                        从目录安装
                      </button>
                    </div>
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      placeholder="搜索插件或扩展名"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                  {pluginTab === "market" ? (
                    <Marketplace
                      filter={filter}
                      onInstalled={refresh}
                      onManage={() => setPluginTab("installed")}
                    />
                  ) : (
                    <>
                      {snapshot.plugins
                        .filter((p) =>
                          `${p.name} ${p.id} ${p.extensions.join(" ")}`
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                        )
                        .map((plugin) => {
                          const Icon = pluginIcon(plugin.icon);
                          return (
                            <section className="market-card" key={plugin.id}>
                              <span className="plugin-icon">
                                <Icon size={23} />
                              </span>
                              <div className="plugin-detail">
                                <h2>
                                  {plugin.name}
                                  <span className="plugin-version">
                                    v{plugin.version}
                                  </span>
                                </h2>
                                <span
                                  className={`plugin-runtime-badge${plugin.processIds.length ? " is-running" : ""}`}
                                  title={plugin.processIds.length
                                    ? `后台进程 PID：${plugin.processIds.join(", ")}`
                                    : "尚未启动后台进程，使用插件时按需启动"}
                                >
                                  <span className="runtime-status-dot" aria-hidden="true" />
                                  {plugin.processIds.length ? "运行中" : "按需启动"}
                                </span>
                                <PluginDetails extensions={plugin.extensions}><p>{plugin.id}</p></PluginDetails>
                              </div>
                              <div className="plugin-enable"><span className={`enabled-label ${plugin.enabled ? "enabled" : ""}`}>{plugin.enabled ? "已启用" : "已停用"}</span>
                                <Toggle
                                  checked={plugin.enabled}
                                  label={`启用${plugin.name}`}
                                  busy={busy}
                                  onChange={(enabled) =>
                                    void manage(() =>
                                      call("set_enabled", {
                                        id: plugin.id,
                                        enabled,
                                      }),
                                    )
                                  }
                                />
                                <button
                                  className="text-button"
                                  title={`卸载${plugin.name}`}
                                  disabled={busy}
                                  onClick={() =>
                                    setPluginAction({ name: plugin.name, detail: `${plugin.id} · v${plugin.version}`, kind: "uninstall", run: async progress => { await call("uninstall_plugin", { id: plugin.id }); progress("正在刷新插件列表…"); await refresh(); } })
                                  }
                                >
                                  <Trash2 size={14} /> 卸载
                                </button>
                              </div>
                            </section>
                          );
                        })}
                      {!snapshot.plugins.length && (
                        <div className="card empty-plugins">
                          <Package size={28} />
                          <h2>让插件带来新的预览能力</h2>
                          <p>
                            安装文本、图片或其他格式的插件后，即可打开对应文件。
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <p className="quiet-note">
                    插件包含本机可执行程序，请仅安装可信来源的插件。
                  </p>
                  {snapshot.warnings.map((w) => (
                    <p className="warning" key={w}>
                      {w}
                    </p>
                  ))}
                </>
              )}
              {page === "about" && (
                <section className="card about">
                  <BrandMark size={58} />
                  <h1>Ember Peek</h1>
                  <p>轻量预览，一切皆插件。</p>
                  <span className="version">{APP_VERSION}</span>
                  <div className="about-details">
                    <span>
                      已安装插件 <strong>{snapshot.plugins.length}</strong>
                    </span>
                    <span>
                      插件目录{" "}
                      <code>{snapshot.pluginDirectory || "桌面版中可用"}</code>
                    </span>
                  </div>
                </section>
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
