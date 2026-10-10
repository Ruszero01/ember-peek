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

/** The declaration block of the first rule whose selector list contains `selector` verbatim,
 * as one entry — `blockOf` only sees a selector that has a rule to itself, and half of these
 * selectors are written in a shared list. */
function ruleBodyOf(selector) {
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || []) {
    const index = rule.indexOf("{");
    const selectors = rule.slice(0, index).split(",").map((entry) => entry.trim());
    if (selectors.includes(selector)) return rule.slice(index + 1, -1);
  }
  return null;
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
  assert.ok(zIndexOf(".overlay-stack") > bars, "plugin panels paint above the bars, never below them");
});

test("a bar keeps its pixels to itself: only the pills in it take the pointer", () => {
  // The bar's own row, the gaps between its pills and the whole title drag zone stay out of the
  // way of the plugin. The pills are the one exception, and they are it on purpose: they are
  // the reveal target, so the pointer has to be able to land on one while the bar is hidden.
  const window = ".preview-app[data-viewport=\"window\"]";
  for (const bar of [".title-layer", ".preview-overlays"]) {
    assert.match(
      ruleBodyOf(`${window} ${bar}`) || "",
      /pointer-events:\s*none/,
      `${bar} must not own the row it draws in`,
    );
  }
  for (const pill of [".brand", ".window-buttons", ".floating-file-info", ".toolbar-actions", ".toolbar-host-actions"]) {
    assert.match(
      ruleBodyOf(`${window} ${pill}`) || "",
      /pointer-events:\s*auto/,
      `${pill} is a reveal target and must sense the pointer while its bar is hidden`,
    );
  }
});

test("the reveal targets are the chrome's own boxes, with no zone drawn beside them", () => {
  // What reveals the bars is the box the user can see: the bubbles themselves. A separately
  // drawn sensor would be a second, invisible rectangle the pointer has to find — and one that
  // cannot follow a bubble as it changes size with a longer file name or an expanded control
  // set. The bubbles' own boxes are always the target, so the rule is the same in both
  // viewports and there is no geometry of the host's to keep in sync with the chrome's. The
  // selector list is read line by line, because one `\n`-joined list can hide a selector that
  // hands the pointer back to something invisible.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const zone = /\.corner/;
  const offenders = [];
  for (const rule of clean.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const index = rule.indexOf("{");
    const body = rule.slice(index + 1, -1);
    if (!/pointer-events:\s*auto/.test(body)) continue;
    for (const selector of rule.slice(0, index).split(",")) {
      if (zone.test(selector)) offenders.push(selector.trim());
    }
  }
  assert.deepEqual(offenders, [], `a drawn reveal zone is back: ${offenders.join(" | ")}`);
  assert.doesNotMatch(clean, /\.corner\s*\{/, "style.css still carries corner-zone geometry");
});

test("the package drop hint never takes the drag it describes", () => {
  // It covers the whole window while a file is over the plugin list, so owning the pointer
  // would make it the thing the drop lands on and swallow what it is there to explain.
  assert.match(
    ruleBodyOf(".package-drop") || "",
    /pointer-events:\s*none/,
    "the package drop hint must let the drag through to the list",
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

test("a frame that renders a plugin document hands it the autoplay permission", async () => {
  // A cross-origin frame has no `autoplay` of its own, so a plugin whose view opens a video is
  // left waiting for a gesture the page never provides (docs/plugins.md, the view is one web
  // page at a time). The host grants that one permission and nothing else.
  const offenders = [];
  for (const name of await readdir(join(root, "src"))) {
    if (!name.endsWith(".tsx")) continue;
    const source = await readFile(join(root, "src", name), "utf8");
    for (const frame of source.match(/<iframe[\s\S]*?\/>/g) || []) {
      if (!/sandbox="allow-scripts"/.test(frame)) continue;
      if (!/allow="autoplay"/.test(frame)) offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [], `these frames render a plugin document without autoplay: ${offenders.join(", ")}`);
});


test("action pill shadows fit inside their horizontal scrolling clip",()=>{
  const declarations=selector=>{
    const values={};
    for(const rule of css.replace(/\/\*[\s\S]*?\*\//g,"").match(/[^{}]+\{[^{}]*\}/g)||[]){
      const index=rule.indexOf("{");
      if(!rule.slice(0,index).split(",").map(s=>s.trim()).includes(selector))continue;
      for(const declaration of rule.slice(index+1,-1).split(";")){const colon=declaration.indexOf(":");if(colon>=0)values[declaration.slice(0,colon).trim()]=declaration.slice(colon+1).trim();}
    }
    return values;
  };
  const group=declarations(".preview-action-groups");
  assert.equal(group["overflow-x"],"auto");
  const padding=parseFloat(group.padding);
  assert.ok(padding>0);
  assert.equal(parseFloat(group.margin),-padding,"shadow allowance must preserve alignment");
  for(const selector of [".toolbar-actions",".toolbar-host-actions"]){
    const values=declarations(selector)["box-shadow"].match(/^-?\d+(?:px)?\s+(-?\d+)px\s+(\d+)px\s+(-?\d+)px/);
    assert.ok(values,selector+" must declare a compact shadow");
    const [,offset,blur,spread]=values.map(Number);
    assert.ok(blur<=4,"action shadows should stay compact");
    assert.ok(Math.abs(offset)+blur+spread<=padding,"the shadow must fit inside its scroll clip");
  }
});


test("host action buttons never shrink or live inside the plugin scrolling clip", async () => {
  const ts = (await import("typescript")).default;
  const source = await readFile(join(root, "src", "main.tsx"), "utf8");
  const tree = ts.createSourceFile("main.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const classOf = node => ts.isJsxElement(node) ? node.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.text === "className")?.initializer?.text : undefined;
  let found = false;
  const visit = node => {
    if (classOf(node) === "toolbar-host-actions") {
      found = true;
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        assert.notEqual(classOf(ancestor), "preview-action-groups", "host actions must remain outside the horizontal clip");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(found, "host actions must be present");
  assert.match(css, /\.toolbar-host-actions\s*\{[^}]*flex-shrink:\s*0/, "host buttons reserve their full width");
});

test("bottom pills bridge nearby gaps without making the whole footer a pointer target", () => {
  for (const pill of [".floating-file-info", ".toolbar-actions", ".toolbar-host-actions"]) {
    const body = ruleBodyOf('.preview-app[data-viewport="window"] '+pill+'::before');
    assert.match(body || "", /inset:\s*-10px/);
    assert.match(body || "", /pointer-events:\s*auto/);
  }
  assert.match(ruleBodyOf('.preview-app[data-viewport="window"] .preview-overlays') || "", /pointer-events:\s*none/);
});

test("the lower blank strip holds chrome without covering the large gap at button height", () => {
 const strip=ruleBodyOf('.preview-app[data-viewport="window"] .preview-overlays::after');
 assert.match(strip || "", /top:\s*calc\(100% - 10px\)/);
 assert.match(strip || "", /bottom:\s*calc\(-1 \* \(var\(--chrome-pad\) - var\(--scrollbar-size, 8px\)\)\)/);
 assert.match(strip || "", /pointer-events:\s*auto/);
});

test("hidden bottom chrome does not translate its hit boxes onto the scrollbar",()=>{
 assert.match(ruleBodyOf('.preview-app[data-viewport="window"] .preview-overlays:not(.shown)')||'',/transform:\s*none/);
});
