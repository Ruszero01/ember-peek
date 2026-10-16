// “开机自启”的契约测试。规范写在 docs/specs/start-with-windows.md，这里钉住三件在门禁里能验的事：
// 规范与原生代码指向同一个注册表键和值名（否则文档说的和应用做的会各走各的）；设置开关显示的是
// 从注册表读回的状态而不是用户点的那一下（否则写入被拒绝时开关会撒谎）；这个条目只由一个模块
// 拥有，网页也不在本地留它的副本。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const nativePath = join(root, "src-tauri", "src", "autostart.rs");
const native = await readFile(nativePath, "utf8");
const spec = await readFile(join(root, "docs", "specs", "start-with-windows.md"), "utf8");
const main = await readFile(join(root, "src", "main.tsx"), "utf8");

/** A `const NAME: &str = "..."` or `r"..."` from the native module. */
function constant(name) {
  const match = native.match(new RegExp(`const ${name}: &str =\\s*r?"([^"]+)"`));
  assert.ok(match, `autostart.rs no longer declares ${name}`);
  return match[1];
}

/** Every .rs file under a directory, at any depth. */
async function rustFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await rustFiles(path)));
    else if (entry.name.endsWith(".rs")) found.push(path);
  }
  return found;
}

test("the spec names the registry location the native code opens", () => {
  // The doc is the contract, so it has to carry the exact key path and value name: a value
  // name that drifts leaves the old entry behind and starts the app twice at sign-in.
  for (const [label, key] of [
    ["the per-user Run key", constant("RUN_KEY")],
    ["Explorer's approval state", constant("APPROVAL_KEY")],
  ]) {
    assert.ok(
      spec.includes(`HKCU\\${key}`),
      `docs/specs/start-with-windows.md must name ${label}: HKCU\\${key}`,
    );
  }
  assert.ok(
    spec.includes(`\`${constant("VALUE")}\``),
    `docs/specs/start-with-windows.md must name the stored value: ${constant("VALUE")}`,
  );
});

test("the switch shows the state the registry reports, not the click", () => {
  const start = main.indexOf('t("autostart.label")');
  assert.ok(start > 0, "the general page no longer offers start-with-Windows");
  const row = main.slice(start, main.indexOf("</Toggle>", start));
  // Writing and then asking the host what the entry holds is what makes a refused write snap
  // the switch back; adopting the clicked value would leave it claiming a state Windows never
  // took.
  assert.ok(
    row.indexOf('call("set_autostart"') < row.indexOf('call<boolean>("autostart_enabled")'),
    "the switch must read the entry back after writing it",
  );
  assert.doesNotMatch(
    row,
    /setAutostart\((enabled|!checked)\)/,
    "the switch must not adopt the clicked value as the state",
  );
  // Nothing is known until the host answers, and the switch has to look it.
  assert.match(row, /disabled=\{autostart === null\}/);
  assert.match(row, /checked=\{autostart === true\}/);
});

test("one module owns the entry, and the window keeps no copy of it", async () => {
  // The entry is written by the host under the current user's profile. A second writer in a
  // shared crate, a plugin or the front end would be writing the same value from somewhere
  // that cannot re-read it.
  const run = constant("RUN_KEY");
  const owners = [];
  for (const file of [
    ...(await rustFiles(join(root, "src-tauri", "src"))),
    ...(await rustFiles(join(root, "crates"))),
  ]) {
    if (file === nativePath) continue;
    if ((await readFile(file, "utf8")).includes(run)) owners.push(file.slice(root.length + 1));
  }
  assert.deepEqual(owners, [], `these files also name the Run key: ${owners.join(", ")}`);

  // The window remembers its own appearance settings in localStorage. This one must not go
  // there: it would be a stale answer the moment the entry changes outside the app.
  const saved = main.slice(main.indexOf("function savedSettings"), main.indexOf("const settingsWindow"));
  assert.ok(saved.length > 0, "savedSettings should still be one function");
  assert.doesNotMatch(saved, /autostart/i, "the window must not cache the entry locally");
});

test("uninstall clears Explorer state while updates preserve it", async () => {
  const config = JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const hooks = await readFile(join(root, "src-tauri", config.bundle.windows.nsis.installerHooks), "utf8");
  assert.match(hooks, /!macro NSIS_HOOK_POSTUNINSTALL/);
  assert.match(hooks, /\$\{If\} \$UpdateMode <> 1\s+DeleteRegValue HKCU/);
  assert.ok(hooks.includes(`"${constant("APPROVAL_KEY")}" "${constant("VALUE")}"`));
  assert.doesNotMatch(hooks, /DeleteRegKey/);
});

test("a refused approval reset is reported before changing the Run entry", () => {
  const set = native.slice(native.indexOf("pub fn set("), native.indexOf("#[cfg(test)]"));
  assert.equal((set.match(/registry::clear_approval\(VALUE\)\?/g) ?? []).length, 2);
  assert.ok(set.indexOf("registry::clear_approval(VALUE)?") < set.indexOf("registry::write("));
  const off = set.slice(set.indexOf("} else {"));
  assert.ok(off.indexOf("registry::clear_approval(VALUE)?") < off.indexOf("registry::remove("));
  const clear = native.slice(native.indexOf("pub(super) fn clear_approval"), native.indexOf("/// Whether this app"));
  assert.match(clear, /Result<\(\), String>/);
  assert.match(clear, /other => Err\(code\(other\)\)/);
});
