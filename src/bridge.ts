import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pluginPath } from "./protocol.mjs";
import { t } from "./i18n";

export const desktop = isTauri();
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!desktop) throw new Error(t("bridge.desktopOnly"));
  return invoke<T>(command, args);
}
export const viewUrl = (id: string, view: string) =>
  convertFileSrc("", "plugin") + pluginPath(id, view);
export const windowAction = async (
  action: "close" | "minimize" | "toggleMaximize" | "startDragging",
) => {
  if (desktop) await getCurrentWindow()[action]();
};
