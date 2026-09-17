// Reading the few fields of a Cargo manifest the plugin tooling cares about.
//
// Shared by the version sync and the packaging step so a plugin's crate version is read one
// way: if the two scripts disagreed about what a manifest says, that would be its own kind of
// drift. Kept free of dependencies so `npm run version:check` does not need node_modules.

/**
 * The `[package]` table of a Cargo manifest.
 *
 * `inheritsVersion` is the interesting field for plugins: `version.workspace = true` means the
 * crate is versioned with the application, which is exactly what a plugin must not be — it
 * ships on its own schedule, so it declares its own number and the packaging step checks it
 * against the package's `plugin.json`.
 */
export function packageTable(source) {
  const block = source.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  if (!block) return null;
  const body = block[1];
  const value = (key) =>
    body.match(new RegExp(`(?:^|\\n)[^\\S\\n]*${key}[^\\S\\n]*=[^\\S\\n]*"([^"]*)"`))?.[1] ??
    null;
  return {
    name: value("name"),
    version: value("version"),
    inheritsVersion: /(?:^|\n)[^\S\n]*version\.workspace[^\S\n]*=[^\S\n]*true/.test(body),
  };
}
