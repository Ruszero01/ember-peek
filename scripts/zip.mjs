import { deflateRawSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// A plugin package travels as one zip so a remote market has a single immutable
// artifact to hash and download. The writer is deliberately small and fixed:
// no zip64, no data descriptors, no extra fields, no directory entries, and a
// frozen timestamp. The host reads packages back with a matching strict profile,
// so anything outside it is rejected instead of guessed at.
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 0x031e; // Unix, spec 3.0 -> external attributes are a unix mode
const REGULAR_FILE_MODE = 0o100644;
// 1980-01-01 00:00:00, the earliest representable DOS timestamp. Zip has no
// timezone, so a real time would make the same input produce different bytes.
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;
const DEFLATE = 8;
const STORE = 0;

export const MAX_ENTRIES = 4096;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

export function crc32(buffer) {
  let value = -1;
  for (const byte of buffer)
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ -1) >>> 0;
}

/** Archive entry name: forward slashes, no traversal, no absolute or drive paths. */
export function checkName(name) {
  if (!name || name.includes("\\") || name.includes(":") || name.includes("\0"))
    throw new Error(`Invalid package entry name: ${name}`);
  if (path.posix.isAbsolute(name) || /^[a-zA-Z]:/.test(name))
    throw new Error(`Invalid package entry name: ${name}`);
  const parts = name.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error(`Invalid package entry name: ${name}`);
  return name;
}

/**
 * Build a zip from `[{name, data}]`. Entry names are sorted, so the same input
 * always produces the same archive layout.
 */
export function createZip(files) {
  if (files.length > MAX_ENTRIES)
    throw new Error(`Package has ${files.length} entries, over ${MAX_ENTRIES}`);
  const entries = [...files]
    .map(({ name, data }) => ({ name: checkName(name), data }))
    .sort((left, right) => (left.name < right.name ? -1 : 1));
  for (let index = 1; index < entries.length; index += 1)
    if (entries[index].name === entries[index - 1].name)
      throw new Error(`Duplicate package entry: ${entries[index].name}`);
  let total = 0;
  for (const entry of entries) {
    if (entry.data.length > MAX_FILE_BYTES)
      throw new Error(`Package entry ${entry.name} is over 64 MiB`);
    total += entry.data.length;
  }
  if (total > MAX_TOTAL_BYTES)
    throw new Error(`Package content is ${total} bytes, over 256 MiB`);

  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data, { level: 9 });
    // Storing is smaller for content deflate cannot shrink (PNG, WebP, WASM).
    const deflated = compressed.length < entry.data.length;
    const payload = deflated ? compressed : entry.data;
    const method = deflated ? DEFLATE : STORE;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_HEADER, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(0x0800, 6); // names are UTF-8
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, payload);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(CENTRAL_HEADER, 0);
    directory.writeUInt16LE(VERSION_MADE_BY, 4);
    directory.writeUInt16LE(VERSION_NEEDED, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt16LE(DOS_TIME, 12);
    directory.writeUInt16LE(DOS_DATE, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(payload.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30); // extra
    directory.writeUInt16LE(0, 32); // comment
    directory.writeUInt16LE(0, 34); // disk
    directory.writeUInt16LE(0, 36); // internal attributes
    // `<<` yields a signed int and the mode has the type bits set, so shift unsigned.
    directory.writeUInt32LE((REGULAR_FILE_MODE << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += header.length + name.length + payload.length;
  }

  const start = offset;
  const files_ = Buffer.concat(local);
  const index = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(start, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([files_, index, end]);
}

/** Every file under `root`, as `{name, data}`, with archive-relative names. */
export async function readTree(root) {
  const files = [];
  async function walk(directory, prefix) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => (left.name < right.name ? -1 : 1),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error(`Package symlinks are not supported: ${entry.name}`);
      const location = path.join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(location, name);
      else if (entry.isFile()) files.push({ name, data: await readFile(location) });
      else throw new Error(`Unsupported package entry: ${name}`);
    }
  }
  await walk(root, "");
  return files;
}

/** Zip a package directory: archive-relative names, `plugin.json` at the root. */
export async function zipDirectory(root) {
  return createZip(await readTree(root));
}
