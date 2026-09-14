import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateControls,
  isSessionOwning,
  ROLES,
  Selection,
  pluginPath,
  isContributionCurrent,
} from "../src/protocol.mjs";

test("only the most recent selection may present a completed request", () => {
  const selection = new Selection();
  const first = selection.begin();
  assert.equal(selection.current(first), true);
  const second = selection.begin();
  assert.equal(selection.current(first), false);
  assert.equal(selection.current(second), true);
});
test("host accepts generic controls without knowing renderer or action semantics", () => {
  const controls = validateControls([
    { id: "copy", kind: "button", label: "复制" },
    { id: "grid", kind: "toggle", label: "网格", active: true },
  ]);
  assert.deepEqual(
    controls.map((control) => control.id),
    ["copy", "grid"],
  );
  assert.equal(controls[1].active, true);
});
test("a toggle control carries the state the host draws", () => {
  const [off, on] = validateControls([
    { id: "a", kind: "toggle", label: "A" },
    { id: "b", kind: "toggle", label: "B", active: "yes" },
  ]);
  // Only an explicit true lights a control up, so a typo cannot silently press it.
  assert.equal(off.active, false);
  assert.equal(on.active, false);
});
test("malformed or excessive controls never enter the host UI", () => {
  for (const bad of [
    [{ id: "", kind: "button", label: "x" }],
    [{ id: "a", kind: "menu", label: "x" }],
    [{ id: "a", kind: "button", label: "x".repeat(81) }],
    [{ id: "a", kind: "button", label: "x" }, { id: "a", kind: "button", label: "y" }],
  ])
    assert.throws(() => validateControls(bad));
  assert.throws(() =>
    validateControls(
      Array.from({ length: 17 }, (_, i) => ({
        id: `c${i}`,
        kind: "button",
        label: "x",
      })),
    ),
  );
});
test("plugin asset URLs preserve path segments for relative module imports", () => {
  assert.equal(pluginPath("s1", "ui/index.html"), "s1/ui/index.html");
  assert.equal(pluginPath("s1", "ui/my view.html"), "s1/ui/my%20view.html");
});
test("search is no longer a host control kind", () => {
  // The search bar belongs to the plugin's own panel; the host only draws buttons and
  // toggles and forwards control ids it does not interpret.
  assert.throws(() =>
    validateControls([{ id: "search", kind: "search", label: "搜索文本" }]),
  );
});
test("a plugin's floating panel may not speak for the session it shares with the view", () => {
  // One entry can be mounted twice. The view owns the lifecycle, the dirty flag and the
  // document, so a panel mount must not be able to race it over any of them.
  for (const method of [
    "presented",
    "dirty",
    "fileChanged",
    "returnView",
    "mutate",
  ])
    assert.equal(isSessionOwning(method), true);
  // Reading, calling the native process, its own panel visibility and the pipe between its
  // two mounts stay allowed on both sides.
  for (const method of ["read", "call", "panel", "peer", "setting", "clipboard", "sourceCall"])
    assert.equal(isSessionOwning(method), false);
});
test("the pipe only has two ends", () => {
  assert.deepEqual(ROLES, ["view", "panel"]);
});

test("overlay-only highlight follows visibility after open, close and reopen", () => {
  const overlay = { id: "metadata-session", pluginId: "metadata", capabilities: ["overlay"] };
  const current = expanded => isContributionCurrent(overlay, "markdown-session", overlay.id, expanded);
  assert.equal(current([]), false);
  assert.equal(current(["metadata"]), true);
  // Closing from the bubble, plugin message, or panel limit all remove this id.
  assert.equal(current([]), false);
  assert.equal(current(["metadata"]), true);
  assert.equal(isContributionCurrent(overlay, overlay.id, overlay.id, []), false);
  assert.equal(isContributionCurrent(overlay, null, null, ["metadata"]), true);
});

test("view and combined contributions follow the selected view, not panel visibility", () => {
  for (const capabilities of [["view"], ["view", "overlay"]]) {
    const view = { id: "view-session", pluginId: "viewer", capabilities };
    assert.equal(isContributionCurrent(view, view.id, null, []), true);
    assert.equal(isContributionCurrent(view, "other-session", view.id, ["viewer"]), false);
  }
});

test("scrub controls retain numeric bounds and reject invalid ranges", () => {
  const control = { id: "zoom", kind: "scrub", label: "缩放比例", value: 100, min: 2, max: 2000, suffix: "%" };
  const [validated] = validateControls([control]);
  assert.equal(validated.value, 100);
  assert.equal(validated.suffix, "%");
  assert.equal(validated.min, 2);
  assert.equal(validated.max, 2000);
  for (const patch of [{ value: NaN }, { min: 0 }, { max: Infinity }, { max: 2 }, { value: 3000 }]) {
    assert.throws(() => validateControls([{ ...control, ...patch }]));
  }
});
