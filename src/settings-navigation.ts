import type { Plugin, Session } from "./types";

export function previewSettingsPage(
  current: Pick<Session, "pluginId"> | undefined,
  plugins: Pick<Plugin, "id">[],
): string {
  return current && plugins.some(plugin => plugin.id === current.pluginId)
    ? `plugin:${current.pluginId}`
    : "general";
}

export function settingsDestination(page: string, plugins: Pick<Plugin, "id">[]) {
  if (page.startsWith("plugin:")) {
    const pluginId = page.slice(7);
    return plugins.some(plugin => plugin.id === pluginId)
      ? { page: "plugin" as const, pluginId }
      : { page: "general" as const, pluginId: null };
  }
  return {
    page: page === "plugins" || page.startsWith("tool:") ? "plugins" as const
      : page === "about" ? "about" as const
      : page === "welcome" ? "welcome" as const : "general" as const,
    pluginId: null,
  };
}
