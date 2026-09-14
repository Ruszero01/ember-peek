import { build } from "esbuild";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import { watch } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
const plugins = path.join(root, "plugins");
const webSdk = path.join(root, "sdk", "web", "index.js");
// Shared plugin-side UI. Copied into every package next to sdk.js and folded into the
// build hash, so changing a shared component republishes the packages that use it.
const webSdkExtras = [
  [path.join(root, "sdk", "web", "search.js"), "sdk-search.js"],
  [path.join(root, "sdk", "web", "text", "surface.css"), "sdk-text.css"],
  [path.join(root, "sdk", "web", "ui.css"), "sdk-ui.css"],
];
let child;
let serial = Promise.resolve();

async function digestTree(directory, hash) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    hash.update(entry.name);
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) await digestTree(location, hash);
    else hash.update(await readFile(location));
  }
}

/** Concatenated text of a plugin's web files, used to see which shared UI it imports. */
async function treeText(directory, out = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) await treeText(location, out);
    else if (/\.(html|js|css|mjs)$/.test(entry.name))
      out.push(await readFile(location, "utf8"));
  }
  return out.join("\n");
}

async function publish(release) {
  const entries = [];
  for (const dir of await readdir(plugins, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const directory = path.join(plugins, dir.name);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "plugin.json"), "utf8"),
    );
    const listing = JSON.parse(
      await readFile(path.join(directory, "listing.json"), "utf8"),
    );
    entries.push({
      directory,
      manifest,
      listing,
      binary: path.basename(manifest.executable, ".exe"),
    });
  }
  if (!entries.length) throw new Error("No marketplace plugins found");
  await new Promise((resolve, reject) => {
    child = spawn(
      "cargo",
      [
        "build",
        ...(release ? ["--release"] : []),
        ...entries.flatMap((entry) => ["-p", entry.binary]),
      ],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      child = undefined;
      code === 0 ? resolve() : reject(new Error(`Plugin build exited ${code}`));
    });
  });
  const marketRoot = path.join(root, ".marketplace");
  await mkdir(marketRoot, { recursive: true });
  const catalog = [];
  const compiled = new Map();
  async function bundle(name) {
    if (compiled.has(name)) return compiled.get(name);
    const output = await build({
      absWorkingDir: root,
      entryPoints: [
        {
          in: path.join(root, "sdk", "web", "text", `${name}.js`),
          out: `sdk-${name}`,
        },
      ],
      bundle: true,
      splitting: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      minify: true,
      outdir: path.join(root, ".plugin-web"),
      write: false,
      plugins: [
        {
          name: "host-sdk-external",
          setup(builder) {
            builder.onResolve({ filter: /index\.js$/ }, (args) =>
              args.path === "../index.js"
                ? { path: "./sdk.js", external: true }
                : undefined,
            );
          },
        },
      ],
    });
    compiled.set(name, output.outputFiles);
    return output.outputFiles;
  }

  for (const { directory, manifest, listing, binary } of entries) {
    const executable = process.platform === "win32" ? `${binary}.exe` : binary;
    const native = path.join(
      root,
      "target",
      release ? "release" : "debug",
      executable,
    );
    const hash = createHash("sha256").update(JSON.stringify(manifest));
    // A plugin only carries the shared UI it actually imports: copying the search bar into
    // a plugin that never opens a panel would be dead weight in every published package.
    // Matched on the published name, not the source name: a plugin import says
    // `./sdk-gutter.js`, so a filter looking for `gutter.js` never matched and the package
    // came out without the module the plugin imports.
    const uiText = await treeText(path.join(directory, "ui"));
    const extras = webSdkExtras.filter(([source, name]) => {
      const base = path.basename(source);
      return uiText.includes(name) || uiText.includes(base);
    });
    const bundled = [];
    for (const name of ["view", "navigation", "markdown"]) {
      if (uiText.includes(`sdk-${name}.js`))
        bundled.push(...(await bundle(name)));
    }
    for (const file of bundled) hash.update(file.contents);
    hash.update(await readFile(native));
    hash.update(await readFile(webSdk));
    for (const [source] of extras) hash.update(await readFile(source));
    await digestTree(path.join(directory, "ui"), hash);
    const buildId = hash.digest("hex");
    const name = `${manifest.id}-${buildId.slice(0, 24)}`;
    const destination = path.join(marketRoot, name);
    if (!(await stat(destination).catch(() => null))) {
      const staging = path.join(marketRoot, `.${name}-${process.pid}`);
      await mkdir(path.join(staging, "bin"), { recursive: true });
      await cp(path.join(directory, "ui"), path.join(staging, "ui"), {
        recursive: true,
      });
      await cp(webSdk, path.join(staging, "ui", "sdk.js"));
      for (const file of bundled)
        await writeFile(
          path.join(staging, "ui", path.basename(file.path)),
          file.contents,
        );
      for (const [source, name] of extras)
        await cp(source, path.join(staging, "ui", name));
      await cp(native, path.join(staging, "bin", executable));
      await writeFile(
        path.join(staging, "plugin.json"),
        JSON.stringify(
          {
            ...manifest,
            executable: `bin/${executable}`,
            revision: Date.now(),
            buildId,
          },
          null,
          2,
        ),
      );
      try {
        await rename(staging, destination);
      } catch (error) {
        // Another builder may have published the identical immutable package.
        const published = await readFile(
          path.join(destination, "plugin.json"),
          "utf8",
        )
          .then((value) => JSON.parse(value))
          .catch(() => null);
        if (published?.buildId !== buildId) throw error;
      }
    }
    catalog.push({
      id: manifest.id,
      directory: name,
      summary: listing.summary,
      publisher: listing.publisher,
    });
    console.log(
      `Market: ${manifest.name} ${manifest.version} (${buildId.slice(0, 8)})`,
    );
  }
  const temporary = path.join(marketRoot, `.catalog-${process.pid}.json`);
  await writeFile(
    temporary,
    JSON.stringify({ api: 1, entries: catalog }, null, 2),
  );
  await rename(temporary, path.join(marketRoot, "catalog.json"));
}

export function buildPlugins({ release = false } = {}) {
  serial = serial.catch(() => {}).then(() => publish(release));
  return serial;
}

export function watchPlugins() {
  let timer,
    running = false,
    dirty = false,
    closed = false;
  async function rebuild() {
    if (closed) return;
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      await buildPlugins();
    } catch (error) {
      console.error("[plugins]", error.message);
    } finally {
      running = false;
      if (dirty && !closed) {
        dirty = false;
        schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 300);
  }
  const watchers = [
    plugins,
    path.join(root, "sdk"),
    path.join(root, "crates", "text-document"),
  ].map((directory) => watch(directory, { recursive: true }, schedule));
  for (const watcher of watchers)
    watcher.on("error", (error) => console.error("[plugin watcher]", error));
  return () => {
    closed = true;
    clearTimeout(timer);
    watchers.forEach((w) => w.close());
  };
}

export async function stopBuild() {
  const processId = child?.pid;
  if (!processId) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(processId), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
  } else child?.kill("SIGTERM");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const stopWatching = process.argv.includes("--watch")
    ? watchPlugins()
    : () => {};
  const shutdown = async () => {
    stopWatching();
    await stopBuild();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await buildPlugins({ release: process.argv.includes("--release") });
  } catch (error) {
    console.error(error);
    stopWatching();
    process.exitCode = 1;
  }
}
