// One vocabulary of icons a plugin may name in its `plugin.json` `icon` field.
//
// Plugins name an icon rather than shipping an asset: a plugin-supplied image would
// need its own path validation, format allow-list, size cap and content hashing, and
// would let a package dress itself up as another. The host owning the set keeps that
// out of the trust boundary.
//
// An unknown name falls back to the generic icon instead of failing, so this list can
// grow without invalidating plugins that already name a newer icon.
import {
  Archive,
  Binary,
  Braces,
  Code,
  FileCode,
  FileJson,
  FilePen,
  FileText,
  FileType,
  Film,
  Image,
  Info,
  Music,
  Package,
  Presentation,
  Table,
} from "lucide-react";
import type { ComponentType } from "react";

export type PluginIconProps = { size?: number | string };

export const PLUGIN_ICONS: Record<string, ComponentType<PluginIconProps>> = {
  image: Image,
  "file-text": FileText,
  code: Code,
  "file-code": FileCode,
  braces: Braces,
  "file-json": FileJson,
  binary: Binary,
  presentation: Presentation,
  film: Film,
  music: Music,
  table: Table,
  archive: Archive,
  "file-type": FileType,
  "file-pen": FilePen,
  info: Info,
};

/** Names a plugin may use, for docs and for pointing authors at a valid value. */
export const PLUGIN_ICON_NAMES = Object.keys(PLUGIN_ICONS).sort();

/** The icon for a declared name, or the generic package icon. */
export function pluginIcon(
  name: string | null | undefined,
): ComponentType<PluginIconProps> {
  return (name && PLUGIN_ICONS[name]) || Package;
}
