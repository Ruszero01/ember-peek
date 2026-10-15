/**
 * The archive's shape, without any DOM.
 *
 * Everything the two mounts (the sidebar list and the content view) agree on lives here:
 * which entries exist, how they nest, how a size or a date reads, which bytes look like text,
 * and how a decoder's failure is worded. Keeping it separate is what lets the rules be tested
 * without a browser — see `tests/archive-preview.test.mjs`.
 */

/** The binary units the rest of the preview uses, so 1 KiB is 1024 bytes everywhere. */
export function humanBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${Math.round(size)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let scaled = size;
  let unit = -1;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)} ${units[unit]}`;
}

export function formatDate(seconds, locale) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(seconds * 1000));
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
  }
}

/**
 * What an entry is, from its name alone. The list draws a glyph per kind and the view picks a
 * renderer from it; a name that says nothing becomes `binary`, and the view sniffs the bytes
 * before it settles for a hex dump.
 */
const KINDS = {
  image: ["png", "jpg", "jpeg", "jpe", "gif", "webp", "bmp", "ico", "svg", "avif", "tif", "tiff", "heic", "heif", "jfif"],
  video: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "m2ts", "m2v", "vob", "3gp", "ogv"],
  audio: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "oga", "opus", "wma", "aif", "aiff", "mid"],
  archive: ["zip", "zipx", "jar", "war", "ear", "aar", "apk", "xpi", "crx", "vsix", "nupkg", "whl", "epub", "cbz", "cbr", "7z", "rar", "tar", "gz", "tgz", "taz", "bz2", "tbz", "tbz2", "xz", "txz", "zst", "tzst", "lz4", "cab"],
  code: ["js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "less", "html", "htm", "xml", "json", "json5", "yml", "yaml", "toml", "ini", "cfg", "py", "rb", "rs", "go", "java", "kt", "c", "h", "cc", "cpp", "hpp", "cs", "php", "swift", "sh", "ps1", "bat", "cmd", "sql", "lua", "pl", "vue", "svelte", "patch", "diff", "gradle", "cmake", "dockerfile", "makefile"],
  text: ["txt", "text", "md", "markdown", "rst", "log", "csv", "tsv", "srt", "vtt", "ass", "nfo", "readme", "license", "authors", "changelog", "gitignore", "editorconfig", "env", "properties", "conf"],
};
const KIND_OF_EXTENSION = new Map();
for (const [kind, extensions] of Object.entries(KINDS)) {
  for (const extension of extensions) KIND_OF_EXTENSION.set(extension, kind);
}

export function extensionOf(name) {
  const base = String(name ?? "").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return base.toLowerCase();
  return base.slice(dot + 1).toLowerCase();
}

export function kindOf(name) {
  return KIND_OF_EXTENSION.get(extensionOf(name)) ?? "binary";
}

/** The media type an element or a decoder should be told about, from the same table. */
export function mimeOf(name) {
  const extension = extensionOf(name);
  const types = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", jfif: "image/jpeg",
    gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
    avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
    ogv: "video/ogg", "3gp": "video/3gpp", ts: "video/mp2t",
    mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac",
    ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", wma: "audio/x-ms-wma", aif: "audio/aiff", aiff: "audio/aiff",
    txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  };
  return types[extension] ?? "";
}

/**
 * One entry as the sidebar receives it: an array rather than an object, because a directory
 * of a hundred thousand names crosses the peer channel in batches and every byte of key
 * names is repeated for every one of them. Bit 0 is "directory", bit 1 is "encrypted".
 */
export function compactEntry(entry) {
  const flags = (entry.dir ? 1 : 0) | (entry.encrypted ? 2 : 0);
  return [
    entry.name.length > 512 ? entry.name.slice(0, 512) : entry.name,
    flags,
    entry.size ?? 0,
    entry.packed ?? 0,
    entry.modified ?? 0,
    entry.method ?? "",
  ];
}

export function expandEntry(record, index) {
  const [name, flags, size, packed, modified, method] = record;
  return {
    name,
    dir: (flags & 1) === 1,
    encrypted: (flags & 2) === 2,
    size: Number(size) || 0,
    packed: Number(packed) || 0,
    modified: Number(modified) || 0,
    method: typeof method === "string" ? method : "",
    index,
  };
}

/**
 * A tree from the flat directory the container reported.
 *
 * Archives are inconsistent about this: some carry an entry for every directory, some only
 * for the files, and some write `a//b` or a leading slash. Folders a listing left out are
 * therefore created here, and a record's `index` — the position the format's reader needs —
 * is carried on the file node rather than on the folder that was invented for it.
 */
export function buildTree(records) {
  const root = node("", "", true);
  const byPath = new Map([["", root]]);
  for (const record of records) {
    const path = cleanPath(record.name);
    if (!path) continue;
    const segments = path.split("/");
    let current = root;
    let prefix = "";
    for (let depth = 0; depth < segments.length; depth += 1) {
      prefix = prefix ? `${prefix}/${segments[depth]}` : segments[depth];
      let child = byPath.get(prefix);
      if (!child) {
        child = node(segments[depth], prefix, true);
        byPath.set(prefix, child);
        current.children.push(child);
      }
      const last = depth === segments.length - 1;
      if (last) {
        // A name ending in a separator marks a directory even when the flag is absent, and a
        // folder that already holds children stays one: some archives list a file and its
        // contents under the same name, and the folder reading is the useful one.
        if (record.dir) child.dir = true;
        else if (!child.children.length) {
          child.dir = false;
          child.size = record.size ?? 0;
          child.packed = record.packed ?? 0;
          child.modified = record.modified || null;
          child.encrypted = record.encrypted === true;
          child.method = record.method ?? "";
          child.index = record.index ?? -1;
        }
        if (record.dir && record.index >= 0) child.index = record.index;
      }
      current = child;
    }
  }
  aggregate(root);
  return root;
}

function node(name, path, dir) {
  return {
    name,
    path,
    dir,
    size: 0,
    packed: 0,
    modified: null,
    encrypted: false,
    method: "",
    index: -1,
    children: [],
    files: 0,
    folders: 0,
  };
}

/** A name as the tree stores it: forward slashes, no leading `./` or `/`, no trailing one. */
export function cleanPath(name) {
  let value = String(name ?? "").replace(/\\/g, "/");
  while (value.startsWith("./")) value = value.slice(2);
  while (value.startsWith("/")) value = value.slice(1);
  while (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

/** Sizes and counts for folders: what the reader sees when a folder is selected. */
export function aggregate(node_) {
  if (!node_.dir) {
    node_.files = 1;
    node_.folders = 0;
    return node_;
  }
  node_.size = 0;
  node_.packed = 0;
  node_.files = 0;
  node_.folders = 0;
  for (const child of node_.children) {
    aggregate(child);
    node_.size += child.size;
    node_.packed += child.packed;
    node_.files += child.files;
    node_.folders += child.folders + (child.dir ? 1 : 0);
  }
  return node_;
}

export function collator(locale) {
  try {
    return new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  } catch {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  }
}

/** Largest first for the size orders: the interesting question is what fills the archive. */
export function sortTree(root, { key = "name", foldersFirst = true, locale } = {}) {
  const order = collator(locale);
  const compare = (left, right) => {
    if (foldersFirst && left.dir !== right.dir) return left.dir ? -1 : 1;
    if (key === "size" || key === "packed") {
      const difference = (right[key] || 0) - (left[key] || 0);
      if (difference) return difference;
    }
    if (key === "modified") {
      const difference = (right.modified || 0) - (left.modified || 0);
      if (difference) return difference;
    }
    return order.compare(left.name, right.name);
  };
  const walk = (item) => {
    item.children.sort(compare);
    for (const child of item.children) walk(child);
  };
  walk(root);
  return root;
}

/** The rows a reader can see: every child of an expanded folder, in order. */
export function visibleRows(root, expanded, filter = null) {
  const rows = [];
  const walk = (item, depth) => {
    for (const child of item.children) {
      if (filter && !filter.visible.has(child.path)) continue;
      rows.push({ node: child, depth });
      const open = expanded.has(child.path) || (filter ? filter.expanded.has(child.path) : false);
      if (child.dir && open) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/**
 * Which rows a filter keeps: a match of its own, everything under a folder whose name
 * matched, and the folders on the way to a match — which are also opened, so the hit is not
 * hidden behind a folded caret.
 */
export function filterTree(root, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return null;
  const visible = new Set();
  const expanded = new Set();
  const markAll = (item) => {
    for (const child of item.children) {
      visible.add(child.path);
      markAll(child);
    }
  };
  const walk = (item) => {
    let hit = item.path.toLowerCase().includes(needle);
    if (hit && item.dir) {
      // A folder whose own name matched opens with everything under it: showing the folder
      // and hiding its contents would look like an empty result.
      markAll(item);
      expanded.add(item.path);
    }
    for (const child of item.children) {
      const childHit = walk(child);
      if (childHit) expanded.add(item.path);
      hit = hit || childHit;
    }
    if (hit) visible.add(item.path);
    return hit;
  };
  walk(root);
  return { visible, expanded };
}

/** The folders on the way to a path, so a selection can be revealed when it lands off-screen. */
export function ancestorsOf(path) {
  const parts = cleanPath(path).split("/");
  const result = [];
  let prefix = "";
  for (const part of parts.slice(0, -1)) {
    prefix = prefix ? `${prefix}/${part}` : part;
    result.push(prefix);
  }
  return result;
}

/** The first file a reader would want to see: an image or a text, else the first file. */
export function firstPreviewable(root) {
  let fallback = null;
  const walk = (item) => {
    for (const child of item.children) {
      if (child.dir) {
        const nested = walk(child);
        if (nested) return nested;
        continue;
      }
      const kind = kindOf(child.name);
      if (kind === "image" || kind === "text" || kind === "code") return child;
      if (!fallback) fallback = child;
    }
    return null;
  };
  const preferred = walk(root);
  return preferred ?? fallback;
}

/** A row of a hex dump: sixteen bytes, their offsets, and their readable characters. */
export function hexDump(bytes, limit = 4096) {
  const slice = bytes.subarray(0, Math.min(bytes.length, limit));
  const lines = [];
  for (let offset = 0; offset < slice.length; offset += 16) {
    const chunk = slice.subarray(offset, offset + 16);
    const group = (start) =>
      [...chunk.subarray(start, start + 8)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ")
        .padEnd(23, " ");
    const text = [...chunk]
      .map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : "."))
      .join("");
    lines.push({
      offset: offset.toString(16).padStart(8, "0"),
      hex: `${group(0)}  ${group(8)}`,
      text,
    });
  }
  return lines;
}

/**
 * Whether bytes look like a text document. A file whose kind the extension did not settle is
 * shown as text when it decodes as text and as a hex dump when it does not: a NUL byte or a
 * sprinkle of control characters is what separates the two in practice.
 */
export function looksLikeText(bytes) {
  if (!bytes || !bytes.length) return true;
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return true;
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return true;
  }
  const sample = bytes.subarray(0, 8192);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / sample.length <= 0.02;
}

/** The text of an entry, honouring the byte-order mark the file starts with. */
export function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const marked = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return new TextDecoder("utf-8").decode(marked ? bytes.subarray(3) : bytes);
}

/** The share of an archive's content that is actually stored, for the summary bar. */
export function packedShare(packed, bytes) {
  const stored = Number(packed) || 0;
  const total = Number(bytes) || 0;
  if (stored <= 0 || total <= 0) return 0;
  return Math.min(1, stored / total);
}

/**
 * A decoder failure in the reader's language. The native side answers with a token — and
 * sometimes a detail after a colon — because only this side knows which language is on
 * screen; anything unrecognised is shown as it arrived rather than swallowed.
 */
export function describeError(message, say) {
  const text = String(message ?? "");
  const colon = text.indexOf(":");
  const token = colon === -1 ? text : text.slice(0, colon);
  const detail = colon === -1 ? "" : text.slice(colon + 1).trim();
  switch (token) {
    case "password-protected":
      return say("errPassword");
    case "entry-too-large":
      return say("errTooLarge", { size: humanBytes(Number(detail)) });
    case "unsupported-method":
      return say("errMethod", { method: detail });
    case "entry-missing":
      return say("errMissing");
    case "entry-is-a-directory":
      return say("errDirectory");
    case "entry-chunk-empty":
      return say("errMissing");
    case "multipart-archive":
      return say("errMultipart");
    case "archive-corrupt":
      return say("errCorrupt", { detail });
    case "io":
      return say("errIo", { detail });
    case "archive-session-expired":
      return say("errSession");
    default:
      return text || say("errUnknown");
  }
}

/** Bytes for a base64 reply, in the browser's own decoder. */
export function decodeBase64(encoded) {
  const binary = atob(String(encoded ?? ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/**
 * Splits a directory into peer messages. The host forwards these opaque payloads with a
 * 64 KiB budget each, so batches are cut by encoded size rather than by a fixed count.
 */
export function batchesBySize(entries, maxBytes = 24 * 1024, maxCount = 512) {
  const batches = [];
  let batch = [];
  for (const entry of entries) {
    batch.push(entry);
    if (batch.length >= maxCount || JSON.stringify(batch).length >= maxBytes) {
      batches.push(batch);
      batch = [];
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}
