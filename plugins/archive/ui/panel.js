/**
 * The information panel: what the archive is, and what the selected entry is.
 *
 * The host places and drags this card; everything inside it is drawn here. It holds no state
 * of its own beyond the last report from the view, because a panel is unmounted whenever it
 * closes and must not assume it is remembered.
 */
import { onLocale, onMessage, panel, postTo, translate } from "./sdk.js";
import { ARCHIVE_TEXT } from "./text.js";
import { formatDate, humanBytes, packedShare } from "./model.js";

const say = translate(ARCHIVE_TEXT);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fields(pairs) {
  const list = element("dl", "manifest-facts");
  for (const [name, value] of pairs) {
    list.append(element("dt", null, name), element("dd", null, value));
  }
  return list;
}

export function mountPanel() {
  document.body.classList.add("role-panel");

  const title = element("span", "panel-title", say("info"));
  const close = element("button", "close-button", "×");
  close.type = "button";
  close.title = say("closeList");
  close.setAttribute("aria-label", say("closeList"));

  const head = element("div", "panel-head");
  head.append(title, close);
  const body = element("div", "panel-body");
  document.body.append(head, body);

  let state = null;

  function summarySection(summary) {
    const section = element("section", "panel-section");
    const heading = element("div", "manifest-head");
    heading.append(
      element("span", "manifest-format", String(summary.format ?? "").toUpperCase() || say("unknown")),
      element("span", "manifest-count", `${say("archiveSize")} ${humanBytes(summary.archiveBytes)}`),
    );
    section.append(heading);
    section.append(
      fields([
        [say("files"), (summary.files ?? 0).toLocaleString()],
        [say("folders"), (summary.folders ?? 0).toLocaleString()],
        [say("unpacked"), humanBytes(summary.bytes)],
        [say("packed"), summary.packed > 0 ? humanBytes(summary.packed) : humanBytes(summary.archiveBytes)],
      ]),
    );
    const stored = summary.packed > 0 ? summary.packed : summary.archiveBytes;
    const share = packedShare(stored, summary.bytes);
    if (summary.bytes > 0) {
      const bar = element("div", "manifest-bar");
      const track = element("div", "bar-track");
      const fill = element("div", "bar-fill");
      fill.style.width = `${Math.max(2, Math.round(share * 100))}%`;
      track.append(fill);
      bar.append(track, element("div", "bar-caption", say("ratio", { percent: Math.round(share * 100) })));
      section.append(bar);
    }
    if (summary.encrypted) section.append(element("p", "note warning", say("encryptedArchive")));
    if (summary.truncated) {
      section.append(element("p", "note", say("listPartial", { count: (summary.count ?? 0).toLocaleString() })));
    }
    return section;
  }

  function selectedSection(selected) {
    const section = element("section", "panel-section panel-selected");
    section.append(element("div", "panel-heading", say("selectedEntry")));
    if (!selected) {
      section.append(element("p", "hint", say("hintSelect")));
      return section;
    }
    section.append(element("div", "facts-path", selected.path));
    const pairs = [[say("size"), humanBytes(selected.size)]];
    if (selected.dir) {
      pairs.push([say("files"), (selected.files ?? 0).toLocaleString()]);
      pairs.push([say("folders"), (selected.folders ?? 0).toLocaleString()]);
    } else {
      pairs.push([say("stored"), selected.packed > 0 ? humanBytes(selected.packed) : "—"]);
      pairs.push([say("method"), selected.method || "—"]);
    }
    pairs.push([say("modified"), formatDate(selected.modified, document.documentElement.lang)]);
    section.append(fields(pairs));
    if (selected.encrypted) section.append(element("p", "note warning", say("passwordEntry")));
    return section;
  }

  function render() {
    body.replaceChildren();
    if (!state?.summary) {
      body.append(element("p", "hint", say("readingList")));
      return;
    }
    body.append(summarySection(state.summary), selectedSection(state.selected ?? null));
  }

  const messages = onMessage((message, from) => {
    if (from !== "view" || message?.kind !== "archive-info") return;
    state = message;
    render();
  });

  const localeOff = onLocale(() => {
    title.textContent = say("info");
    close.title = say("closeList");
    close.setAttribute("aria-label", say("closeList"));
    render();
  });

  close.addEventListener("click", async () => {
    await postTo("view", { kind: "info-closed" }).catch(() => {});
    await panel(false).catch(() => {});
  });

  addEventListener(
    "pagehide",
    () => {
      messages();
      localeOff();
    },
    { once: true },
  );

  render();
  void postTo("view", { kind: "info-hello" });
}
