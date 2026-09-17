import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync, crc32 } from "node:zlib";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createZip, zipDirectory, MAX_ENTRIES } from "../scripts/zip.mjs";

const fixturePackage = fileURLToPath(
  new URL("../crates/runtime/tests/fixtures/package/", import.meta.url),
);
const fixtureZip = fileURLToPath(
  new URL("../crates/runtime/tests/fixtures/package.zip", import.meta.url),
);

/**
 * An independent reader for the format the writer produces. It walks the central
 * directory, cross-checks every local header against it, and inflates the payloads,
 * so a mistake in the writer cannot be excused by the writer's own code.
 */
function readZip(buffer) {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  assert.notEqual(end, -1, "end of central directory record not found");
  const count = buffer.readUInt16LE(end + 10);
  assert.equal(buffer.readUInt16LE(end + 8), count, "disk and total counts differ");
  assert.equal(buffer.readUInt32LE(end + 16) + buffer.readUInt32LE(end + 12), end);

  const entries = [];
  let cursor = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const entry = {
      method,
      crc: buffer.readUInt32LE(cursor + 16),
      compressedSize: buffer.readUInt32LE(cursor + 20),
      size: buffer.readUInt32LE(cursor + 24),
      external: buffer.readUInt32LE(cursor + 38),
    };
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    entry.name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    const local = buffer.readUInt32LE(cursor + 42);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50, `${entry.name} local header`);
    const localNameLength = buffer.readUInt16LE(local + 26);
    const localExtraLength = buffer.readUInt16LE(local + 28);
    assert.equal(
      buffer.toString("utf8", local + 30, local + 30 + localNameLength),
      entry.name,
      "the two headers disagree about the name",
    );
    const start = local + 30 + localNameLength + localExtraLength;
    const payload = buffer.subarray(start, start + entry.compressedSize);
    entry.data = method === 8 ? inflateRawSync(payload) : Buffer.from(payload);
    entries.push(entry);

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end, "the central directory is not where it claims to be");
  return entries;
}

const table = (entries) =>
  entries.map(({ name, method, crc, size, external }) => ({
    name,
    method,
    crc,
    size,
    external,
  }));

test("the same package always produces the same archive", async () => {
  const first = await zipDirectory(fixturePackage);
  const second = await zipDirectory(fixturePackage);
  assert.deepEqual(first, second);
});

test("the committed fixture is what the writer produces today", async () => {
  const rebuilt = await zipDirectory(fixturePackage);
  const committed = readFileSync(fixtureZip);
  // Compared through the reader rather than as bytes: entry order, headers, CRCs and
  // payloads have to match, while deflate output may vary with the zlib in use.
  const fresh = readZip(rebuilt);
  const stored = readZip(committed);
  assert.deepEqual(table(fresh), table(stored));
  assert.deepEqual(
    fresh.map((entry) => entry.data),
    stored.map((entry) => entry.data),
  );
  // Regenerate the fixture when this fails, and only after checking the change:
  // node -e "import('./scripts/zip.mjs').then(async m => require('node:fs').writeFileSync(
  //   'crates/runtime/tests/fixtures/package.zip',
  //   await m.zipDirectory('crates/runtime/tests/fixtures/package')))"
  assert.ok(
    stored.some((entry) => entry.name === "plugin.json"),
    "the manifest has to sit at the archive root",
  );
});

test("every entry is a regular file whose crc matches its bytes", async () => {
  const entries = readZip(await zipDirectory(fixturePackage));
  assert.ok(entries.length >= 5, "the fixture should cover nested entries");
  const names = entries.map((entry) => entry.name);
  assert.deepEqual(names, [...names].sort(), "entry order must not depend on the walk");
  assert.equal(new Set(names).size, names.length, "duplicate entries");
  for (const entry of entries) {
    assert.equal(
      crc32(entry.data) >>> 0,
      entry.crc,
      `${entry.name} crc does not match its bytes`,
    );
    assert.equal(entry.size, entry.data.length, `${entry.name} size`);
    assert.ok(
      [0, 8].includes(entry.method),
      `${entry.name} uses an unexpected compression method`,
    );
    // The type bits say regular file, which is what stops a package from smuggling a
    // link the host would have to refuse later.
    assert.equal((entry.external >>> 16) & 0xf000, 0x8000, `${entry.name} is not a file`);
    assert.ok(!entry.name.startsWith("/") && !entry.name.includes(".."), entry.name);
    assert.ok(!entry.name.includes("\\") && !entry.name.includes(":"), entry.name);
  }
});

test("names that could escape the package are refused", () => {
  for (const name of ["../escape.txt", "/absolute.txt", "a/../../b", "..\\b", "C:/b", "", "a//b"]) {
    assert.throws(() => createZip([{ name, data: Buffer.from("x") }]), name || "(empty)");
  }
  assert.throws(() =>
    createZip([
      { name: "same.txt", data: Buffer.from("a") },
      { name: "same.txt", data: Buffer.from("b") },
    ]),
  );
});

test("a package with too many entries is refused", () => {
  const files = Array.from({ length: MAX_ENTRIES + 1 }, (_, index) => ({
    name: `ui/${index}.js`,
    data: Buffer.from(""),
  }));
  assert.throws(() => createZip(files), /entries/);
});

test("content that deflate cannot shrink is stored instead", () => {
  const random = randomBytes(4096);
  const [entry] = readZip(createZip([{ name: "ui/blob.bin", data: random }]));
  assert.equal(entry.method, 0);
  assert.deepEqual(entry.data, random);
});
