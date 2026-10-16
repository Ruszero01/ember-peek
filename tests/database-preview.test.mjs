import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cellClass,
  cellText,
  cellTitle,
  columnType,
  describeError,
  factsText,
  indexColumns,
  indexOrigin,
  keyText,
  matchesFilter,
  objectSummary,
  pageCount,
  rowCountText,
  statusText,
  structureText,
} from "../plugins/database/ui/db-model.js";
import { DATABASE_TEXT } from "../plugins/database/ui/text.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
/** A translator that returns the key, so a test can see which wording was asked for. */
const keys = (key, values) => (values ? `${key}(${Object.values(values).join(",")})` : key);

test("the manifest declares what the plugin matches and how it runs", async () => {
  const manifest = JSON.parse(await read("plugins/database/plugin.json"));
  assert.equal(manifest.api, 1);
  assert.equal(manifest.id, "ember.database");
  assert.equal(manifest.icon, "database");
  assert.equal(manifest.entry, "ui/index.html");
  assert.equal(manifest.executable, "bin/ember-database-plugin.exe");
  assert.equal(manifest.category, "tools");
  assert.deepEqual(manifest.capabilities.slice().sort(), ["controls", "view"]);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.overlay, undefined);
  for (const extension of ["db", "db3", "sqlite", "sqlite3"]) {
    assert.ok(manifest.extensions.includes(extension), `matches .${extension}`);
  }
  // The manifest only accepts bare alphanumeric extensions, and .db is what people have.
  for (const extension of manifest.extensions) assert.match(extension, /^[A-Za-z0-9]+$/);
  const crate = await read("plugins/database/native/Cargo.toml");
  assert.match(crate, /^version = "0\.1\.0"$/m);
  assert.equal(crate.includes("version.workspace"), false);
  const listing = JSON.parse(await read("plugins/database/listing.json"));
  assert.ok(listing.summary.length > 10);
  assert.equal(listing.i18n.en.summary.length > 10, true);
});

test("the two halves agree on the native methods they exchange", async () => {
  const native = await read("plugins/database/native/src/main.rs");
  const methods = [...native.matchAll(/^\s*"([a-z-]+)" =>/gm)].map((match) => match[1]);
  assert.deepEqual(methods, ["settings", "open", "structure", "rows"]);
  const view = await read("plugins/database/ui/view.js");
  for (const method of ["structure", "rows"]) {
    assert.match(view, new RegExp(`call\\("${method}"`), `the view asks for ${method}`);
  }
  // A custom method's payload rides under `value`, beside the session the host adds.
  assert.match(native, /params\["value"\]/);
});

test("every failure the native side can report is worded by the pages", async () => {
  const native = `${await read("plugins/database/native/src/reader.rs")}\n${await read(
    "plugins/database/native/src/main.rs",
  )}`;
  const tokens = new Set(
    [...native.matchAll(/"(database-[a-z-]+)/g)].map((match) => match[1]),
  );
  // A token that never carries a detail is worded on its own; one that does keeps it.
  const detailed = new Set(
    [...native.matchAll(/"(database-[a-z-]+):/g)].map((match) => match[1]),
  );
  assert.ok(tokens.size >= 8, `the native side reports failures: ${[...tokens].join(", ")}`);
  for (const token of tokens) {
    // database-not-sqlite -> errorNotSqlite, the key the pages answer with.
    const name = token
      .split("-")
      .slice(1)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("");
    const key = `error${name}`;
    for (const language of ["en", "zh-CN"]) {
      assert.ok(DATABASE_TEXT[language][key], `${token} is worded in ${language}`);
    }
    if (detailed.has(token)) {
      assert.equal(describeError(`${token}:detail`, keys), `${key}(detail)`);
    } else {
      assert.equal(describeError(token, keys), key);
    }
  }
});

test("a token that arrives with a detail keeps it, and one that does not stays bare", () => {
  assert.equal(describeError("database-locked", keys), "errorLocked");
  assert.equal(
    describeError("database-query-failed:no such column: x", keys),
    "errorQueryFailed(no such column: x)",
  );
  // A failure the pages have no wording for is shown as the reader wrote it.
  assert.equal(describeError("something else", keys), "something else");
});

test("both languages carry the same wording, and every phrase is asked for", async () => {
  assert.deepEqual(
    Object.keys(DATABASE_TEXT.en).sort(),
    Object.keys(DATABASE_TEXT["zh-CN"]).sort(),
  );
  const sources = await Promise.all(
    ["view.js", "list.js", "db-model.js"].map((name) =>
      read(`plugins/database/ui/${name}`),
    ),
  );
  const used = new Set(
    sources.flatMap((code) =>
      [...code.matchAll(/say\(([^)]*)\)/g)].flatMap((call) =>
        [...call[1].matchAll(/["']([A-Za-z_]+)["']/g)].map((match) => match[1]),
      ),
    ),
  );
  for (const key of used) {
    assert.ok(DATABASE_TEXT.en[key] !== undefined, `${key} is worded`);
  }
  for (const key of Object.keys(DATABASE_TEXT.en)) {
    assert.ok(used.has(key), `${key} is drawn somewhere`);
  }
});

test("the wording the host draws and the wording the pages draw agree", async () => {
  const manifest = JSON.parse(await read("plugins/database/plugin.json"));
  assert.equal(manifest.i18n.en.name, "Database Preview");
  const declared = new Set(manifest.settings.map((setting) => setting.key));
  assert.deepEqual([...declared].sort(), ["pageSize", "showList"]);
  for (const key of declared) {
    assert.ok(manifest.i18n.en.settings[key].label, `${key} is translated for the host`);
  }
  // Both settings are read by the view, and both are declared.
  const view = await read("plugins/database/ui/view.js");
  for (const key of ["showList", "pageSize"]) {
    assert.match(view, new RegExp(`configuration\\(\\)\\.${key}`), `the view reads ${key}`);
  }
});

test("a cell reads as its storage class, not as its characters", () => {
  assert.equal(cellText(null), "NULL");
  assert.equal(cellClass(null), "null");
  assert.equal(cellText({ kind: "integer", text: "42" }), "42");
  assert.equal(cellClass({ kind: "integer", text: "42" }), "numeric");
  assert.equal(cellClass({ kind: "real", text: "1.5" }), "numeric");
  assert.equal(cellText({ kind: "text", text: "a@b" }), "a@b");
  assert.equal(cellClass({ kind: "text", text: "a@b" }), "text");
  // A blob is drawn the way SQLite writes one, with the cut marked.
  assert.equal(cellText({ kind: "blob", hex: "1f8b", bytes: 40960, truncated: true }), "x'1f8b…'");
  assert.equal(cellText({ kind: "blob", hex: "1f8b", bytes: 2, truncated: false }), "x'1f8b'");
  assert.equal(cellClass({ kind: "blob", hex: "1f8b", bytes: 2 }), "blob");
});

test("a cell's hover text carries the value the grid clipped, and what was cut away", () => {
  // The grid clips a long value, so the hover text is the value itself.
  assert.equal(cellTitle({ kind: "text", text: "short" }, keys), "short");
  assert.equal(
    cellTitle({ kind: "text", text: "cut", truncated: true, characters: 12000 }, keys),
    "cut · truncatedText(12000)",
  );
  assert.equal(cellTitle({ kind: "text", text: "" }, keys), "");
  assert.equal(cellTitle(null, keys), "nullValue");
  assert.equal(
    cellTitle({ kind: "blob", hex: "1f", bytes: 40960, truncated: true }, keys),
    "blobValue(40960) · truncatedBlob",
  );
  assert.equal(
    cellTitle({ kind: "blob", hex: "1f", bytes: 3, truncated: false }, keys),
    "blobValue(3)",
  );
});

test("the information line says what is knowable and no more", () => {
  const base = { name: "users", kind: "table", offset: 200, length: 200, columns: 5, say: keys };
  assert.equal(
    statusText({ ...base, rows: { value: 1200, exact: true } }),
    "info(users,table,201–400,5,1200)",
  );
  assert.equal(
    statusText({ ...base, rows: { value: 100000, exact: false } }),
    "infoCapped(users,table,201–400,5,100000)",
  );
  assert.equal(statusText({ ...base, rows: null }), "infoUnknown(users,table,201–400,5,0)");
  assert.equal(
    statusText({ ...base, kind: "view", offset: 0, length: 0, rows: null }),
    "infoUnknown(users,view,0,5,0)",
  );
  assert.equal(
    statusText({ ...base, offset: 0, length: 1, rows: { value: 1, exact: true } }),
    "info(users,table,1,5,1)",
  );
  // The structure sheet is not a page of rows, so it does not claim to be one.
  assert.equal(
    structureText({ name: "users", kind: "table", columns: 5, rows: { value: 4, exact: true }, say: keys }),
    "structureInfo(users,table,5,4)",
  );
  assert.equal(
    structureText({ name: "top", kind: "view", columns: 2, rows: null, say: keys }),
    "structureInfo(top,view,2,unknownCount)",
  );
});

test("paging is derived from the count the reader could afford", () => {
  assert.equal(pageCount({ value: 1200, exact: true }, 200), 6);
  assert.equal(pageCount({ value: 1201, exact: true }, 200), 7);
  assert.equal(pageCount({ value: 0, exact: true }, 200), 1);
  assert.equal(pageCount(null, 200), null);
  assert.equal(pageCount({ value: 10, exact: true }, 0), 10);
  assert.equal(rowCountText({ value: 1200, exact: true }, keys), "1200");
  assert.equal(rowCountText({ value: 100000, exact: false }, keys), "moreThan(100000)");
  assert.equal(rowCountText(null, keys), "unknownCount");
});

test("the sidebar's filter is case-insensitive and matches part of a name", () => {
  assert.equal(matchesFilter("UserEvents", ""), true);
  assert.equal(matchesFilter("UserEvents", "  "), true);
  assert.equal(matchesFilter("UserEvents", "user"), true);
  assert.equal(matchesFilter("UserEvents", "events"), true);
  assert.equal(matchesFilter("UserEvents", "orders"), false);
  assert.equal(matchesFilter(undefined, "x"), false);
});

test("the structure sheet words what SQLite left unsaid", () => {
  assert.equal(columnType("VARCHAR(20)", keys), "VARCHAR(20)");
  assert.equal(columnType("  INTEGER ", keys), "INTEGER");
  assert.equal(columnType(null, keys), "noType");
  assert.equal(keyText({ primaryKey: 1, generated: true }, keys), "primary · generated");
  assert.equal(keyText({ primaryKey: 0, generated: false }, keys), "");
  assert.equal(indexOrigin("c", keys), "originCreated");
  assert.equal(indexOrigin("u", keys), "originUnique");
  assert.equal(indexOrigin("pk", keys), "originPrimary");
  assert.equal(indexOrigin("future", keys), "originCreated");
  assert.equal(indexColumns(["a", null, "b"], keys), "a, expression, b");
  assert.equal(indexColumns([], keys), "");
});

test("the sidebar's lines describe the file and what it holds", () => {
  assert.equal(
    factsText({ library: "3.46.1", pageSize: 4096, pageCount: 30 }, keys),
    "facts(3.46.1,4096,30)",
  );
  assert.equal(factsText({ empty: true }, keys), "emptyFile");
  assert.equal(
    objectSummary(
      { objects: [{ kind: "table" }, { kind: "table" }, { kind: "view" }], objectCount: 3 },
      keys,
    ),
    "objectsTable(2) · objectsView(1)",
  );
  assert.equal(objectSummary({ objects: [] }, keys), "noObjects");
  assert.equal(
    objectSummary({ objects: [{ kind: "table" }], objectCount: 9000 }, keys),
    "objectsTable(1)objectsTruncated",
  );
});

test("the pages only reference files the package carries", async () => {
  const ui = path.join(root, "plugins/database/ui");
  const carried = new Set(await readdir(ui));
  // Files the SDK build drops into the package beside the plugin's own.
  const provided = new Set([
    "sdk.js",
    "sdk-ui.css",
    "boot.js",
    "sdk-text.css",
    "sdk-search.js",
    "sdk-view.js",
    "sdk-navigation.js",
    "sdk-markdown.js",
  ]);
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
  assert.ok(carried.has("view.js") && carried.has("list.js") && carried.has("db-model.js"));
});

test("the limits the reader enforces are the ones the contract states", async () => {
  const native = await read("plugins/database/native/src/reader.rs");
  const limits = Object.fromEntries(
    [
      ...native.matchAll(
        /(?:pub )?const (MAX_OBJECTS|MAX_ROWS|MAX_COLUMNS|TEXT_LIMIT|BLOB_LIMIT): usize = ([\d_]+);/g,
      ),
    ].map((match) => [match[1], Number(match[2].replace(/_/g, ""))]),
  );
  const counted = Number(
    native.match(/const COUNT_LIMIT: i64 = ([\d_]+);/)[1].replace(/_/g, ""),
  );
  assert.deepEqual(limits, {
    MAX_OBJECTS: 5000,
    MAX_ROWS: 500,
    MAX_COLUMNS: 512,
    TEXT_LIMIT: 4096,
    BLOB_LIMIT: 64,
  });
  assert.equal(counted, 100000);
  const contract = await read("docs/specs/database-preview.md");
  for (const [name, value] of [...Object.entries(limits), ["COUNT_LIMIT", counted]]) {
    assert.ok(
      contract.includes(String(value)),
      `${name} (${value}) is stated in the preview contract`,
    );
  }
});
