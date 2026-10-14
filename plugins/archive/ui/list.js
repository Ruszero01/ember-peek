/**
 * The sidebar: the archive's file list.
 *
 * It is a peer of the view rather than part of it — the host mounts the same page twice and
 * carries opaque messages between the two documents — so this module owns the list, its
 * filter, its order and its keyboard handling, and asks the view for nothing but the
 * directory itself and the current selection.
 */
import {
  configuration,
  createIcon,
  onLocale,
  onSettings,
  onMessage,
  postTo,
  setSetting,
  sidebar,
  translate,
} from "./sdk.js";
import { ARCHIVE_TEXT } from "./text.js";
import {
  ancestorsOf,
  buildTree,
  cleanPath,
  expandEntry,
  filterTree,
  humanBytes,
  kindOf,
  sortTree,
  visibleRows,
} from "./model.js";

const say = translate(ARCHIVE_TEXT);
/** Must match `--row` in the stylesheet: the virtualised renderer multiplies it. */
const ROW = 24;
const INDENT = 14;
const GLYPH = {
  dir: "folder",
  image: "image",
  video: "film",
  audio: "music",
  text: "file-text",
  code: "code",
  archive: "archive",
  binary: "binary",
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountList() {
  document.body.classList.add("role-list");

  const filter = element("input", "ui-input");
  filter.type = "search";
  filter.spellcheck = false;

  const select = element("select");
  for (const key of ["name", "size", "packed", "modified"]) {
    const option = element("option", null, say(`sort_${key}`));
    option.value = key;
    select.append(option);
  }
  const selectFrame = element("span", "ui-select");
  selectFrame.append(select);

  const close = element("button", "close-button", "×");
  close.type = "button";

  const head = element("div", "list-head");
  head.append(filter, selectFrame, close);

  const scroll = element("div", "list-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "tree");
  const space = element("div", "list-space");
  scroll.append(space);

  const progress = element("div", "list-progress");
  const note = element("p", "list-note");

  document.body.append(head, progress, scroll, note);

  const icons = new Map();
  let records = [];
  let tree = buildTree([]);
  let rows = [];
  let filterState = null;
  let query = "";
  let expanded = new Set();
  let selectedEntry = -1;
  let selectedPath = "";
  let sortKey = configuration().sort || "name";
  let foldersFirst = configuration().foldersFirst !== false;
  let truncated = false;
  let loaded = 0;
  let total = 0;
  /** Whether the view has finished sending the directory — an archive with no entries is
   *  done loading too, and must not keep saying that it is still being read. */
  let finished = false;
  let frame;
  let needsRebuild = false;
  const pool = new Map();

  /** One request per glyph; a directory of ten thousand files still asks once. */
  function icon(name) {
    if (!icons.has(name)) {
      icons.set(name, null);
      createIcon(name, 13)
        .then((svg) => {
          icons.set(name, svg);
          schedule();
        })
        .catch(() => {});
    }
    return icons.get(name);
  }

  function labels() {
    filter.placeholder = say("filter");
    filter.setAttribute("aria-label", say("filter"));
    close.title = say("closeList");
    close.setAttribute("aria-label", say("closeList"));
    scroll.setAttribute("aria-label", say("fileList"));
    for (const option of select.options) option.textContent = say(`sort_${option.value}`);
  }

  function rebuild() {
    tree = sortTree(buildTree(records), {
      key: sortKey,
      foldersFirst,
      locale: document.documentElement.lang,
    });
    filterState = query ? filterTree(tree, query) : null;
  }

  function effectiveExpanded() {
    if (!filterState) return expanded;
    return new Set([...expanded, ...filterState.expanded]);
  }

  function schedule() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      draw();
    });
  }

  function draw() {
    if (needsRebuild) {
      needsRebuild = false;
      rebuild();
    }
    const open = effectiveExpanded();
    rows = visibleRows(tree, open, filterState);
    space.style.height = `${rows.length * ROW}px`;
    scroll.hidden = rows.length === 0;
    // The note says why the list is not what the reader expected; with rows on screen it is
    // hidden and emptied, so nothing stale is left in the document for a screen reader.
    note.hidden = true;
    note.textContent = "";
    if (!rows.length) {
      note.textContent = !finished
        ? say("readingList")
        : query
          ? say("noMatch")
          : say("emptyArchive");
      note.hidden = false;
    } else if (truncated) {
      note.textContent = say("listPartial", { count: total.toLocaleString() });
      note.hidden = false;
    }

    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW) - 6);
    const last = Math.min(rows.length, Math.ceil((scroll.scrollTop + scroll.clientHeight) / ROW) + 6);
    for (const [index, node] of pool) {
      if (index < first || index >= last) {
        node.remove();
        pool.delete(index);
      }
    }
    for (let index = first; index < last; index += 1) {
      let node = pool.get(index);
      if (!node) {
        node = element("div", "row");
        node.setAttribute("role", "treeitem");
        const caret = element("span", "caret");
        const glyph = element("span", "glyph");
        const label = element("span", "label");
        const size = element("span", "size");
        node.append(caret, glyph, label, size);
        node.parts = { caret, glyph, label, size };
        space.append(node);
        pool.set(index, node);
      }
      update(node, rows[index], index, open);
    }
  }

  function update(node, row, index, open) {
    const { node: item, depth } = row;
    const kind = item.dir ? "dir" : kindOf(item.name);
    const selected = !item.dir && item.index === selectedEntry;
    node.className = `row${item.dir ? " folder" : ""}${selected ? " selected" : ""}`;
    node.id = `archive-row-${index}`;
    node.dataset.index = String(index);
    node.dataset.kind = kind;
    node.style.top = `${index * ROW}px`;
    node.style.paddingLeft = `${6 + depth * INDENT}px`;
    node.setAttribute("aria-level", String(depth + 1));
    node.setAttribute("aria-selected", selected ? "true" : "false");
    if (item.dir) node.setAttribute("aria-expanded", open.has(item.path) ? "true" : "false");
    else node.removeAttribute("aria-expanded");

    const { caret, glyph, label, size } = node.parts;
    caret.className = item.dir ? `caret${open.has(item.path) ? " open" : ""}` : "caret leaf";
    const svg = icon(GLYPH[kind] ?? "binary");
    if (svg) {
      if (node.dataset.glyph !== kind) {
        node.dataset.glyph = kind;
        glyph.replaceChildren(svg.cloneNode(true));
      }
    } else if (node.dataset.glyph !== undefined) {
      delete node.dataset.glyph;
      glyph.replaceChildren();
    }
    node.title = item.path;
    const wanted = item.name;
    if (label.dataset.name !== wanted) {
      label.dataset.name = wanted;
      const text = element("span", "text", wanted);
      label.replaceChildren(text);
      if (item.encrypted) {
        const lock = icon("lock");
        const mark = element("span", "locked");
        mark.title = say("passwordEntry");
        if (lock) mark.append(lock.cloneNode(true));
        label.append(mark);
      }
    }
    size.textContent = item.dir && !item.children.length && item.size === 0 ? "—" : humanBytes(item.size);
  }

  function selectByRow(index, { reveal = true } = {}) {
    const row = rows[index];
    if (!row) return;
    const item = row.node;
    if (item.dir) {
      selectedPath = item.path;
      expanded = new Set([...expanded, item.path]);
      schedule();
      void postTo("view", { kind: "select-folder", path: item.path });
      return;
    }
    if (item.index < 0) return;
    selectedEntry = item.index;
    selectedPath = item.path;
    schedule();
    if (reveal) revealRow(index);
    void postTo("view", { kind: "select", index: item.index });
  }

  function revealPath(path) {
    const index = rows.findIndex((row) => row.node.path === path);
    if (index === -1) return;
    revealRow(index);
  }

  function revealRow(index) {
    const top = index * ROW;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTop = top + ROW - scroll.clientHeight;
    }
  }

  function toggle(path) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expanded = next;
    schedule();
    void postTo("view", { kind: "toggle-folder", path, open: next.has(path) });
  }

  scroll.addEventListener("click", (event) => {
    const row = event.target.closest(".row");
    if (!row) return;
    const index = Number(row.dataset.index);
    const item = rows[index]?.node;
    if (!item) return;
    const onCaret = Boolean(event.target.closest(".caret"));
    if (item.dir) {
      toggle(item.path);
      if (!onCaret) void postTo("view", { kind: "select-folder", path: item.path });
      return;
    }
    selectByRow(index);
  });

  scroll.addEventListener("keydown", (event) => {
    const current = rows.findIndex(
      (row) => (row.node.dir ? row.node.path === selectedPath : row.node.index === selectedEntry),
    );
    const move = (delta) => {
      const next = Math.max(0, Math.min(rows.length - 1, (current === -1 ? 0 : current) + delta));
      selectByRow(next);
      event.preventDefault();
    };
    switch (event.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        selectByRow(0);
        event.preventDefault();
        break;
      case "End":
        selectByRow(rows.length - 1);
        event.preventDefault();
        break;
      case "ArrowRight": {
        const row = rows[current];
        if (row?.node.dir && !expanded.has(row.node.path)) toggle(row.node.path);
        else if (row?.node.dir) selectByRow(current + 1);
        event.preventDefault();
        break;
      }
      case "ArrowLeft": {
        const row = rows[current];
        if (row?.node.dir && expanded.has(row.node.path)) toggle(row.node.path);
        else if (row) {
          const parent = ancestorsOf(row.node.path).pop();
          if (parent) {
            const index = rows.findIndex((item) => item.node.path === parent);
            if (index !== -1) selectByRow(index);
          }
        }
        event.preventDefault();
        break;
      }
      case "Enter":
        if (current !== -1) selectByRow(current);
        event.preventDefault();
        break;
      default:
        break;
    }
  });

  filter.addEventListener("input", () => {
    query = filter.value;
    filterState = query ? filterTree(tree, query) : null;
    scroll.scrollTop = 0;
    schedule();
  });

  select.addEventListener("change", () => {
    void setSetting("sort", select.value).catch(() => {
      select.value = sortKey;
    });
  });

  close.addEventListener("click", async () => {
    await postTo("view", { kind: "close-buttond" }).catch(() => {});
    await sidebar(false).catch(() => {});
  });

  const messages = onMessage((message, from) => {
    if (from !== "view" || !message) return;
    if (message.kind === "list-start") {
      records = [];
      expanded = new Set();
      selectedEntry = -1;
      selectedPath = "";
      loaded = 0;
      total = Number(message.count) || 0;
      truncated = message.truncated === true;
      finished = false;
      filterState = null;
      filter.value = "";
      query = "";
      needsRebuild = true;
      progress.hidden = false;
      progress.textContent = say("readingList");
      schedule();
      return;
    }
    if (message.kind === "list-batch" && Array.isArray(message.entries)) {
      const start = Number(message.start) || 0;
      if (start !== records.length) return;
      for (const record of message.entries) records.push(expandEntry(record, records.length));
      loaded = records.length;
      progress.textContent = say("listProgress", {
        loaded: loaded.toLocaleString(),
        total: (total || loaded).toLocaleString(),
      });
      needsRebuild = true;
      schedule();
      return;
    }
    if (message.kind === "list-end") {
      loaded = records.length;
      finished = true;
      progress.hidden = true;
      needsRebuild = true;
      schedule();
      return;
    }
    if (message.kind === "selected" && Number.isInteger(message.index)) {
      const item = records[message.index];
      if (!item) return;
      selectedEntry = message.index;
      selectedPath = cleanPath(item.name);
      if (message.reveal !== false) {
        const open = new Set(expanded);
        for (const path of ancestorsOf(selectedPath)) open.add(path);
        expanded = open;
      }
      schedule();
      requestAnimationFrame(() => revealPath(selectedPath));
    }
  });

  const observer = new ResizeObserver(schedule);
  observer.observe(scroll);
  scroll.addEventListener("scroll", schedule, { passive: true });

  const settingsOff = onSettings((settings) => {
    const nextSort = settings.sort || "name";
    const nextFolders = settings.foldersFirst !== false;
    if (nextSort !== sortKey || nextFolders !== foldersFirst) {
      sortKey = nextSort;
      foldersFirst = nextFolders;
      select.value = sortKey;
      needsRebuild = true;
      schedule();
    }
  });

  const localeOff = onLocale(() => {
    labels();
    for (const node of pool.values()) {
      delete node.dataset.glyph;
      delete node.parts.label.dataset.name;
    }
    schedule();
  });

  addEventListener(
    "pagehide",
    () => {
      messages();
      settingsOff();
      localeOff();
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    },
    { once: true },
  );

  select.value = sortKey;
  labels();
  schedule();
  void postTo("view", { kind: "list-hello" });
}
