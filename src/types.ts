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
  dirty: boolean;
  name: string;
  size: number;
  status: "loading" | "ready" | "error";
  viewReady: boolean;
  error: string | null;
};
export type PluginSetting =
  | {
      key: string;
      type: "bool";
      label: string;
      help?: string;
      default: boolean;
    }
  | {
      key: string;
      type: "number";
      label: string;
      help?: string;
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
      default: string;
      options: { value: string; label: string }[];
    }
  | {
      key: string;
      type: "text";
      label: string;
      help?: string;
      default: string;
    };
export type Plugin = {
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
