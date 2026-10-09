import test from "node:test";
import assert from "node:assert/strict";
import { selectSdkAssets } from "../scripts/sdk-assets.mjs";

test("SDK packaging includes transitive stylesheet imports without unrelated assets", () => {
  const assets = [
    { source: "/sdk/ui.css", name: "sdk-ui.css", contents: '@import "./sdk-scrollbars.css";' },
    { source: "/sdk/scrollbars.css", name: "sdk-scrollbars.css", contents: '@import "./sdk-ui.css";' },
    { source: "/sdk/search.js", name: "sdk-search.js", contents: "" },
  ];
  assert.deepEqual(selectSdkAssets('<link href="sdk-ui.css">', assets).map(a => a.name), ["sdk-ui.css", "sdk-scrollbars.css"]);
  assert.deepEqual(selectSdkAssets("", assets), []);
});
