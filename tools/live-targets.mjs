// Read the live WebView's real state over the DevTools protocol.
//
// The app creates windows on demand, so there may be no targets until a preview or the
// settings window exists.
//
//   node tools/live-targets.mjs                          list live targets
//   node tools/live-targets.mjs <urlFragment> file.js    evaluate a file of JS in one
//   node tools/live-targets.mjs <urlFragment> file.js --logs   ... and print its console
//
// Always pass expressions as a file. Shell quoting mangles selectors like #id and
// string literals, which silently changes what you measure.
//
// Requires the shared environment from tools/dev-with-debug.ps1.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PORT = process.env.EMBER_DEBUG_PORT || "9222";

export async function liveTargets() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return await response.json();
  } catch {
    console.error(
      `cannot reach the debugger on 127.0.0.1:${PORT}.\n` +
        `Start the shared environment with: .\\tools\\dev-with-debug.ps1\n` +
        `(the port only opens once the app has created a window)`,
    );
    process.exit(1);
  }
}

/** Connect to one target and expose send/evaluate plus a captured console log. */
export function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const logs = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.consoleAPICalled")
        logs.push(
          `[${message.params.type}] ` +
            message.params.args
              .map((arg) => arg.value ?? arg.description ?? arg.type)
              .join(" "),
        );
      if (message.method === "Runtime.exceptionThrown")
        logs.push(
          `[exception] ${
            message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text
          }`,
        );
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry(message);
      }
    });
    socket.addEventListener("error", reject);
    socket.addEventListener("open", () => {
      const client = {
        logs,
        send(method, params) {
          const id = nextId++;
          return new Promise((done) => {
            pending.set(id, done);
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        async evaluate(expression) {
          const result = await client.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          const details = result.result?.exceptionDetails;
          if (details)
            return `EXCEPTION: ${details.exception?.description ?? details.text}`;
          return result.result?.result?.value;
        },
        /** Real keyboard input, so React handlers and native listeners both fire. */
        async typeText(text) {
          await client.send("Input.insertText", { text });
        },
        close: () => socket.close(),
      };
      resolve(client);
    });
  });
}

async function main() {
  const [, , MATCH, EXPRESSION_FILE, ...flags] = process.argv;
  const list = await liveTargets();
  if (!MATCH) {
    if (!list.length)
      console.log("(no live targets - open a preview or the settings window)");
    for (const target of list) console.log(`${target.type.padEnd(8)} ${target.url}`);
    return;
  }
  const target = list.find((entry) => entry.url.includes(MATCH));
  if (!target) {
    console.error(`no target matching ${JSON.stringify(MATCH)}. Live targets:`);
    for (const entry of list) console.error(`  ${entry.type.padEnd(8)} ${entry.url}`);
    process.exitCode = 1;
    return;
  }
  const client = await connect(target.webSocketDebuggerUrl);
  if (flags.includes("--logs")) await client.send("Runtime.enable");
  const expression = await readFile(EXPRESSION_FILE, "utf8");
  console.log(await client.evaluate(expression));
  if (flags.includes("--logs") && client.logs.length) {
    console.log("--- console ---");
    console.log(client.logs.join("\n"));
  }
  client.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
