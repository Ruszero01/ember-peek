// Screenshot a live window, optionally clipped, so icons and layout can be judged from
// pixels instead of assumed.
//
//   node tools/live-shot.mjs out.png                  whole preview window
//   node tools/live-shot.mjs out.png 820 672 232 62 3 clip: x y width height scale
//
// Set EMBER_SHOT_TARGET to a URL fragment to capture another window, e.g.
// EMBER_SHOT_TARGET=window=settings (PowerShell: $env:EMBER_SHOT_TARGET="window=settings").
import { writeFileSync } from "node:fs";

const PORT = process.env.EMBER_DEBUG_PORT || "9444";
const MATCH = process.env.EMBER_SHOT_TARGET || "window=preview";
const [, , OUT, X, Y, W, H, SCALE] = process.argv;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((entry) => entry.url.includes(MATCH));
if (!target) {
  console.error(`no window matching ${JSON.stringify(MATCH)}. Live targets:`);
  for (const entry of list) console.error(`  ${entry.type} ${entry.url}`);
  process.exit(1);
}
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (entry) {
    pending.delete(message.id);
    entry(message);
  }
});
await new Promise((resolve) => socket.addEventListener("open", resolve));
const send = (method, params) => {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
};

const clip = X
  ? {
      x: Number(X),
      y: Number(Y),
      width: Number(W),
      height: Number(H),
      scale: Number(SCALE || 1),
    }
  : undefined;
const shot = await send("Page.captureScreenshot", {
  format: "png",
  ...(clip ? { clip } : {}),
});
if (!shot.result?.data) {
  console.error("capture failed:", JSON.stringify(shot).slice(0, 300));
  process.exit(1);
}
writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log("saved", OUT);
socket.close();
