import path from "node:path";

export function selectSdkAssets(uiText, assets) {
  const selected = new Set();
  let text = uiText;
  for (;;) {
    const next = assets.filter(({ source, name }) => !selected.has(name) &&
      (name === "shortcuts.js" || name === "state.js" || text.includes(name) || text.includes(path.basename(source))));
    if (!next.length) break;
    for (const asset of next) { selected.add(asset.name); text += "\n" + asset.contents; }
  }
  return assets.filter(asset => selected.has(asset.name));
}
