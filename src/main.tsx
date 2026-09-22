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
  Languages,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ScrubControl } from "./ScrubControl";
import { Select } from "./Select";
import { Toggle } from "./Toggle";
import { PluginView } from "./PluginView";
import { PluginStage } from "./PluginStage";
import { PluginDetails } from "./PluginDetails";
import { PluginConfirm, type PluginAction } from "./PluginConfirm";
import { PluginDialog } from "./PluginDialog";
import { Marketplace } from "./Marketplace";
import { WorkshopPreview } from "./WorkshopPreview";
import { ToolPage } from "./ToolPage";
import { Welcome } from "./Welcome";
import { call, desktop, windowAction } from "./bridge";
import { Selection, isContributionCurrent } from "./protocol.mjs";
import type { PluginDialogRequest } from "./protocol.mjs";
import { pluginIcon } from "./pluginIcons";
import {
  LOCALE_NAMES,
  LOCALES,
  formatBytes,
  isLocalePreference,
  resolveLocale,
  setLocale,
  systemLocale,
  useT,
  type Locale,
  type LocalePreference,
} from "./i18n";
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
const originOrder: Record<string, number> = { official: 0, generated: 1, local: 2, market: 3, unknown: 4 };
type Settings = {
  theme: "light" | "dark" | "system";
  immersive: boolean;
  /** Interface language; "system" follows the language the WebView reports. */
  locale: LocalePreference;
};
function savedSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem("ember.settings") || "{}");
    return {
      theme: ["light", "dark", "system"].includes(v.theme) ? v.theme : "system",
      immersive: v.immersive !== false,
      locale: isLocalePreference(v.locale) ? v.locale : "system",
    };
  } catch {
    return { theme: "system", immersive: true, locale: "system" };
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
  const t = useT();
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
          <Select
            value={String(current ?? "")}
            choices={setting.options}
            label={setting.label}
            busy={busy}
            onChange={onChange}
          />
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
                aria-label={t("settings.increase", { label: setting.label })}
                disabled={busy || (displayMax !== undefined && Number(draft) >= displayMax)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => stepNumber(1)}
              >
                <ChevronUp size={10} />
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={t("settings.decrease", { label: setting.label })}
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
  const t = useT();
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
      title={t("plugin.activationHint")}
    >
      <Toggle
        label={t("plugin.activation")}
        checked={activation.mode === "auto"}
        busy={busy}
        onChange={(value) =>
          void update({ ...activation, mode: value ? "auto" : "manual" })
        }
      />
      <span className="plugin-activation-label">{t("plugin.activation")}</span>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PluginSettingsPane({ plugin }: { plugin: Plugin | undefined }) {
  const t = useT();
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
        <p className="quiet-note">{t("plugin.settings.unavailable")}</p>
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
              {plugin.enabled ? t("plugin.enabled") : t("plugin.disabledNote")}
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
          <p className="quiet-note">{t("plugin.settings.none")}</p>
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
  const t = useT();
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
      <strong>{t("loading.title", { name })}</strong>
      <p>{t("loading.note")}</p>
    </div>
  );
}

function App() {
  const t = useT();
  const [snapshot, setSnapshot] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const [page, setPage] = useState<
    "preview" | "general" | "plugins" | "about" | "plugin" | "welcome"
  >(settingsWindow ? "general" : "preview");
  // Which plugin the "plugin" page is configuring. Kept beside `page` so selecting a
  // plugin does not have to encode the plugin id into the page state itself.
  const [pluginPage, setPluginPage] = useState<string | null>(null);
  const [settings, setSettings] = useState(savedSettings);
  // The language the WebView reports, kept current so "follow system" reacts to a change
  // without the user having to restart the window.
  const [systemLanguage, setSystemLanguage] = useState<Locale>(systemLocale);
  const language: Locale =
    settings.locale === "system" ? systemLanguage : settings.locale;
  const [theme, setTheme] = useState<Theme>({});
  const [reports, setReports] = useState<Record<string, ViewReport>>({});
  type PendingDialog = {
    request: PluginDialogRequest;
    resolve: (result: string | null) => void;
  };
  const dialogQueue = useRef<PendingDialog[]>([]);
  const activeDialog = useRef<PendingDialog | null>(null);
  const [pluginDialog, setPluginDialog] = useState<PendingDialog | null>(null);
  const requestPluginDialog = useCallback((request: PluginDialogRequest) =>
    new Promise<string | null>((resolve) => {
      const next = { request, resolve };
      if (activeDialog.current) dialogQueue.current.push(next);
      else {
        activeDialog.current = next;
        setPluginDialog(next);
      }
    }), []);
  const resolvePluginDialog = useCallback((result: string | null) => {
    const current = activeDialog.current;
    if (!current) return;
    current.resolve(result);
    const next = dialogQueue.current.shift() ?? null;
    activeDialog.current = next;
    setPluginDialog(next);
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [pluginTab, setPluginTab] = useState<string>("market");
  const [toolPageRevision, setToolPageRevision] = useState(0);
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
  /**
   * Reveal while the pointer is inside one of the four corners, hide the moment it is not.
   * A leave that lands back on the chrome's own surface — a pill, or a corner — keeps the bars
   * up, so moving along a pill never hides the thing being clicked. Nothing else may ask for
   * them: the bars are the host's, and only the host decides when they are on screen.
   */
  const holdChrome = (event: React.PointerEvent) => {
    if (!event.buttons) setHot("hover");
  };
  const dropChrome = (event: React.PointerEvent) => {
    const held = document
      .elementsFromPoint(event.clientX, event.clientY)
      .some((element) => element.closest("[data-reveal]"));
    if (!held) setHot("");
  };
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
            if (status.settingsPage.startsWith("tool:")) { setPluginTab(status.settingsPage.slice(5)); setToolPageRevision(status.settingsRevision); }
            setPage(
              status.settingsPage === "plugins" || status.settingsPage.startsWith("tool:")
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
            "color-scheme",
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
  useEffect(() => {
    const changed = () => setSystemLanguage(systemLocale());
    addEventListener("languagechange", changed);
    return () => removeEventListener("languagechange", changed);
  }, []);
  // The host is told the language it should speak: it builds the tray menu, its own dialogs
  // and every plugin mount, so it has to know. Applying it in a layout effect means the
  // text that changes is the text of the frame the click produced — a switch that paints
  // once in the old language and then corrects itself is a flash that costs nothing to
  // avoid.
  useLayoutEffect(() => {
    setLocale(language);
    if (desktop) void guard(() => call("set_locale", { locale: language }));
  }, [language]);
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
    // A file dropped on a tool page belongs to that page as a path; dropping one anywhere
    // else in the preview window opens it. The settings window has no other drop target,
    // so a file dropped on its own chrome is ignored instead of previewed.
    if (desktop)
      void getCurrentWindow()
        .onDragDropEvent((event) => {
          const accepts = document.querySelector('.tool-page[data-tool-drop="enabled"]');
          if (!accepts) {
            if (!settingsWindow && event.payload.type === "drop" && event.payload.paths[0])
              void open(event.payload.paths[0]);
            return;
          }
          if (event.payload.type === "drop")
            window.dispatchEvent(new CustomEvent("ember-tool-drop", { detail: event.payload.paths }));
          else if (event.payload.type === "enter" || event.payload.type === "leave")
            window.dispatchEvent(new CustomEvent("ember-tool-drag", { detail: event.payload.type }));
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
  async function install(folder = true) {
    await manage(async () => {
      const path = await call<string | null>("pick_path", { folder });
      if (path) {
        const prepared = await call<{token: string; id: string; name: string; version: string; permissions: string[]}>("prepare_plugin", {path});
        setPluginAction({ name: prepared.name, detail: `${prepared.id} · v${prepared.version} · ${prepared.permissions.join(", ") || "—"}\n${path}`, kind: "install", run: async progress => {
          progress(t("progress.installLocal")); await call("install_plugin", { token: prepared.token }); progress(t("progress.refreshPlugins")); await refresh();
        } });
      }
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
        <button title={t("window.minimize")} onClick={() => void windowAction("minimize")}>
          <Minus size={15} />
        </button>
        <button
          title={t("window.maximize")}
          onClick={() => void windowAction("toggleMaximize")}
        >
          <Square size={12} />
        </button>
        <button
          className="window-close"
          title={t("window.close")}
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
      {pluginDialog && (
        <PluginDialog
          request={pluginDialog.request}
          onResolve={resolvePluginDialog}
        />
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button title={t("error.dismiss")} onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {!desktop && (
        <div className="browser-banner">
          {t("browser.banner")}
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
                locale={language}
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
                confirm={requestPluginDialog}
              />
            ) : null;
          }}
        </PluginStage>
        {!current && !opening && (
          <div className="empty-state">
            <div className="empty-art">
              <BrandMark size={43} />
            </div>
            <h1>{t("empty.title")}</h1>
            <p>{t("empty.note")}</p>
            <button className="primary-button" onClick={() => void pick()}>
              <FolderOpen size={16} />
              {t("empty.open")}<kbd>Ctrl O</kbd>
            </button>
            <div className="format-hints">
              {snapshot.plugins.filter((p) => p.enabled).length
                ? t("empty.pluginsReady", {
                    count: snapshot.plugins.filter((p) => p.enabled).length,
                  })
                : t("empty.noPlugins")}
              <button
                className="text-button"
                onClick={() => settingsPage("plugins")}
              >
                {t("empty.manage")}
              </button>
              <button className="text-button" onClick={() => void guard(() => call("open_workshop"))}>{t("plugins.createWithAI")}</button>
            </div>
          </div>
        )}
        {current && !opening && !contributors.some(s => s.capabilities.includes("view")) && (
          <div className="empty-state">
            <p>{t("plugins.noViewer")}</p>
            <button className="secondary-button" onClick={() => settingsPage("plugins")}>{t("empty.manage")}</button>
            <button className="primary-button" onClick={() => void guard(() => call("open_workshop"))}>{t("plugins.createWithAI")}</button>
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
          name={current?.name || t("loading.file")}
        />
        {(current?.status === "error" || viewReport?.error) && (
          <div className="surface-state">
            <Package size={30} />
            <strong>{t("preview.failed")}</strong>
            <p>{current?.error || viewReport?.error}</p>
            <button className="secondary-button" onClick={() => void guard(() => call("open_workshop"))}>{t("plugins.createWithAI")}</button>
            <button className="secondary-button" onClick={() => void pick()}>
              {t("preview.openOther")}
            </button>
          </div>
        )}
      </div>
      {page === "preview" ? (
        <>
          {/* The four corners are the whole reveal rule, and the host owns it: a plugin never
              asks for the bars, because a plugin's floating panel is a document with its own
              edges and a panel would drag the chrome on and off for reasons the user cannot
              see. Each zone is a bar's height and a share of the width — what a cursor flung
              at a corner reaches, without the middle of the viewport belonging to chrome. */}
          {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
            (corner) => (
              <div
                key={corner}
                className={`corner ${corner}`}
                data-reveal
                onPointerEnter={holdChrome}
                onPointerLeave={dropChrome}
              />
            ),
          )}
          <div
            className={`title-layer ${chromeShown ? "shown" : ""}`}
            data-reveal
            onPointerEnter={holdChrome}
            onPointerLeave={dropChrome}
          >
            {title}
          </div>
          <footer
            className={`preview-overlays ${chromeShown ? "shown" : ""}`}
            data-reveal
            onPointerEnter={holdChrome}
            onPointerLeave={dropChrome}
          >
            <div className="floating-file-info">
              <span className="file-icon">
                <File size={17} />
              </span>
              <div>
                <strong>{current?.name || "Ember Peek"}</strong>
                <span>
                  {current
                    ? `${formatBytes(current.size)} · ${viewReport?.status || current.pluginId}`
                    : t("preview.tagline")}
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
                      title={contributor.error || t("footer.openPlugin", { label: contributor.label })}
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
                          const Icon = pluginIcon(control.icon || "sliders-horizontal");
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
                <button title={t("footer.openFile")} onClick={() => void pick()}>
                  <FolderOpen size={16} />
                </button>
                <button title={t("footer.settings")} onClick={() => settingsPage("general")}>
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
                <div className="sidebar-heading">{t("nav.heading")}</div>
                {(
                  [
                    { id: "about", name: t("nav.about"), icon: Info },
                    { id: "general", name: t("nav.general"), icon: Palette },
                    { id: "plugins", name: t("nav.plugins"), icon: Package },
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
                        <h2>{t("nav.pluginSettings")}</h2>
                        <p>{t("nav.reorderHint")}</p>
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
                                : t("plugin.disabledTitle", { name: plugin.name })
                            }
                          >
                            <button type="button" className="plugin-drag-handle" title={t("plugin.dragHint")} aria-label={t("plugin.dragLabel", { name: plugin.name })} disabled={sortingPlugins}
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
                                <span className="nav-note">{t("plugin.disabledBadge")}</span>
                              )}
                            </strong>
                            <span
                              className="plugin-order-number"
                              aria-label={t("plugin.order", { index: index + 1 })}
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
            <main className={`settings-main${
              (page === "plugins" && snapshot.plugins.some(p => p.id === pluginTab && p.tool && p.enabled)) ||
              (page === "plugin" && currentPlugin?.tool && currentPlugin.origin === "official" && currentPlugin.enabled)
                ? " tool-surface"
                : ""
            }`}>
              <div className="page-top">
                <h1>
                  {page === "general"
                    ? t("nav.general")
                    : page === "plugins"
                      ? t("nav.plugins")
                      : page === "plugin"
                        ? (currentPlugin?.name ?? t("nav.pluginSettings"))
                        : t("nav.about")}
                </h1>
              </div>
              {page === "plugin" && (
                currentPlugin?.tool && currentPlugin.origin === "official" && currentPlugin.enabled
                  ? <ToolPage key={`settings:${currentPlugin.id}:${currentPlugin.revision}`} plugin={currentPlugin} theme={theme} locale={language} settings />
                  : <PluginSettingsPane plugin={currentPlugin} />
              )}
              {page === "general" && (
                <>
                  <section className="card">
                    <div className="section-heading">
                      <span className="section-icon">
                        <Sun size={18} />
                      </span>
                      <div>
                        <h2>{t("appearance.title")}</h2>
                        <p>{t("appearance.subtitle")}</p>
                      </div>
                    </div>
                    <div className="theme-options">
                      {(
                        [
                          { id: "light", label: t("theme.light"), icon: Sun },
                          { id: "dark", label: t("theme.dark"), icon: Moon },
                          { id: "system", label: t("theme.system"), icon: Monitor },
                        ] as const
                      ).map((t2) => (
                        <button
                          key={t2.id}
                          className={`theme-option ${settings.theme === t2.id ? "selected" : ""}`}
                          onClick={() =>
                            setSettings({ ...settings, theme: t2.id })
                          }
                        >
                          <div className={`theme-preview theme-${t2.id}`}>
                            <div className="mock-sidebar" />
                            <div className="mock-content">
                              <i />
                              <i />
                              <i />
                              <div />
                            </div>
                          </div>
                          <span>
                            <t2.icon size={15} />
                            {t2.label}
                            {settings.theme === t2.id && <Check size={14} />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <div className="section-heading">
                      <span className="section-icon">
                        <Languages size={18} />
                      </span>
                      <div>
                        <h2>{t("language.title")}</h2>
                        <p>{t("language.subtitle")}</p>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>{t("language.title")}</strong>
                        <p>{t("language.note")}</p>
                      </div>
                      <div className="setting-control">
                        <Select
                          value={settings.locale}
                          label={t("language.title")}
                          choices={[
                            {
                              value: "system",
                              label: t("language.systemWith", {
                                name: LOCALE_NAMES[systemLanguage],
                              }),
                            },
                            ...LOCALES.map((id) => ({
                              value: id,
                              label: LOCALE_NAMES[id],
                            })),
                          ]}
                          onChange={(locale) =>
                            setSettings({
                              ...settings,
                              locale: locale as LocalePreference,
                            })
                          }
                        />
                      </div>
                    </div>
                  </section>
                  <section className="card">
                    <div className="section-heading">
                      <span className="section-icon">
                        <Monitor size={18} />
                      </span>
                      <div>
                        <h2>{t("interface.title")}</h2>
                        <p>{t("interface.subtitle")}</p>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>{t("immersive.label")}</strong>
                        <p>
                          {t("immersive.note")}
                        </p>
                      </div>
                      <Toggle
                        checked={settings.immersive}
                        label={t("immersive.label")}
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
                  <div className="plugin-tabs-row">
                    <div className="plugin-tabs">
                      <button
                        className={pluginTab === "market" ? "selected" : ""}
                        onClick={() => setPluginTab("market")}
                      >
                        {t("plugins.market")}
                      </button>
                    <button
                      className={pluginTab === "installed" ? "selected" : ""}
                      onClick={() => setPluginTab("installed")}
                    >
                      {t("plugins.manage")}
                    </button>
                    {snapshot.plugins.filter(p => p.tool && p.enabled && p.origin === "official").map(p => (
                      <button key={p.id} className={pluginTab === p.id ? "selected" : ""} onClick={() => setPluginTab(p.id)}>{p.name}</button>
                    ))}
                    </div>
                    {/* A tool's own page has no header of its own, so its settings entry sits
                        here, on the row that already names the tool. */}
                    {snapshot.plugins.some(p => p.id === pluginTab && p.tool && p.enabled) && (
                      <button
                        className="text-button tool-settings-link"
                        onClick={() => { setPluginPage(pluginTab); setPage("plugin"); }}
                      >
                        {t("plugins.openToolSettings")}
                      </button>
                    )}
                  </div>
                  {(pluginTab === "market" || pluginTab === "installed") && <>
                  <div className="list-toolbar">
                    <span>{t("plugins.installedCount", { count: snapshot.plugins.length })}</span>
                    <div>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void manage(() => call("refresh_plugins"))
                        }
                      >
                        <RotateCw size={14} />
                        {t("plugins.refresh")}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void install()}
                      >
                        <Download size={14} />
                        {t("plugins.installFromFolder")}
                      </button>
                      <button className="secondary-button" disabled={busy} onClick={() => void install(false)}>
                        <Download size={14} />{t("plugins.installFromFile")}
                      </button>
                    </div>
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      placeholder={t("plugins.searchPlaceholder")}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                  </>}
                  {snapshot.plugins.some(p => p.id === pluginTab && p.tool && p.enabled) ? (
                    <ToolPage key={`${pluginTab}:${toolPageRevision}:${snapshot.plugins.find(p => p.id === pluginTab)?.revision}`} plugin={snapshot.plugins.find(p => p.id === pluginTab)!} theme={theme} locale={language} onOpenSettings={() => { setPluginPage(pluginTab); setPage("plugin"); }} />
                  ) : pluginTab === "market" ? (
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
                        .sort((a,b) => (originOrder[a.origin] ?? 4) - (originOrder[b.origin] ?? 4) || a.name.localeCompare(b.name))
                        .map((plugin, index, plugins) => {
                          const Icon = pluginIcon(plugin.icon);
                          const group = (origin: string) => origin === "official" ? "plugins.origin.official" : origin === "local" ? "plugins.origin.local" : origin === "generated" ? "plugins.origin.generated" : origin === "market" ? "plugins.origin.market" : "plugins.origin.unknown";
                          return (
                            <React.Fragment key={plugin.id}>
                            {(index === 0 || plugins[index-1].origin !== plugin.origin) && <div className="plugin-group-heading"><h2>{t(group(plugin.origin))}</h2><span>{plugins.filter(p => p.origin === plugin.origin).length}</span><div /></div>}
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
                                  {/* Only a plugin that is actually up says so: a badge that is
                                      always there reads as part of the layout rather than as a
                                      state, and "on demand" is the normal case for every card. */}
                                  {plugin.processIds.length > 0 && (
                                    <span
                                      className="plugin-runtime-badge is-running"
                                      title={t("plugin.pidRunning", { pids: plugin.processIds.join(", ") })}
                                    >
                                      <span className="runtime-status-dot" aria-hidden="true" />
                                      {t("plugin.runtimeRunning")}
                                    </span>
                                  )}
                                </h2>
                                <PluginDetails extensions={plugin.extensions}><p>{plugin.id}</p><p>{t(group(plugin.origin))}</p>{plugin.source && <p className="source-path">{plugin.source}</p>}</PluginDetails>
                              </div>
                              <div className="plugin-enable"><span className={`enabled-label ${plugin.enabled ? "enabled" : ""}`}>{plugin.enabled ? t("plugin.enabled") : t("plugin.disabled")}</span>
                                <Toggle
                                  checked={plugin.enabled}
                                  label={t("plugin.enableLabel", { name: plugin.name })}
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
                                  title={t("plugins.uninstallLabel", { name: plugin.name })}
                                  disabled={busy}
                                  onClick={() =>
                                    setPluginAction({ name: plugin.name, detail: `${plugin.id} · v${plugin.version}`, kind: "uninstall", run: async progress => { await call("uninstall_plugin", { id: plugin.id }); progress(t("progress.refreshPlugins")); await refresh(); } })
                                  }
                                >
                                  <Trash2 size={14} /> {t("plugins.uninstall")}
                                </button>
                              </div>
                            </section>
                            </React.Fragment>
                          );
                        })}
                      {!snapshot.plugins.length && (
                        <div className="card empty-plugins">
                          <Package size={28} />
                          <h2>{t("plugins.empty.title")}</h2>
                          <p>
                            {t("plugins.empty.note")}
                          </p>
                        </div>
                      )}
                    </>
                  )}
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
                  <p>{t("about.tagline")}</p>
                  <span className="version">{APP_VERSION}</span>
                  <div className="about-details">
                    <span>
                      {t("about.installed")} <strong>{snapshot.plugins.length}</strong>
                    </span>
                    <span>
                      {t("about.directory")}{" "}
                      <code>{snapshot.pluginDirectory || t("about.desktopOnly")}</code>
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
// Resolve the interface language before the first paint: a window that renders one frame
// in the wrong language and then swaps is worse than one that starts in it.
setLocale(resolveLocale(savedSettings().locale));
const previewQuery = new URLSearchParams(location.search);
const previewProject = previewQuery.get("workshopPreview");
createRoot(document.getElementById("root")!).render(previewProject && previewQuery.get("tool") ? <WorkshopPreview project={previewProject} tool={previewQuery.get("tool")!} /> : <App />);
