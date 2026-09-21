import { build, transform } from "esbuild";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { watch } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readTree, createZip } from "./zip.mjs";
import { packageTable } from "./cargo-manifest.mjs";
import { hashInput, hashInputTree } from "./release-inputs.mjs";

export const root = fileURLToPath(new URL("../", import.meta.url));
const plugins = path.join(root, "plugins");
/** Publishable output: one zip per plugin plus the catalog indexing them. Not
 * `dist/`, which belongs to the frontend build and is emptied by Vite. */
const releaseRoot = path.join(root, ".release");
const webSdk = path.join(root, "sdk", "web", "index.js");
// Shared plugin-side UI. Copied into every package next to sdk.js and folded into the
// build hash, so changing a shared component republishes the packages that use it.
const webSdkExtras = [
  [path.join(root, "sdk", "web", "search.js"), "sdk-search.js"],
  [path.join(root, "sdk", "web", "text", "surface.css"), "sdk-text.css"],
  [path.join(root, "sdk", "web", "ui.css"), "sdk-ui.css"],
];
/** Shared modules esbuild bundles into a package as `sdk-<name>.js`, next to the copied ones. */
const bundledSdk = ["view", "navigation", "markdown"];
/** The only libraries a plugin's native crate may link: everything else in this repository is
 *  host-side, and a plugin that linked it would stop being installable on its own. */
const pluginLibraries = [
  { name: "ember-file-store", directory: path.join(root, "crates", "file-store") },
  { name: "ember-plugin-sdk", directory: path.join(root, "sdk", "native") },
  { name: "ember-text-document", directory: path.join(root, "crates", "text-document") },
];
let child;
let serial = Promise.resolve();

/** Names the build places next to a plugin's own ui files, so a page may reference them
 *  without shipping them itself. */
function providedSdkFiles() {
  return new Set([
    "sdk.js",
    ...webSdkExtras.map(([, name]) => name),
    ...bundledSdk.map((name) => `sdk-${name}.js`),
  ]);
}

/** Files a web file references: imports for JS, attributes for HTML, imports and `url()` for
 *  CSS. A guard rather than a parser — it only has to be right about what leaves the package. */
function references(code, extension) {
  const patterns = {
    ".js": /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g,
    ".html": /(?:src|href)\s*=\s*["']([^"']+)["']/g,
    ".css": /@import\s+(?:url\()?\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g,
  }[extension];
  if (!patterns) return [];
  const found = new Set();
  for (const match of code.matchAll(patterns)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) found.add(value);
  }
  return [...found];
}

/** Whether two paths name the same location, case-insensitively where the filesystem is. */
function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/** The dependency tables of a Cargo manifest, with the `path` an entry points at if it has one. */
function cargoDependencies(source) {
  const tables = ["dependencies", "dev-dependencies", "build-dependencies"];
  const dependencies = [];
  let kind = null;
  let nested = false;
  for (const line of source.split("\n")) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      // Tables can be qualified (`[target.'cfg(windows)'.dependencies.foo]`), so the last
      // segment decides whether this is a dependency at all.
      const parts = header[1].split(".").map((part) => part.trim());
      const index = parts.findLastIndex((part) => tables.includes(part));
      kind = index === -1 ? null : parts[index];
      nested = index !== -1 && index < parts.length - 1;
      if (nested) dependencies.push({ name: parts.at(-1), path: null });
      continue;
    }
    if (!kind) continue;
    if (nested) {
      const dependency = dependencies.at(-1);
      const path = line.match(/^\s*path\s*=\s*"([^"]*)"/);
      if (path && dependency) dependency.path = path[1];
      continue;
    }
    const entry = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
    if (!entry) continue;
    dependencies.push({
      // `serde_json.workspace = true` names the dependency before the first dot.
      name: entry[1].split(".")[0],
      path: entry[2].match(/path\s*=\s*"([^"]*)"/)?.[1] ?? null,
    });
  }
  return dependencies;
}

/// Parse the files that go into a package verbatim.
///
/// The bundler never sees them: the shared SDK is copied into every package and a plugin's own
/// ui files are copied as they are, so a syntax error in either ships silently and only shows
/// up as a plugin page that loads nothing. A parse is enough to catch that here instead.
async function checkSyntax(files) {
  for (const [label, code] of files) {
    try {
      await transform(code, { loader: "js" });
    } catch (error) {
      throw new Error(
        `${path.relative(root, label)}: ${String(error.message).split("\n")[0]}`,
      );
    }
  }
}

/// Check that a plugin stands on its own before it is packaged.
///
/// A package is copied verbatim — the web side is not bundled and the native side is a
/// self-contained executable — so a reference to anything the package does not carry only
/// shows up as a plugin that loads nothing or fails to start. The host's own sources are the
/// one thing a plugin must never reach for: the architecture says the host is a shell and
/// plugins are independent, and while both live in one repository nothing else enforces it.
///
/// Three things are checked, all of them cheap and all of them things that were previously
/// only written down in the docs: what a page loads, what a native crate links, and whether
/// the package's version and its crate's version agree.
async function checkPluginBoundary({ directory, manifest }) {
  const label = `plugins/${path.basename(directory)}`;
  const problems = [];
  const ui = path.join(directory, "ui");
  const provided = providedSdkFiles();
  for (const file of await readTree(ui)) {
    const extension = path.extname(file.name).toLowerCase();
    for (const reference of references(file.data.toString("utf8"), extension)) {
      if (reference.startsWith("data:")) continue; // inline assets are the point of a package
      const resolved = path.resolve(ui, reference);
      const outside = path.relative(ui, resolved).startsWith("..");
      if (/^[/\\]|^[a-z][a-z0-9+.-]*:/i.test(reference) || outside) {
        problems.push(
          `${file.name} 引用 ${reference}：只能引用插件自己 ui/ 里的文件或随包分发的 SDK`,
        );
      } else if (
        !(await stat(resolved).then(() => true, () => false)) &&
        !provided.has(path.basename(reference))
      ) {
        problems.push(`${file.name} 引用 ${reference}：包里不会有这个文件`);
      }
    }
  }
  const crate = await readFile(path.join(directory, "native", "Cargo.toml"), "utf8").catch(
    () => null,
  );
  if (crate) {
    const table = packageTable(crate);
    if (table?.inheritsVersion) {
      problems.push(
        "native/Cargo.toml 用 version.workspace 继承了应用版本：插件要自己声明 version",
      );
    } else if (table?.version !== manifest.version) {
      problems.push(
        `版本不一致：plugin.json 是 ${manifest.version}，native/Cargo.toml 是 ${table?.version}`,
      );
    }
    const libraryNames = pluginLibraries.map((library) => library.name);
    for (const dependency of cargoDependencies(crate)) {
      if (dependency.name.startsWith("ember-") && !libraryNames.includes(dependency.name)) {
        problems.push(
          `native 依赖了宿主的 ${dependency.name}：插件只能依赖 ${libraryNames.join("、")}`,
        );
      }
      if (!dependency.path) continue;
      const resolved = path.resolve(path.join(directory, "native"), dependency.path);
      const allowed = pluginLibraries.some((library) =>
        samePath(library.directory, resolved),
      );
      if (!allowed) {
        const relative = path.relative(root, resolved).replace(/\\/g, "/");
        problems.push(
          `native 按路径依赖 ${relative}：插件只能依赖 ${pluginLibraries
            .map((library) => path.relative(root, library.directory).replace(/\\/g, "/"))
            .join(" 与 ")}`,
        );
      }
    }
  }
  if (problems.length)
    throw new Error(`${label} 不是自足的包：\n  ${problems.join("\n  ")}`);
}

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

/** Names of the files a package carries, relative to its `ui` directory. */
async function packageFiles(ui, prefix = "", names = new Set()) {
  for (const entry of await readdir(path.join(ui, prefix), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory())
      await packageFiles(ui, `${prefix}${entry.name}/`, names);
    else names.add(`${prefix}${entry.name}`);
  }
  return names;
}

/**
 * A page that imports something the package does not carry fails at load with no visible
 * error: the tool keeps showing its static markup, which looks like a working but empty
 * screen. Packaging therefore refuses to write a package whose own references cannot be
 * satisfied, including the assets and prompts a development kit declares.
 */
async function verifyPackage({ directory, manifest, provided }) {
  const ui = path.join(directory, "ui");
  const files = await packageFiles(ui);
  const carried = new Set([...files, ...provided]);
  const missing = [];
  for (const name of files) {
    if (!/\.(js|html|css)$/.test(name)) continue;
    const code = await readFile(path.join(ui, name), "utf8");
    for (const reference of references(code, path.extname(name))) {
      if (/^(data:|https?:|#)/.test(reference)) continue;
      const target = reference.split(/[?#]/)[0].replace(/^\.\//, "");
      // A bare specifier without a file extension is a package import, not ours.
      if (!/\.[a-z0-9]+$/i.test(target)) continue;
      if (!carried.has(target)) missing.push(`${name} -> ${reference}`);
    }
  }
  if (files.has("development-kit.json")) {
    const kit = JSON.parse(
      await readFile(path.join(ui, "development-kit.json"), "utf8"),
    );
    for (const name of [...(kit.assets ?? []), kit.prompt, kit.analysisPrompt])
      if (name && !carried.has(name))
        missing.push(`development-kit.json -> ${name}`);
  }
  if (missing.length)
    throw new Error(
      `${manifest.id}: the package does not carry files it references: ${missing.join(", ")}`,
    );
}

/** The target a built package runs on, as `os-arch`. Packaging runs on the build
 * host, so the native executable in the package is the host's target. */
function hostTarget() {
  const os = { win32: "windows", darwin: "macos", linux: "linux" }[
    process.platform
  ];
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  if (!os || !arch)
    throw new Error(`Unsupported build host: ${process.platform}-${process.arch}`);
  return `${os}-${arch}`;
}

/**
 * Stable JSON for hashing: object keys sorted, so reformatting a manifest or
 * reordering its keys does not change what a package is. `revision` is excluded
 * because the installer assigns it, and `buildId` is the output.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Build every plugin and write the market a source serves: one zip per plugin plus the
 * catalog indexing them. The host ships no packages, so this output is either the dev
 * host's local mirror or the upload for a release.
 */
async function publish(release, { dist = false } = {}) {
  const target = hostTarget();
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
  const marketRoot = dist ? releaseRoot : path.join(root, ".marketplace");
  await mkdir(marketRoot, { recursive: true });
  const catalog = [];
  const inputs = {};
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

  // Everything a package carries verbatim, checked before the first byte is written.
  await checkSyntax([
    ...[[webSdk, await readFile(webSdk, "utf8")]].map(([file, code]) => [file, code]),
    ...(await Promise.all(
      webSdkExtras
        .filter(([source]) => source.endsWith(".js"))
        .map(async ([source]) => [source, await readFile(source, "utf8")]),
    )),
    ...(
      await Promise.all(
        entries.map(async ({ directory }) =>
          (await readTree(path.join(directory, "ui")))
            .filter((file) => file.name.endsWith(".js"))
            .map((file) => [
              path.join(directory, "ui", file.name),
              file.data.toString("utf8"),
            ]),
        ),
      )
    ).flat(),
  ]);
  // Each package has to stand on its own; see checkPluginBoundary.
  for (const entry of entries) await checkPluginBoundary(entry);
  for (const { directory, manifest, listing, binary } of entries) {
    // Source identity is separate from PE build identity: rebuilding unchanged sources
    // may change linker timestamps. Publication can reuse the original immutable package.
    const input = createHash("sha256").update(canonical(manifest)).update(target);
    for (const name of ["Cargo.toml", "Cargo.lock", "package-lock.json", "scripts/build-plugins.mjs", "scripts/zip.mjs", "scripts/release-inputs.mjs", "scripts/cargo-manifest.mjs"]) {
      hashInput(input, name, await readFile(path.join(root, name)));
    }
    await hashInputTree(input, path.join(directory, "native"), "native");
    await hashInputTree(input, path.join(directory, "ui"), "ui");
    await hashInputTree(input, path.join(root, "sdk"), "sdk");
    const nativeManifest = await readFile(path.join(directory, "native", "Cargo.toml"), "utf8");
    for (const library of pluginLibraries.filter((lib) => lib.name !== "ember-plugin-sdk" && nativeManifest.includes(lib.name))) {
      await hashInputTree(input, library.directory, library.name);
    }
    inputs[manifest.id] = input.digest("hex");
    const executable = process.platform === "win32" ? `${binary}.exe` : binary;
    const native = path.join(
      root,
      "target",
      release ? "release" : "debug",
      executable,
    );
    // The hash covers everything a package is apart from the install-time revision:
    // the declaration, where the executable sits in the package, and the target it runs on.
    const published = { ...manifest, executable: `bin/${executable}`, targets: [target] };
    const hash = createHash("sha256").update(canonical(published));
    // A plugin only carries the shared UI it actually imports: copying the search bar into
    // a plugin that never opens a panel would be dead weight in every published package.
    // Both the published name (`./sdk-search.js`) and the source file name (`search.js`)
    // count, so a plugin written against either spelling still gets the file it imports.
    const uiText = await treeText(path.join(directory, "ui"));
    const extras = webSdkExtras.filter(([source, name]) => {
      const base = path.basename(source);
      return uiText.includes(name) || uiText.includes(base);
    });
    const bundled = [];
    for (const name of bundledSdk) {
      if (uiText.includes(`sdk-${name}.js`))
        bundled.push(...(await bundle(name)));
    }
    await verifyPackage({ directory, manifest, provided: ["sdk.js", ...extras.map(([, name]) => name), ...bundled.map((file) => path.basename(file.path))] });
    for (const file of bundled) hash.update(file.contents);
    hash.update(await readFile(native));
    hash.update(await readFile(webSdk));
    for (const [source] of extras) hash.update(await readFile(source));
    await digestTree(path.join(directory, "ui"), hash);
    const buildId = hash.digest("hex");
    // Content-addressed by plugin, version and build, so an artifact name identifies
    // exactly one package and a new build never overwrites an older one.
    const artifact = `${manifest.id}-${manifest.version}-${buildId.slice(0, 24)}.zip`;
    const destination = path.join(marketRoot, artifact);
    if (!(await stat(destination).catch(() => null))) {
      const staging = path.join(marketRoot, `.stage-${process.pid}-${manifest.id}`);
      await rm(staging, { recursive: true, force: true });
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
      // The install-time revision is zeroed: the installer assigns it, and leaving the
      // build clock in here would make the same inputs produce different bytes, which
      // would make the catalog's sha256 meaningless.
      await writeFile(
        path.join(staging, "plugin.json"),
        JSON.stringify({ ...published, revision: 0, buildId }, null, 2),
      );
      await writeFile(destination, createZip(await readTree(staging)));
      await rm(staging, { recursive: true, force: true });
    }
    const zip = await readFile(destination);
    const i18n = localizedText(manifest, listing);
    catalog.push({
      id: manifest.id,
      artifact,
      sha256: createHash("sha256").update(zip).digest("hex"),
      size: zip.length,
      version: manifest.version,
      buildId,
      // Everything the market card needs before anything is downloaded, including
      // whether the source suggests this plugin for a fresh installation.
      name: manifest.name,
      extensions: manifest.extensions,
      ...(manifest.icon ? { icon: manifest.icon } : {}),
      targets: [target],
      summary: listing.summary,
      publisher: listing.publisher,
      ...(Object.keys(i18n).length ? { i18n } : {}),
      ...(listing.recommended ? { recommended: true } : {}),
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
  // The catalog is the only entry point, so anything else left in these directories is
  // a previous build's leftovers. Leaving them costs the dev machine disk and would put
  // stale packages in an upload.
  const keep = new Set(catalog.map((entry) => entry.artifact));
  await prune(marketRoot, keep);
  if (dist) {
    const catalogSha256 = createHash("sha256").update(await readFile(path.join(releaseRoot, "catalog.json"))).digest("hex");
    await writeFile(path.join(releaseRoot, "release-inputs.json"), JSON.stringify({ api: 1, target, inputs, catalogSha256 }, null, 2));
    console.log(`Release: ${catalog.length} packages in .release/, ready to upload`);
  }
}

/**
 * The display text a catalog entry carries per language: the name the plugin declares for
 * itself, and the summary the listing describes it with. Both live in the plugin's own
 * files, so publishing a translation is publishing the plugin, and a card can be drawn in
 * the reader's language without downloading anything.
 */
function localizedText(manifest, listing) {
  const entries = new Map();
  const put = (tag, field, value) => {
    if (typeof value !== "string" || !value) return;
    entries.set(tag, { ...(entries.get(tag) || {}), [field]: value });
  };
  for (const [tag, text] of Object.entries(manifest.i18n || {}))
    put(tag, "name", text?.name);
  for (const [tag, text] of Object.entries(listing.i18n || {}))
    put(tag, "summary", text?.summary);
  return Object.fromEntries(
    [...entries].filter(([, text]) => Object.keys(text).length > 0),
  );
}

/**
 * Remove everything in `directory` that the catalog does not reference. An upload should
 * carry exactly the packages its index names, and a dev machine should not accumulate
 * every build it has ever produced.
 */
async function prune(directory, keep) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    // Directories are never part of a published market: the earlier layout left unpacked
    // packages here, and staging directories are leftovers from interrupted builds.
    if (entry.isDirectory()) {
      await rm(location, { recursive: true, force: true });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".zip")) continue;
    if (!keep.has(entry.name)) await rm(location, { force: true });
  }
}

export function buildPlugins({ release = false, dist = false } = {}) {
  serial = serial.catch(() => {}).then(() => publish(release, { dist }));
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
    path.join(root, "crates", "file-store"),
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
  const argv = process.argv;
  try {
    await buildPlugins({
      // `--dist` writes the uploadable artifacts, so it always packages release
      // binaries: putting a debug executable in a zip people download is not a choice
      // worth offering.
      release: argv.includes("--release") || argv.includes("--dist"),
      dist: argv.includes("--dist"),
    });
  } catch (error) {
    console.error(error);
    stopWatching();
    process.exitCode = 1;
  }
}
