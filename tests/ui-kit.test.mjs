import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The host and the plugin kit are separate artifacts — one is bundled by Vite, the other is
// copied into every package — so the same control is written twice on purpose. These check
// the two copies still describe the same control, which is the part a hand edit forgets.

const root = fileURLToPath(new URL("../", import.meta.url));
const hostSelect = readFileSync(join(root, "src/select.css"), "utf8");
const kit = readFileSync(join(root, "sdk/web/ui.css"), "utf8");

test("the dropdown keeps both of its rendering paths on both sides", () => {
  // Where Chromium has the customizable select the list is ours; where it does not, the
  // closed control still is. Losing either rule leaves a native-looking control behind.
  for (const [side, css, selector] of [
    ["src/select.css", hostSelect, ".select-control"],
    ["sdk/web/ui.css", kit, ".ui-select"],
  ]) {
    assert.ok(css.includes(`${selector} select`), `${side} lost the control rule`);
    assert.match(css, /appearance:\s*base-select/, `${side} lost the styled popup path`);
    assert.match(css, /::picker\(select\)/, `${side} lost the popup surface`);
    // The popup only becomes ours when the picker opts in as well. With the control alone
    // the list is drawn by the platform, which looks exactly like the rules were never
    // written — and reads as "the styles are ugly", not as a missing line of CSS.
    assert.match(
      pickerRule(css),
      /appearance:\s*base-select/,
      `${side} popup did not opt in to base-select`,
    );
    assert.match(css, /option:checked/, `${side} lost the selected row`);
    // The popup is not the platform's any more, so its colours have to come from tokens.
    assert.match(css, /--mask|mask:/, `${side} lost the token-coloured chevron`);
  }
});

/** The body of the `::picker(select)` rule. Matched with its brace so a comment that merely
 *  mentions the pseudo-element is not mistaken for the rule. */
function pickerRule(css) {
  return css.match(/::picker\(select\)\s*\{([^}]*)\}/)?.[1] ?? "";
}

test("the host draws every dropdown through the one component", () => {
  // A stray <select> somewhere else is a second look for the same control, which is exactly
  // what the component exists to prevent.
  const sources = readdirSync(join(root, "src"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => [name, readFileSync(join(root, "src", name), "utf8")]);
  const rendering = sources
    .filter(([, source]) => /<select[\s>]/.test(source))
    .map(([name]) => name);
  assert.deepEqual(rendering, ["Select.tsx"]);
});


test("host and plugin scrollbars use one packaged source with both axes and no arrows",()=>{
  const shared=readFileSync(join(root,"sdk/web/scrollbars.css"),"utf8");
  const host=readFileSync(join(root,"src/style.css"),"utf8");
  assert.match(host,/@import\s+["']\.\.\/sdk\/web\/scrollbars\.css["']/);
  assert.match(kit,/@import\s+["']\.\/sdk-scrollbars\.css["']/);
  assert.match(shared,/::-webkit-scrollbar-button\s*\{[^}]*display:\s*none/);
  assert.match(shared,/width:\s*var\(--scrollbar-size\)/);
  assert.match(shared,/height:\s*var\(--scrollbar-size\)/);
  assert.match(shared,/::-webkit-scrollbar-thumb:hover/);
  assert.match(shared,/::-webkit-scrollbar-thumb:active/);
  const build=readFileSync(join(root,"scripts/build-plugins.mjs"),"utf8");
  assert.match(build,/"scrollbars\.css"\), "sdk-scrollbars\.css"/);
});


test("every official plugin opts into shared scrollbars without a competing text override",()=>{
 for(const name of readdirSync(join(root,"plugins"),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name)){
   const manifest=JSON.parse(readFileSync(join(root,"plugins",name,"plugin.json"),"utf8"));
   const html=readFileSync(join(root,"plugins",name,manifest.entry),"utf8");
   assert.match(html,/href=["'](?:\.\/)?sdk-(?:ui|scrollbars)\.css["']/,name+" must opt into the shared style");
 }
 const text=readFileSync(join(root,"sdk/web/text/surface.css"),"utf8");
 assert.doesNotMatch(text,/scrollbar-(?:color|width):/,"text plugins must not override the shared WebView2 scrollbar");
});
