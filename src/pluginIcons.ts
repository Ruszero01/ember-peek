import { createElement, lazy, Suspense, type ComponentType } from "react";
import { Package } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";

export type PluginIconProps = { size?: number | string };
export const PLUGIN_ICON_NAMES = Object.keys(dynamicIconImports).sort();
const cache = new Map<string, ComponentType<PluginIconProps>>();
const aliases: Record<string, string> = {
  fit: "maximize", actual: "square", up: "chevron-up", down: "chevron-down",
};

/** The full pinned Lucide catalog, loaded from local application chunks. */
export function pluginIcon(name: string | null | undefined): ComponentType<PluginIconProps> {
  const key = name ? aliases[name] || name : "package";
  if (!Object.hasOwn(dynamicIconImports, key)) return Package;
  let component = cache.get(key);
  if (!component) {
    const Icon = lazy(async () => {
      try { return await dynamicIconImports[key as keyof typeof dynamicIconImports](); }
      catch { return { default: Package }; }
    });
    component = props => createElement(Suspense, { fallback: createElement(Package, props) }, createElement(Icon, props));
    cache.set(key, component);
  }
  return component;
}
