// 宿主浮层置顶的契约测试。规范写在 docs/plugins.md 的「浮层置顶」一节，这里把它钉成可执行的检查：
// 宿主自己的两条栏、四角感应区与插件浮层必须画在插件渲染内容之上，隐藏时不得吃掉指针；任何带
// `<video>` 的插件包必须写退出系统合成平面的样式，否则视频会被 WebView2 提升成独立平面盖住宿主浮层。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = await readFile(join(root, "src", "style.css"), "utf8");

/** The declaration block of the first rule whose selector is exactly `selector`. */
function blockOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

function zIndexOf(selector) {
  const body = blockOf(selector);
  assert.ok(body, `style.css has no rule for ${selector}`);
  const match = body.match(/z-index:\s*(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

test("the host's chrome and panels always paint above the plugin's own rendering", () => {
  // The plugin view sits in the host's flow with no z-index of its own, so every host surface
  // listed here wins by a single number instead of by document order.
  const view = blockOf(".plugin-view");
  assert.ok(view, "style.css has no rule for .plugin-view");
  assert.doesNotMatch(view, /z-index/, ".plugin-view must stay at z-index auto so chrome can outrank it");

  const bars = zIndexOf(".title-layer");
  assert.equal(bars, zIndexOf(".preview-overlays"), "both bars are one layer in the window");
  assert.ok(bars > 0, "the bars must outrank the plugin view");
  // The corner sensors outrank the plugin too, but stay under the bars: once the bars are up,
  // their pills — not the sensors — own the pointer.
  assert.ok(zIndexOf(".corner") > 0 && zIndexOf(".corner") < bars, "the sensors sit between the view and the bars");
  assert.ok(zIndexOf(".overlay-stack") > bars, "plugin panels paint above the bars, never below them");
});

test("a hidden bar owns no pixels: its pills only take the pointer while it is shown", () => {
  // Every rule that hands a bar's pill back the pointer has to be scoped to `.shown`. Without
  // that scope the pills stay clickable while the bar is transparent — the window then has
  // invisible buttons, which is exactly what a user hits by accident. Selector lists are
  // examined line by line, because one `\n`-joined list can hide an unscoped selector.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const pills = /\.brand|\.window-buttons|\.floating-file-info|\.preview-action-groups|\.toolbar-actions|\.bubble-controls/;
  const offenders = [];
  for (const rule of clean.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const index = rule.indexOf("{");
    const body = rule.slice(index + 1, -1);
    if (!/pointer-events:\s*auto/.test(body)) continue;
    for (const selector of rule.slice(0, index).split(",")) {
      if (pills.test(selector) && !/\.shown/.test(selector)) offenders.push(selector.trim());
    }
  }
  assert.deepEqual(offenders, [], `pills take the pointer while their bar is hidden: ${offenders.join(" | ")}`);
});

test("the corner sensors are the host's own reveal targets", () => {
  // Four corners, in the window viewport only: they reveal the bars, and in the band viewport
  // the bars are always on screen, so the sensors release those pixels back to the plugin.
  assert.match(css, /\.corner\.top-left[\s\S]*?\.corner\.bottom-right/, "style.css defines all four corners");
  assert.match(
    blockOf(".preview-app[data-viewport=\"window\"] .corner") || "",
    /pointer-events:\s*auto/,
    "in the window viewport the corners must sense the pointer",
  );
  assert.match(
    blockOf(".preview-app[data-viewport=\"band\"] .corner") || "",
    /pointer-events:\s*none/,
    "in the band viewport the corners must not take the plugin's pixels",
  );
});

test("every plugin that renders a video opts out of the system compositing plane", async () => {
  // A playing <video> is what WebView2 promotes; the plugin has to keep that quad out of the
  // promotion, or the host's chrome disappears over it (docs/plugins.md, 浮层置顶).
  const plugins = join(root, "plugins");
  const optOut = /clip-path|border-radius|filter|mask|opacity/i;
  const offenders = [];
  for (const entry of await readdir(plugins, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ui = join(plugins, entry.name, "ui");
    let files;
    try {
      files = await readdir(ui);
    } catch {
      continue;
    }
    const sources = await Promise.all(
      files.filter((name) => /\.(html|js|css)$/.test(name)).map(async (name) => [name, await readFile(join(ui, name), "utf8")]),
    );
    const markup = sources.filter(([name]) => /\.(html|js)$/.test(name)).map(([, text]) => text).join("\n");
    if (!/<video[\s>]|createElement\(\s*["']video["']\s*\)/.test(markup)) continue;
    const styles = sources.filter(([name]) => name.endsWith(".css")).map(([, text]) => text).join("\n");
    const rule = styles.match(/(?:^|\n)\s*video[^{}]*\{([^}]*)\}/);
    if (!rule || !optOut.test(rule[1])) offenders.push(entry.name);
  }
  assert.deepEqual(offenders, [], `these plugins render a video without opting out of the system plane: ${offenders.join(", ")}`);
});
