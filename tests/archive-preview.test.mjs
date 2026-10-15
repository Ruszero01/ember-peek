import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ancestorsOf,
  batchesBySize,
  buildTree,
  cleanPath,
  compactEntry,
  concatBytes,
  decodeText,
  describeError,
  expandEntry,
  filterTree,
  firstPreviewable,
  hexDump,
  humanBytes,
  kindOf,
  looksLikeText,
  mimeOf,
  packedShare,
  sortTree,
  visibleRows,
} from "../plugins/archive/ui/model.js";
import { ARCHIVE_TEXT } from "../plugins/archive/ui/text.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

const record = (name, extra = {}) => ({
  name,
  dir: false,
  size: 0,
  packed: 0,
  modified: null,
  encrypted: false,
  method: "deflate",
  index: 0,
  ...extra,
});

test("sizes read in the binary units the rest of the preview uses", () => {
  assert.equal(humanBytes(0), "0 B");
  assert.equal(humanBytes(999), "999 B");
  assert.equal(humanBytes(1024), "1.0 KiB");
  assert.equal(humanBytes(1536), "1.5 KiB");
  assert.equal(humanBytes(1024 * 1024), "1.0 MiB");
  assert.equal(humanBytes(20 * 1024 * 1024), "20 MiB");
  assert.equal(humanBytes(3 * 1024 ** 3), "3.0 GiB");
  assert.equal(humanBytes(-1), "—");
  assert.equal(humanBytes(Number.NaN), "—");
});

test("a flat directory becomes a tree with the folders it never listed", () => {
  const records = [
    record("docs/readme.txt", { size: 10, index: 0 }),
    record("docs/img/shot.png", { size: 90, index: 1 }),
    record("docs/img/", { dir: true, index: 2 }),
    record("./docs\\notes.md", { size: 5, index: 3 }),
    record("empty.bin", { size: 1, index: 4 }),
  ];
  const tree = buildTree(records);
  const names = tree.children.map((child) => child.name);
  assert.deepEqual(names.sort(), ["docs", "empty.bin"]);
  const docs = tree.children.find((child) => child.name === "docs");
  assert.ok(docs.dir);
  assert.equal(docs.size, 105);
  assert.equal(docs.files, 3);
  assert.equal(docs.folders, 1);
  const img = docs.children.find((child) => child.name === "img");
  assert.equal(img.size, 90);
  assert.equal(img.children[0].index, 1);
  assert.equal(docs.children.find((child) => child.name === "readme.txt").path, "docs/readme.txt");
  assert.equal(docs.children.find((child) => child.name === "notes.md").path, "docs/notes.md");
});

test("names are shown the way an archive wrote them, minus what would confuse two files", () => {
  assert.equal(cleanPath("./a/b/"), "a/b");
  assert.equal(cleanPath("/a\\b"), "a/b");
  assert.equal(cleanPath(""), "");
  assert.equal(ancestorsOf("a/b/c.txt").join(","), "a,a/b");
  assert.equal(ancestorsOf("c.txt").length, 0);
});

test("sorting keeps folders first when asked and orders by the chosen key", () => {
  const records = [
    record("b.txt", { size: 5, index: 0 }),
    record("a.txt", { size: 50, index: 1 }),
    record("dir/", { dir: true, index: 2 }),
    record("dir/inner.txt", { size: 1, index: 3 }),
  ];
  const names = (tree) => tree.children.map((child) => `${child.dir ? "+" : ""}${child.name}`);
  const byName = sortTree(buildTree(records), { key: "name", foldersFirst: true });
  assert.deepEqual(names(byName), ["+dir", "a.txt", "b.txt"]);
  const mixed = sortTree(buildTree(records), { key: "name", foldersFirst: false });
  assert.deepEqual(names(mixed), ["a.txt", "b.txt", "+dir"]);
  const bySize = sortTree(buildTree(records), { key: "size", foldersFirst: true });
  assert.deepEqual(names(bySize), ["+dir", "a.txt", "b.txt"]);
  const bySizeFlat = sortTree(buildTree(records), { key: "size", foldersFirst: false });
  assert.deepEqual(names(bySizeFlat), ["a.txt", "b.txt", "+dir"]);
  const byModified = sortTree(
    buildTree([record("old.txt", { modified: 10 }), record("new.txt", { modified: 20 })]),
    { key: "modified", foldersFirst: true },
  );
  assert.deepEqual(names(byModified), ["new.txt", "old.txt"]);
});

test("only the children of an expanded folder are rows", () => {
  const tree = sortTree(
    buildTree([record("dir/a.txt", { index: 0 }), record("dir/sub/b.txt", { index: 1 }), record("c.txt", { index: 2 })]),
    { key: "name", foldersFirst: true },
  );
  const collapsed = visibleRows(tree, new Set());
  assert.deepEqual(collapsed.map((row) => row.node.name), ["dir", "c.txt"]);
  assert.equal(collapsed[0].depth, 0);
  const opened = visibleRows(tree, new Set(["dir"]));
  assert.deepEqual(opened.map((row) => row.node.name), ["dir", "sub", "a.txt", "c.txt"]);
  assert.equal(opened.find((row) => row.node.name === "sub").depth, 1);
  assert.equal(opened.find((row) => row.node.name === "a.txt").depth, 1);
});

test("a filter keeps the hits, what is under a matching folder, and the way to them", () => {
  const tree = sortTree(
    buildTree([
      record("src/components/button.ts", { index: 0 }),
      record("src/index.ts", { index: 1 }),
      record("docs/readme.md", { index: 2 }),
      record("src/vendor/lib.js", { index: 3 }),
    ]),
    { key: "name", foldersFirst: true },
  );
  const match = filterTree(tree, "components");
  const rows = visibleRows(tree, new Set(), match);
  assert.deepEqual(
    rows.map((row) => row.node.path),
    ["src", "src/components", "src/components/button.ts"],
  );
  assert.deepEqual([...match.expanded].sort(), ["", "src", "src/components"]);
  const folder = filterTree(tree, "vendor");
  const vendorRows = visibleRows(tree, new Set(), folder);
  assert.deepEqual(
    vendorRows.map((row) => row.node.path),
    ["src", "src/vendor", "src/vendor/lib.js"],
  );
  assert.equal(filterTree(tree, "   "), null);
  const none = filterTree(tree, "nowhere");
  assert.equal(visibleRows(tree, new Set(), none).length, 0);
});

test("the first thing worth showing is a picture or a text, else any file", () => {
  const media = buildTree([record("a.bin", { index: 0 }), record("b.png", { index: 1 }), record("c.txt", { index: 2 })]);
  assert.equal(firstPreviewable(media).name, "b.png");
  const none = buildTree([record("a.bin", { index: 0 }), record("b.dll", { index: 1 })]);
  assert.equal(firstPreviewable(none).name, "a.bin");
  assert.equal(firstPreviewable(buildTree([])), null);
});

test("entries cross the peer channel as bounded batches", () => {
  const record_ = record("a".repeat(400), { index: 0 });
  const entries = Array.from({ length: 200 }, () => compactEntry(record_));
  const batches = batchesBySize(entries);
  assert.ok(batches.length > 1);
  for (const batch of batches) {
    assert.ok(JSON.stringify(batch).length < 25 * 1024, "a batch fits the peer budget");
    assert.ok(batch.length <= 512);
  }
  assert.equal(batches.flat().length, entries.length);
});

test("a compact entry survives the round trip and a folder keeps its flag", () => {
  const entry = { ...record("dir/", { dir: true, index: 3 }), encrypted: true, size: 7, packed: 2, modified: 99 };
  const [name, flags] = compactEntry(entry);
  assert.equal(name, "dir/");
  assert.equal(flags, 3);
  const back = expandEntry(compactEntry(entry), 5);
  assert.equal(back.dir, true);
  assert.equal(back.encrypted, true);
  assert.equal(back.size, 7);
  assert.equal(back.modified, 99);
  assert.equal(back.index, 5);
  const long = compactEntry(record("n".repeat(900)));
  assert.equal(long[0].length, 512);
});

test("kinds come from the extension, and the ambiguous ones stay binary", () => {
  assert.equal(kindOf("a/b/photo.PNG"), "image");
  assert.equal(kindOf("clip.mp4"), "video");
  assert.equal(kindOf("song.flac"), "audio");
  assert.equal(kindOf("bundle.tar.gz"), "archive");
  assert.equal(kindOf("main.rs"), "code");
  assert.equal(kindOf("notes.md"), "text");
  // A TypeScript source and an MPEG transport stream share this suffix; neither may claim it
  // here, because the bytes are what decide and the file list has no bytes yet.
  assert.equal(kindOf("module.ts"), "code");
  assert.equal(kindOf("no-extension"), "binary");
  assert.equal(mimeOf("photo.jpeg"), "image/jpeg");
  assert.equal(mimeOf("unknown.zzz"), "");
});

test("a hex dump is offsets, sixteen bytes and their readable characters", () => {
  const bytes = Uint8Array.from({ length: 20 }, (_, index) => index + 32);
  const lines = hexDump(bytes);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].offset, "00000000");
  assert.equal(lines[0].hex.slice(0, 11), "20 21 22 23");
  assert.equal(lines[0].hex.length, 48);
  assert.equal(lines[0].text, " !\"#$%&'()*+,-./");
  assert.equal(lines[1].offset, "00000010");
  assert.equal(hexDump(bytes, 4).length, 1);
  assert.deepEqual(hexDump(new Uint8Array(0)), []);
});

test("text is recognised by its bytes, not only by its name", () => {
  assert.equal(looksLikeText(Uint8Array.from([104, 105])), true);
  assert.equal(looksLikeText(Uint8Array.from([104, 0, 105])), false);
  assert.equal(looksLikeText(Uint8Array.from([0xff, 0xfe, 104, 0])), true);
  assert.equal(looksLikeText(new Uint8Array(0)), true);
  const noisy = new Uint8Array(1000).fill(1);
  assert.equal(looksLikeText(noisy), false);
  assert.equal(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])), "a");
  assert.equal(decodeText(Uint8Array.from([0xff, 0xfe, 0x61, 0x00])), "a");
  assert.equal(decodeText(Uint8Array.from([0xfe, 0xff, 0x00, 0x61])), "a");
  assert.equal(decodeText(Uint8Array.from([0x61, 0x62])), "ab");
});

test("a video entry is facts, never a decoded frame", async () => {
  // A video inside an archive is not decoded at all: the facts card is the whole preview, so
  // no decoder element and no frame-picking rule may come back into the package.
  const view = await read("plugins/archive/ui/view.js");
  const model = await read("plugins/archive/ui/model.js");
  assert.equal(/createElement\(\s*["']video["']\s*\)/.test(view), false, "the view creates no decoder");
  assert.equal(/canvas/i.test(view), false, "the view draws no frame");
  assert.equal(/videoFrameOffsets|isBlankFrame/.test(model), false, "no frame rule is left in the model");
  // The kind still comes from the extension: the list glyph and the kind field name it, and
  // the note says why nothing is played here.
  assert.equal(kindOf("clip.mp4"), "video");
  assert.equal(kindOf("clip.m2ts"), "video");
  for (const tag of Object.keys(ARCHIVE_TEXT)) {
    assert.ok(ARCHIVE_TEXT[tag].videoNote, `${tag} words the video entry`);
    assert.equal(ARCHIVE_TEXT[tag].videoUndecodable, undefined, `${tag} keeps no decode failure`);
  }
});

test("the summary bar uses stored over unpacked, bounded", () => {
  assert.equal(packedShare(50, 100), 0.5);
  assert.equal(packedShare(200, 100), 1);
  assert.equal(packedShare(0, 100), 0);
  assert.equal(packedShare(50, 0), 0);
});

test("every failure the native side can report is worded here", () => {
  const tokens = [
    "password-protected",
    "entry-missing",
    "entry-is-a-directory",
    "multipart-archive",
    "entry-chunk-empty",
    "entry-too-large:1048576",
    "unsupported-method:lzma",
    "archive-corrupt:bad header",
    "io:denied",
    "archive-session-expired",
  ];
  for (const token of tokens) {
    const worded = describeError(token, (key) => key);
    assert.notEqual(worded, token, `${token} must be recognised`);
    assert.equal(worded, key_of(worded), `${token} maps to one wording`);
  }
  assert.equal(
    describeError("entry-too-large:2048", (key, values) => `${key}:${values.size}`),
    "errTooLarge:2.0 KiB",
  );
  assert.equal(describeError("something else", (key) => key), "something else");
  assert.equal(describeError("", (key) => key), "errUnknown");
});

/** The wording key a mapped failure produced, for the assertions above. */
function key_of(value) {
  return value;
}

test("the failure vocabulary is the same on both sides of the plugin", async () => {
  const native = `${await read("plugins/archive/native/src/source.rs")}\n${await read(
    "plugins/archive/native/src/main.rs",
  )}`;
  const declared = new Set();
  for (const match of native.matchAll(/pub const TOKEN_[A-Z_]+: &str = "([^"]+)";/g)) declared.add(match[1]);
  for (const match of native.matchAll(/format!\("([a-z-]+):/g)) declared.add(match[1]);
  for (const match of native.matchAll(/"(archive-session-expired)"/g)) declared.add(match[1]);
  assert.ok(declared.size >= 8, `the native side reports failures: ${[...declared].join(", ")}`);

  const model = await read("plugins/archive/ui/model.js");
  const handled = new Set([...model.matchAll(/case "([a-z-]+)":/g)].map((match) => match[1]));
  for (const token of declared) {
    assert.ok(handled.has(token), `${token} is not worded by the view`);
  }
  for (const token of handled) {
    assert.ok(declared.has(token), `${token} is worded but never reported`);
  }
});

test("the two halves agree on the native methods they exchange", async () => {
  const native = await read("plugins/archive/native/src/main.rs");
  const methods = [...native.matchAll(/^\s*"([a-z-]+)" =>/gm)].map((match) => match[1]);
  assert.deepEqual(methods, ["settings", "open", "page", "read-entry"]);
  const view = await read("plugins/archive/ui/view.js");
  for (const method of ["page", "read-entry"]) {
    assert.match(view, new RegExp(`call\\("${method}"`), `the view asks for ${method}`);
  }
});

test("every setting the pages read is declared in the manifest", async () => {
  const manifest = JSON.parse(await read("plugins/archive/plugin.json"));
  const declared = new Set(manifest.settings.map((setting) => setting.key));
  for (const file of ["view.js", "list.js"]) {
    const source = await read(`plugins/archive/ui/${file}`);
    for (const match of source.matchAll(/configuration\(\)\.([A-Za-z]+)/g)) {
      assert.ok(declared.has(match[1]), `${file} reads undeclared setting ${match[1]}`);
    }
  }
  assert.ok(declared.size >= 5);
});

test("the words this plugin draws match the ones the host draws", async () => {
  const manifest = JSON.parse(await read("plugins/archive/plugin.json"));
  const english = manifest.i18n.en;
  for (const [tag, messages] of Object.entries(ARCHIVE_TEXT)) {
    assert.ok(Object.keys(messages).length > 40, `${tag} carries the plugin's own wording`);
  }
  assert.deepEqual(Object.keys(ARCHIVE_TEXT.en).sort(), Object.keys(ARCHIVE_TEXT["zh-CN"]).sort());
  assert.equal(english.name, "Archive Preview");
  // The sidebar offers the same choice as the settings page, and reads the same.
  for (const [value, label] of Object.entries(english.settings.sort.options)) {
    assert.equal(ARCHIVE_TEXT.en[`sort_${value}`], label, `sort option ${value}`);
  }
  assert.equal(english.settings.showList.label, "Show the file list by default");
});

test("the manifest declares what the plugin can do and what it matches", async () => {
  const manifest = JSON.parse(await read("plugins/archive/plugin.json"));
  assert.equal(manifest.api, 1);
  assert.equal(manifest.id, "ember.archive");
  assert.equal(manifest.icon, "archive");
  assert.equal(manifest.entry, "ui/index.html");
  assert.equal(manifest.executable, "bin/ember-archive-plugin.exe");
  assert.deepEqual(manifest.capabilities.slice().sort(), ["controls", "overlay", "view"]);
  assert.ok(manifest.overlay.width >= 120 && manifest.overlay.height >= 24);
  assert.deepEqual(manifest.permissions, ["clipboard"]);
  for (const extension of ["zip", "7z", "rar", "tar", "gz", "bz2", "xz", "zst", "lz4", "cab", "jar", "apk", "epub"]) {
    assert.ok(manifest.extensions.includes(extension), `matches .${extension}`);
  }
  // Every matched extension is plain alphanumeric, which is what the manifest allows.
  for (const extension of manifest.extensions) assert.match(extension, /^[A-Za-z0-9]+$/);
  const crate = await read("plugins/archive/native/Cargo.toml");
  assert.match(crate, /^version = "0\.1\.0"$/m);
  assert.equal(crate.includes("version.workspace"), false);
});

test("the pages only reference files the package carries", async () => {
  const { readdir } = await import("node:fs/promises");
  const ui = path.join(root, "plugins/archive/ui");
  const carried = new Set(await readdir(ui));
  // Files the SDK build drops into the package beside the plugin's own.
  const provided = new Set(["sdk.js", "sdk-ui.css", "sdk-text.css", "sdk-search.js", "sdk-view.js", "sdk-navigation.js", "sdk-markdown.js", "boot.js"]);
  const sources = (await readdir(ui)).filter((name) => /\.(js|html|css)$/.test(name));
  for (const name of sources) {
    const code = await readFile(path.join(ui, name), "utf8");
    const references = [
      ...code.matchAll(/(?:from|import)\s*\(?\s*["'](\.\/[^"']+)["']/g),
      ...code.matchAll(/(?:src|href)\s*=\s*["'](\.\/[^"']+)["']/g),
    ].map((match) => match[1].replace("./", ""));
    for (const reference of references) {
      assert.ok(carried.has(reference) || provided.has(reference), `${name} references ${reference}`);
    }
  }
  assert.ok(carried.has("model.js") && carried.has("text.js") && carried.has("list.js") && carried.has("panel.js"));
});

test("byte helpers join and index as the readers expect", () => {
  const joined = concatBytes([Uint8Array.from([1, 2]), Uint8Array.from([3])]);
  assert.deepEqual([...joined], [1, 2, 3]);
  assert.equal(joined.length, 3);
  const entry = expandEntry([ "a.txt", 0, "12", "3", "0", "" ], 0);
  assert.equal(entry.size, 12);
  assert.equal(entry.packed.length, undefined);
});
