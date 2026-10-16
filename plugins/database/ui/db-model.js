/**
 * The database preview's own logic, away from the DOM: what a cell reads as, which line the
 * host's information area shows, how a failure is worded and how the sidebar filters.
 *
 * The reader never sends a display string it made up for the grid; it sends the storage class
 * and the value, so that a number can be aligned, a blob shown as bytes and a NULL drawn as
 * something other than the four letters. Turning that into what a person reads happens here.
 */

/**
 * The value one grid cell shows. A blob is drawn as SQLite writes one — `x'1f8b…'` — with the
 * cut marked, because what the reader carries is a prefix of the bytes.
 */
export function cellText(cell) {
  if (cell === null || cell === undefined) return "NULL";
  if (cell.kind === "blob") return `x'${cell.hex}${cell.truncated ? "…" : ""}'`;
  return String(cell.text ?? "");
}

/** How a cell is drawn: numbers line up, NULL is quiet, a blob is not text. */
export function cellClass(cell) {
  if (cell === null || cell === undefined) return "null";
  if (cell.kind === "integer" || cell.kind === "real") return "numeric";
  if (cell.kind === "blob") return "blob";
  return "text";
}

/**
 * What the cell's hover text says. The grid clips a long value, so the hover text is the value
 * itself; what the reader cut away is explained after it. Empty means there is nothing to say.
 */
export function cellTitle(cell, say) {
  if (cell === null || cell === undefined) return say("nullValue");
  if (cell.kind === "blob") {
    const bytes = say("blobValue", { bytes: cell.bytes });
    return cell.truncated ? `${bytes} · ${say("truncatedBlob")}` : bytes;
  }
  const text = String(cell.text ?? "");
  if (!text) return "";
  if (cell.kind === "text" && cell.truncated) {
    return `${text} · ${say("truncatedText", { count: cell.characters })}`;
  }
  return text;
}

/**
 * A failure the native reader reported, as a sentence. The reader answers with a stable token,
 * and puts the underlying detail after a colon when it has one.
 */
export function describeError(message, say) {
  const text = String(message ?? "");
  const at = text.indexOf(":");
  const token = at === -1 ? text : text.slice(0, at);
  const detail = at === -1 ? "" : text.slice(at + 1);
  switch (token) {
    case "database-not-sqlite":
      return say("errorNotSqlite");
    case "database-unreadable":
      return say("errorUnreadable", { detail });
    case "database-locked":
      return say("errorLocked");
    case "database-corrupt":
      return say("errorCorrupt");
    case "database-object-missing":
      return say("errorObjectMissing");
    case "database-session-expired":
      return say("errorSessionExpired");
    case "database-too-wide":
      return say("errorTooWide", { count: detail });
    case "database-open-failed":
      return say("errorOpenFailed", { detail });
    case "database-query-failed":
      return say("errorQueryFailed", { detail });
    default:
      return text;
  }
}

/** Whether one object passes the sidebar's filter. An empty query passes everything. */
export function matchesFilter(name, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  return needle === "" || String(name ?? "").toLowerCase().includes(needle);
}

/** The pages a known row count makes, or null when there is no count to divide. */
export function pageCount(rows, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1);
  if (!rows || typeof rows.value !== "number") return null;
  return Math.max(1, Math.ceil(rows.value / size));
}

/**
 * How many rows an object holds. The reader stops counting at a limit and says so, and a view
 * has no count at all — both have to read as a fact rather than as zero.
 */
export function rowCountText(rows, say) {
  if (!rows) return say("unknownCount");
  return rows.exact ? String(rows.value) : say("moreThan", { count: rows.value });
}

/**
 * The one line the host's information area shows: which object is open, which rows are on
 * screen, and how many the whole table has when that is knowable at all.
 */
export function statusText({ name, kind, offset, length, rows, columns, say }) {
  const first = length > 0 ? offset + 1 : 0;
  const span = length > 1 ? `${first}–${offset + length}` : String(first);
  const values = {
    name,
    kind: say(kind === "view" ? "view" : "table"),
    span,
    columns,
    total: rows ? rows.value : 0,
  };
  if (!rows) return say("infoUnknown", values);
  if (!rows.exact) return say("infoCapped", values);
  return say("info", values);
}

/** The one line the host shows while the structure sheet, rather than the rows, is in front. */
export function structureText({ name, kind, columns, rows, say }) {
  return say("structureInfo", {
    name,
    kind: say(kind === "view" ? "view" : "table"),
    columns,
    rows: rowCountText(rows, say),
  });
}

/** A column's declared type, or the wording for the column SQLite gives no type at all. */
export function columnType(type, say) {
  const value = typeof type === "string" ? type.trim() : "";
  return value === "" ? say("noType") : value;
}

/** What makes a column special: part of the key, generated, or neither. */
export function keyText(column, say) {
  const marks = [];
  if (Number(column?.primaryKey) > 0) marks.push(say("primary"));
  if (column?.generated) marks.push(say("generated"));
  return marks.join(" · ");
}

/** Where an index comes from: written by hand, or the shadow of a constraint. */
export function indexOrigin(origin, say) {
  switch (origin) {
    case "pk":
      return say("originPrimary");
    case "u":
      return say("originUnique");
    default:
      return say("originCreated");
  }
}

/** An index's key columns. An expression column has no name and is worded instead. */
export function indexColumns(columns, say) {
  const list = Array.isArray(columns) ? columns : [];
  return list
    .map((column) => (column === null || column === undefined ? say("expression") : String(column)))
    .join(", ");
}

/** The sidebar's line about the file itself. */
export function factsText(facts, say) {
  if (!facts || facts.empty) return say("emptyFile");
  return say("facts", {
    library: String(facts.library ?? ""),
    pageSize: Number(facts.pageSize) || 0,
    pages: Number(facts.pageCount) || 0,
  });
}

/** The sidebar's line about what the file holds, by kind. */
export function objectSummary(facts, say) {
  const objects = Array.isArray(facts?.objects) ? facts.objects : [];
  const tables = objects.filter((object) => object.kind !== "view").length;
  const views = objects.length - tables;
  const parts = [];
  if (tables) parts.push(say("objectsTable", { count: tables }));
  if (views) parts.push(say("objectsView", { count: views }));
  const text = parts.join(" · ") || say("noObjects");
  return Number(facts?.objectCount) > objects.length ? `${text}${say("objectsTruncated")}` : text;
}
