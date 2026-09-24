export type Session = {
  id: string;
  pluginId: string;
  revision: number;
  entry: string;
  fileId: string;
  label: string;
  capabilities: ("view" | "overlay" | "controls")[];
  overlay: {
    width: number;
    height: number;
    /** Corner the panel starts in before the user drags it. */
    anchor: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
  } | null;
  available: boolean;
  /** The plugin reports uncommitted changes; the host will not destroy this session. */
  pending: boolean;
  /** The plugin's own wording for them, shown when the host has to refuse. */
  pendingReason: string | null;
  name: string;
  size: number;
  status: "loading" | "ready" | "error";
  viewReady: boolean;
  error: string | null;
};
/** A declared setting. `hidden` keeps the host's persistence without a control in the settings
 * surface: the plugin stores a value it owns (last volume, last zoom) and the user never sees a
 * switch for it. */
export type PluginSetting =
  | {
      key: string;
      type: "bool";
      label: string;
      help?: string;
      hidden?: boolean;
      default: boolean;
    }
  | {
      key: string;
      type: "number";
      label: string;
      help?: string;
      hidden?: boolean;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      displayMultiplier?: number;
      suffix?: string;
    }
  | {
      key: string;
      type: "select";
      label: string;
      help?: string;
      hidden?: boolean;
      default: string;
      options: { value: string; label: string }[];
    }
  | {
      key: string;
      type: "text";
      label: string;
      help?: string;
      hidden?: boolean;
      default: string;
    }
  | {
      key: string;
      /** A path the host picks for the plugin: empty, or an absolute folder. */
      type: "folder";
      label: string;
      help?: string;
      hidden?: boolean;
      default: string;
    };
export type Plugin = {
  tool?: { api: number; service: string } | null;
  entry: string;
  origin: string;
  source?: string | null;
  activation: { mode: "auto" | "manual"; priority: number };
  id: string;
  name: string;
  version: string;
  extensions: string[];
  revision: number;
  enabled: boolean;
  processIds: number[];
  /** Icon name to look up in the host set; unknown or absent falls back to a generic one. */
  icon?: string;
  /** Declarations, used to render one control per setting. */
  settings: PluginSetting[];
  /** Current values, keyed by setting key: declared defaults plus user overrides. */
  values: Record<string, unknown>;
  /** Declared defaults, used to detect an override and to offer a reset. */
  defaults: Record<string, unknown>;
};
export type Snapshot = {
  plugins: Plugin[];
  sessions: Session[];
  active: string | null;
  warnings: string[];
  pluginDirectory: string;
  /** False until the first-run plugin chooser has been answered. */
  onboarded: boolean;
};
/** Where a plugin comes from: a configured source, and the package behind the entry. */
export type MarketSource = {
  kind: "remote";
  name: string;
  catalog: string;
  urls: string[];
  sha256: string;
  size: number;
};
export type MarketEntry = {
  source: MarketSource;
  id: string;
  name: string;
  version: string;
  extensions: string[];
  icon?: string;
  summary: string;
  publisher: string;
  /** The source suggests this one for a fresh installation. */
  recommended: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
};
export type MarketList = { entries: MarketEntry[]; warnings: string[] };
export type Control = {
  id: string;
  kind: "button" | "toggle" | "scrub";
  value?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
  icon?: string;
  /** Toggle state: the host draws a pressed control. Ignored for other kinds. */
  active?: boolean;
};
export type Theme = Record<string, string>;
export type ViewReport = {
  controls: Control[];
  status: string;
  error?: string;
};
