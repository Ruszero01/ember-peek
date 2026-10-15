/**
 * The archive's content: the facts about the container, and one entry at a time.
 *
 * The view owns the session — it is the primary mount — so it fetches the directory from the
 * native reader, decides what the selected entry is, and hands the list, the information
 * panel and the host's toolbar their share. Nothing is ever unpacked: bytes for the entry in
 * front of the reader are read in bounded ranges and drawn or decoded straight away.
 */
import {
  call,
  clipboard,
  configuration,
  controls,
  loading,
  locale,
  onLocale,
  onMessage,
  onSettings,
  panel,
  postTo,
  presented,
  ready,
  sidebar,
  status,
  translate,
} from "./sdk.js";
import { createTextView } from "./sdk-view.js";
import { ARCHIVE_TEXT } from "./text.js";
import {
  batchesBySize,
  buildTree,
  cleanPath,
  compactEntry,
  concatBytes,
  decodeBase64,
  decodeText,
  describeError,
  firstPreviewable,
  formatDate,
  hexDump,
  humanBytes,
  kindOf,
  looksLikeText,
  mimeOf,
  packedShare,
  sortTree,
} from "./model.js";
import { mountList } from "./list.js";
import { mountPanel } from "./panel.js";

const say = translate(ARCHIVE_TEXT);
/** What the native reader accepts in one request; asking for more only wastes a round trip. */
const CHUNK = 4 * 1024 * 1024;
/** How many entries one directory page carries. */
const PAGE = 2000;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const initial = await ready;
if (initial.role === "sidebar") mountList();
else if (initial.role === "panel") mountPanel();
else mountView(initial);

function mountView(initial) {
  const summary = initial.data ?? {};
  document.body.classList.add("role-view");

  const content = element("div");
  content.id = "content";
  document.body.append(content);

  let records = [];
  let tree = buildTree([]);
  const byPath = new Map();
  let selected = null;
  let generation = 0;
  let listOpen = false;
  let panelOpen = false;
  let fit = true;
  let frame;
  let textView = null;
  let urls = [];
  let stage = null;
  let lastWrap = configuration().wrap !== false;

  function indexing() {
    byPath.clear();
    const walk = (node) => {
      if (node.path) byPath.set(node.path, node);
      for (const child of node.children) walk(child);
    };
    walk(tree);
  }

  function rebuild() {
    tree = sortTree(buildTree(records), {
      key: configuration().sort || "name",
      foldersFirst: configuration().foldersFirst !== false,
      locale: locale(),
    });
    indexing();
  }

  /** The entry range a renderer may read: what the reader says the entry is, or the setting. */
  function limitFor(entry, megabytes) {
    const setting = Math.max(1, Number(megabytes) || 1) * 1024 * 1024;
    if (!entry.size) return setting;
    return Math.min(entry.size, setting);
  }

  async function readEntry(entry, limit) {
    const parts = [];
    let offset = 0;
    while (limit <= 0 || offset < limit) {
      const want = limit > 0 ? Math.min(CHUNK, limit - offset) : CHUNK;
      const reply = await call("read-entry", {
        index: entry.index,
        offset,
        length: want,
      });
      const bytes = decodeBase64(reply?.data ?? "");
      if (!bytes.length) break;
      parts.push(bytes);
      offset += bytes.length;
      if (reply.eof === true || bytes.length < want) break;
    }
    return concatBytes(parts);
  }

  function teardown() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
    if (textView) {
      textView.view.destroy();
      textView = null;
    }
    stage = null;
  }

  function stageFor(className) {
    const node = element("div", `stage ${className}`.trim());
    stage = node;
    return node;
  }

  function applyFit() {
    if (stage) stage.classList.toggle("actual", !fit);
  }

  function fieldList(pairs) {
    const list = element("dl", "ui-fields");
    for (const [name, value] of pairs) {
      list.append(element("dt", null, name), element("dd", null, value));
    }
    return list;
  }

  /** The manifest's own list: the kit's field list carries a rule between rows, which a card
   *  that already has a frame does not want, so this draws the same pairs without them. */
  function manifestFields(pairs) {
    const list = element("dl", "manifest-facts pair");
    for (const [name, value] of pairs) {
      list.append(element("dt", null, name), element("dd", null, value));
    }
    return list;
  }

  function sheet(child) {
    const node = stageFor("sheet");
    node.append(child);
    return node;
  }

  function pathLine(entry) {
    return element("div", "facts-path", entry.path);
  }

  function factsCard(entry, message, tone) {
    const card = element("section", "facts");
    card.append(pathLine(entry));
    card.append(
      fieldList([
        [say("size"), humanBytes(entry.size)],
        [say("stored"), entry.packed > 0 ? humanBytes(entry.packed) : "—"],
        [say("method"), entry.method || "—"],
        [say("modified"), formatDate(entry.modified, locale())],
        [say("kind"), kindLabel(entry.name)],
      ]),
    );
    if (message) card.append(element("p", `note${tone ? ` ${tone}` : ""}`, message));
    return card;
  }

  function kindLabel(name) {
    const kind = kindOf(name);
    return say(`kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);
  }

  function manifestCard() {
    const card = element("section", "manifest");
    const head = element("div", "manifest-head");
    head.append(
      element("span", "manifest-format", String(summary.format ?? "").toUpperCase() || say("unknown")),
      element("span", "manifest-count", `${say("archiveSize")} ${humanBytes(summary.archiveBytes)}`),
    );
    card.append(head);
    // Files and folders as the list shows them — a container that stores only file names
    // still reads as having folders — beside the two sizes their ratio is made of.
    card.append(
      manifestFields([
        [say("files"), (summary.files ?? 0).toLocaleString()],
        [say("folders"), (summary.folders ?? 0).toLocaleString()],
        [say("unpacked"), humanBytes(summary.bytes)],
        [say("packed"), summary.packed > 0 ? humanBytes(summary.packed) : humanBytes(summary.archiveBytes)],
      ]),
    );
    if (summary.bytes > 0) {
      const stored = summary.packed > 0 ? summary.packed : summary.archiveBytes;
      const share = packedShare(stored, summary.bytes);
      const bar = element("div", "manifest-bar");
      const track = element("div", "bar-track");
      const fill = element("div", "bar-fill");
      fill.style.width = `${Math.max(2, Math.round(share * 100))}%`;
      track.append(fill);
      bar.append(track, element("div", "bar-caption", say("ratio", { percent: Math.round(share * 100) })));
      card.append(bar);
    }
    if (summary.encrypted) card.append(element("p", "note warning", say("encryptedArchive")));
    const hint = !summary.count
      ? say("emptyArchive")
      : listOpen
        ? say("hintSelect")
        : say("hintList");
    card.append(element("p", "hint", hint));
    return card;
  }

  function folderCard(entry) {
    const card = element("section", "facts");
    card.append(pathLine(entry));
    card.append(
      fieldList([
        [say("files"), (entry.files ?? 0).toLocaleString()],
        [say("folders"), (entry.folders ?? 0).toLocaleString()],
        [say("size"), humanBytes(entry.size)],
      ]),
    );
    return card;
  }

  function hexCard(entry, bytes) {
    const card = element("section", "facts");
    card.append(pathLine(entry));
    card.append(
      fieldList([
        [say("size"), humanBytes(entry.size)],
        [say("kind"), kindLabel(entry.name)],
      ]),
    );
    if (!bytes.length) {
      card.append(element("p", "note", say("emptyEntry")));
      return card;
    }
    card.append(element("p", "note", say("hexNote")));
    const dump = element("div", "hex");
    for (const line of hexDump(bytes)) {
      const row = element("div", "hex-row");
      row.append(
        element("span", "offset", line.offset),
        element("span", "bytes", line.hex),
        element("span", "readable", line.text),
      );
      dump.append(row);
    }
    card.append(dump);
    return card;
  }

  /** The host's information line: what is in front of the reader, in one row. */
  function updateStatus(text) {
    if (text) {
      status(text);
      return;
    }
    if (!selected) {
      status(
        [
          String(summary.format ?? "").toUpperCase() || say("unknown"),
          say("statusCounts", {
            files: (summary.files ?? 0).toLocaleString(),
            folders: (summary.folders ?? 0).toLocaleString(),
          }),
          humanBytes(summary.bytes),
        ].join(" · "),
      );
      return;
    }
    if (selected.dir) {
      status(
        [
          selected.path,
          say("dirSummary", {
            files: (selected.files ?? 0).toLocaleString(),
            folders: (selected.folders ?? 0).toLocaleString(),
          }),
          humanBytes(selected.size),
        ].join(" · "),
      );
      return;
    }
    status([selected.path, humanBytes(selected.size), selected.method].filter(Boolean).join(" · "));
  }

  function publishControls() {
    const items = [
      {
        id: "list",
        kind: "toggle",
        label: say("fileList"),
        icon: "panel-left",
        active: listOpen,
        run: () => void openList(!listOpen),
      },
      {
        id: "info",
        kind: "toggle",
        label: say("info"),
        icon: "info",
        active: panelOpen,
        run: () => void openPanel(!panelOpen),
      },
    ];
    const kind = selected && !selected.dir ? kindOf(selected.name) : "";
    if (kind === "image") {
      items.push({
        id: "fit",
        kind: "toggle",
        label: fit ? say("actual") : say("fit"),
        icon: fit ? "actual" : "fit",
        active: fit,
        run: () => {
          fit = !fit;
          applyFit();
          publishControls();
        },
      });
    }
    if (selected && !selected.dir) {
      items.push({
        id: "copy",
        kind: "button",
        label: say("copyPath"),
        icon: "copy",
        run: () => void copySelectedPath(),
      });
    }
    controls(items);
  }

  async function copySelectedPath() {
    if (!selected) return;
    try {
      await clipboard(selected.path);
      updateStatus(say("copied"));
      setTimeout(() => updateStatus(), 1200);
    } catch (error) {
      updateStatus(errorText(error));
    }
  }

  function errorText(error) {
    return describeError(error?.message ?? error, say);
  }

  function select(node, { reveal = true, immediate = false } = {}) {
    selected = node ?? null;
    publishControls();
    updateStatus();
    if (panelOpen) void sendInfo();
    if (listOpen && selected && !selected.dir) {
      void postTo("sidebar", { kind: "selected", index: selected.index, reveal }).catch(() => {});
    }
    clearTimeout(frame);
    if (immediate) return render();
    frame = setTimeout(() => void render(), 120);
    return Promise.resolve();
  }

  async function openList(open) {
    listOpen = open;
    publishControls();
    if (!selected) render();
    try {
      await sidebar(
        open,
        open ? { side: "left", width: 260, minWidth: 180, maxWidth: 420 } : undefined,
      );
    } catch {
      listOpen = false;
      publishControls();
    }
  }

  async function openPanel(open) {
    panelOpen = open;
    publishControls();
    try {
      await panel(open);
      if (open) void sendInfo();
    } catch {
      panelOpen = false;
      publishControls();
    }
  }

  async function sendDirectory() {
    const compact = records.map(compactEntry);
    const started = await postTo("sidebar", {
      kind: "list-start",
      count: compact.length,
      truncated: summary.truncated === true,
    }).catch(() => false);
    if (!started) return;
    let offset = 0;
    for (const batch of batchesBySize(compact)) {
      const sent = await postTo("sidebar", { kind: "list-batch", start: offset, entries: batch }).catch(
        () => false,
      );
      if (!sent) return;
      offset += batch.length;
    }
    await postTo("sidebar", { kind: "list-end" }).catch(() => {});
    if (selected && !selected.dir) {
      await postTo("sidebar", { kind: "selected", index: selected.index }).catch(() => {});
    }
  }

  function factsOf(node) {
    if (!node) return null;
    if (node.dir) {
      return {
        path: node.path,
        dir: true,
        size: node.size,
        files: node.files,
        folders: node.folders,
        modified: node.modified,
      };
    }
    return {
      path: node.path,
      size: node.size,
      packed: node.packed,
      modified: node.modified,
      method: node.method,
      encrypted: node.encrypted,
      kind: kindLabel(node.name),
    };
  }

  async function sendInfo() {
    await postTo("panel", {
      kind: "archive-info",
      summary,
      selected: factsOf(selected),
    }).catch(() => {});
  }

  async function showText(entry, current, prefix) {
    const limit = Math.max(1, Number(configuration().textLimit) || 512) * 1024;
    const bytes = prefix ?? (await readEntry(entry, entry.size ? Math.min(entry.size, limit) : limit));
    if (current !== generation) return;
    if (!bytes.length) {
      content.replaceChildren(sheet(factsCard(entry, say("emptyEntry"))));
      return;
    }
    const notice = element("div", null, "");
    notice.id = "notice";
    notice.setAttribute("role", "status");
    if (entry.size > bytes.length) notice.textContent = say("truncText", { size: humanBytes(bytes.length) });
    const surface = element("main");
    surface.id = "surface";
    const node = stageFor("");
    node.append(surface);
    content.replaceChildren(node, notice);
    const view = await createTextView({
      parent: surface,
      text: decodeText(bytes),
      name: entry.name,
      wrap: configuration().wrap !== false,
      numbers: true,
    });
    if (current !== generation) {
      view.view.destroy();
      return;
    }
    textView = view;
    updateStatus(
      [entry.path, humanBytes(entry.size), entry.method, entry.size > bytes.length ? say("truncText", { size: humanBytes(bytes.length) }) : ""]
        .filter(Boolean)
        .join(" · "),
    );
  }

  async function showImage(entry, current) {
    const bytes = await readEntry(entry, limitFor(entry, configuration().mediaLimit || 48));
    if (current !== generation) return;
    if (!bytes.length) {
      content.replaceChildren(sheet(factsCard(entry, say("emptyEntry"))));
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(entry.name) || "application/octet-stream" }));
    urls.push(url);
    const truncated = entry.size > bytes.length ? say("truncText", { size: humanBytes(bytes.length) }) : "";
    const image = element("img");
    image.alt = entry.name;
    image.src = url;
    const node = stageFor("pane");
    node.append(image);
    content.replaceChildren(node);
    applyFit();
    image.addEventListener(
      "load",
      () => {
        if (current !== generation) return;
        updateStatus(
          [entry.path, `${image.naturalWidth}×${image.naturalHeight}`, humanBytes(entry.size), entry.method, truncated]
            .filter(Boolean)
            .join(" · "),
        );
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        if (current !== generation) return;
        content.replaceChildren(sheet(factsCard(entry, say("imageUndecodable"), "warning")));
      },
      { once: true },
    );
    updateStatus([entry.path, humanBytes(entry.size), entry.method, truncated].filter(Boolean).join(" · "));
  }

  async function showUnknown(entry, current) {
    const prefix = await readEntry(entry, 4096);
    if (current !== generation) return;
    if (prefix.length && looksLikeText(prefix)) {
      await showText(entry, current);
      return;
    }
    content.replaceChildren(sheet(hexCard(entry, prefix)));
  }

  async function render() {
    const current = ++generation;
    teardown();
    const entry = selected;
    if (!entry) {
      const node = stageFor("center");
      node.append(manifestCard());
      content.replaceChildren(node);
      return;
    }
    if (entry.dir) {
      content.replaceChildren(sheet(folderCard(entry)));
      return;
    }
    const kind = kindOf(entry.name);
    try {
      if (kind === "image") await showImage(entry, current);
      else if (kind === "text" || kind === "code") await showText(entry, current);
      else if (kind === "video") content.replaceChildren(sheet(factsCard(entry, say("videoNote"))));
      else if (kind === "audio") content.replaceChildren(sheet(factsCard(entry, say("audioNote"))));
      else if (kind === "archive") content.replaceChildren(sheet(factsCard(entry, say("nestedNote"))));
      else await showUnknown(entry, current);
    } catch (error) {
      if (current !== generation) return;
      content.replaceChildren(sheet(factsCard(entry, errorText(error), "error")));
    }
  }

  const messages = onMessage((message, from) => {
    if (!message) return;
    if (from === "sidebar") {
      if (message.kind === "list-hello") void sendDirectory();
      else if (message.kind === "list-closed") {
        listOpen = false;
        publishControls();
        if (!selected) render();
      } else if (message.kind === "select" && Number.isInteger(message.index)) {
        const entry = records[message.index];
        if (entry) select(byPath.get(cleanPath(entry.name)));
      } else if (message.kind === "select-folder" && typeof message.path === "string") {
        const node = byPath.get(cleanPath(message.path));
        if (node) select(node, { reveal: false });
      }
      return;
    }
    if (from === "panel") {
      if (message.kind === "info-hello") void sendInfo();
      else if (message.kind === "info-closed") {
        panelOpen = false;
        publishControls();
      }
    }
  });

  const settingsOff = onSettings((next) => {
    const wrap = next.wrap !== false;
    if (wrap !== lastWrap) {
      lastWrap = wrap;
      void render();
    }
  });

  const localeOff = onLocale(() => {
    publishControls();
    updateStatus();
    void render();
  });

  addEventListener(
    "pagehide",
    () => {
      messages();
      settingsOff();
      localeOff();
      teardown();
    },
    { once: true },
  );

  async function start() {
    const expected = summary.count ?? 0;
    const first = summary.entries?.length ?? 0;
    if (expected > first) loading(Math.min(1, first / expected));
    records = (summary.entries ?? []).map((entry, index) => ({ ...entry, index }));
    while (records.length < expected) {
      const reply = await call("page", { offset: records.length, limit: PAGE });
      const page = Array.isArray(reply?.entries) ? reply.entries : [];
      if (!page.length) break;
      for (const entry of page) records.push({ ...entry, index: records.length });
      loading(Math.min(1, records.length / (expected || records.length)));
    }
    rebuild();
    // With the list open there is something to look at, so the first entry that is worth
    // showing is selected for the reader. With the list closed nothing could be picked, and
    // the archive's own summary is what the viewport is for.
    const listed = configuration().showList !== false;
    if (listed) await openList(true);
    const previewable = listed ? firstPreviewable(tree) : null;
    if (previewable) {
      await select(previewable, { immediate: true });
    } else {
      publishControls();
      updateStatus();
      await render();
    }
    await presented();
  }

  void start().catch(async (error) => {
    await presented(errorText(error)).catch(() => {});
  });
}
