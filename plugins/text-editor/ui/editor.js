import {
  ready,
  shortcuts,
  controls,
  status,
  presented,
  pending,
  mutate,
  fileChanged,
  panel,
  postTo,
  onMessage,
  configuration,
  onSettings,
  translate,
  onLocale,
} from "./sdk.js";
import { mountSearchBar, findOccurrences } from "./sdk-search.js";
import { createTextView } from "./sdk-view.js";
import { synchronizePosition } from "./sdk-navigation.js";

/**
 * The plugin's own wording, in the language the host is showing. This includes the words
 * the host quotes back: `pending` hands it the phrase its refusal sentence uses, so the
 * reason a draft blocks an uninstall is written by the plugin, in the reader's language.
 */
const say = translate({
  "zh-CN": {
    noSource: "缺少兼容的文本数据源",
    pending: "未保存的编辑",
    protectFailed: "无法保护草稿：{error}",
    unsaved: "未保存",
    saved: "已保存",
    saveFailed: "保存失败 · 草稿保留",
    readOnlyNote:
      "只读：文件过大、编码无效或换行混合，已禁止覆盖。",
    discard: "撤销未保存修改",
    save: "保存文本 (Ctrl+S)",
    search: "搜索文本",
  },
  en: {
    noSource: "No compatible text data source",
    pending: "unsaved edits",
    protectFailed: "Could not protect the draft: {error}",
    unsaved: "Unsaved",
    saved: "Saved",
    saveFailed: "Save failed · the draft is kept",
    readOnlyNote:
      "Read-only: the file is too large, badly encoded, or mixes line endings, so it will not be overwritten.",
    discard: "Undo the unsaved changes",
    save: "Save the text (Ctrl+S)",
    search: "Search the text",
  },
});

// One entry, two mounts: the view edits the text, the panel holds the search controls. They
// are separate documents, so the query and the match position travel over the host's opaque
// pipe — the host does not know what a search is.
const initial = await ready;
const { role } = initial;
document.body.classList.toggle("panel", role === "panel");

if (role === "panel") await mountPanel();
else await mountEditor(initial);

async function mountPanel() {
  const bar = mountSearchBar({
    root: document.querySelector("#search"),
    onQuery: (value) =>
      void postTo("view", { kind: "query", value }).catch(() => {}),
    onStep: (direction) =>
      void postTo("view", { kind: "step", value: direction }).catch(() => {}),
    // Esc in the field closes the panel the same way the ✕ does, so both tell the view.
    onClose: () => {
      void postTo("view", { kind: "bye" }).catch(() => {});
      void panel(false);
    },
  });
  onMessage((message) => {
    if (message?.kind === "status") bar.setStatus(message);
  });
  void postTo("view", { kind: "hello" }).catch(() => {});
  void postTo("view", { kind: "sync" }).catch(() => {});
  bar.focus();
  // No presented() here: this mount shares the session with the view, and the view owns the
  // lifecycle. The host rejects session-owning calls from a panel on purpose.
}

async function mountEditor(initial) {
  const notice = document.querySelector("#notice");
  // What the notice is currently saying, so a language change refreshes the one line this
  // plugin wrote itself without overwriting an error it cannot retranslate.
  let noticeSays = "none";
  const data = initial.source?.data || initial.data;
  if (!data || (initial.source && initial.source.contract !== "ember.text/1")) {
    await presented(say("noSource"));
    return;
  }
  const endings = new Set(data.text.match(/\r\n|\r|\n/g) || []);
  const eol = endings.values().next().value || "\n";
  const editable = data.editable && endings.size <= 1;
  let saved = data.text.replace(/\r\n?|\n/g, "\n"),
    fingerprint = data.fingerprint;
  let saving = false,
    // Reports are serialized: the host must see them in the order the editor changed state.
    reports = Promise.resolve(),
    navigation,
    surface,
    panelOpen = false;
  let query = "",
    found = [],
    current = -1;
  function mark(value) {
    reports = reports.then(() =>
      pending(value, value ? say("pending") : undefined),
    );
    return reports;
  }
  function publishSearch() {
    void postTo("panel", {
      kind: "status",
      query,
      count: found.length,
      index: current,
    }).catch(() => {});
  }
  function find(value, jump = true) {
    query = String(value ?? "");
    found = findOccurrences(surface.text, query);
    current = found.length ? 0 : -1;
    surface.search(query);
    if (jump) reveal();
    publishSearch();
  }
  function reveal() {
    const hit = found[current];
    if (hit) surface.select(hit.start, hit.end);
  }
  function changed(text) {
    if (!surface) return;
    void mark(text !== saved).catch((error) => {
      surface.readOnly(true);
      notice.textContent = say("protectFailed", { error });
    });
    status(text !== saved ? say("unsaved") : data.encoding);
    if (query) queueMicrotask(() => find(query, false));
  }
  try {
    surface = await createTextView({
      parent: document.querySelector("#surface"),
      text: saved,
      name: initial.file.name,
      editable,
      wrap: true,
      onChange: changed,
      onPosition: () => navigation?.changed(),
    });
    notice.textContent = editable ? "" : say("readOnlyNote");
    noticeSays = editable ? "none" : "readOnly";
    async function save() {
      if (saving || !editable || surface.text === saved) return;
      saving = true;
      surface.readOnly(true);
      try {
        await reports;
        await navigation?.flush();
        const result = await mutate("save", {
          text: surface.text.replace(/\n/g, eol),
          fingerprint,
          encoding: data.encoding,
          bom: data.bom,
        });
        fingerprint = result.fingerprint;
        saved = surface.text;
        await mark(false);
        status(say("saved"));
        notice.textContent = "";
        await fileChanged();
      } catch (error) {
        notice.textContent = String(error);
        status(say("saveFailed"));
      } finally {
        saving = false;
        surface.readOnly(!editable);
      }
    }
    async function discard() {
      if (saving) return;
      surface.setText(saved);
      await mark(false);
      status(data.encoding);
      notice.textContent = "";
    }
    function setPanel(open) {
      panelOpen = open;
      publishControls();
      void panel(open);
    }
    function publishControls() {
      controls([
        ...(editable
          ? [
              {
                id: "discard",
                kind: "button",
                label: say("discard"),
                icon: "rotate-ccw",
                run: discard,
              },
              {
                id: "save",
                kind: "button",
                label: say("save"),
                icon: "save",
                run: save,
              },
            ]
          : []),
        {
          id: "search",
          kind: "toggle",
          label: say("search"),
          icon: "search",
          active: panelOpen,
          run: () => setPanel(!panelOpen),
        },
      ]);
    }
    onMessage((message) => {
      if (message?.kind === "query") find(message.value);
      else if (message?.kind === "step" && found.length) {
        current =
          (current + (message.value === "previous" ? -1 : 1) + found.length) %
          found.length;
        reveal();
        publishSearch();
      } else if (message?.kind === "sync") publishSearch();
      else if (message?.kind === "hello" && !panelOpen) setPanel(true);
      else if (message?.kind === "bye") {
        panelOpen = false;
        publishControls();
      }
    });
    function settings() {
      surface.configure({
        numbers: configuration().lineNumbers !== false,
        wrap: true,
      });
    }
    settings();
    onSettings(settings);
    // The toolbar labels, the search button and the read-only note are this plugin's own
    // text: the host shows the first two and this page shows the third.
    onLocale(() => {
      publishControls();
      if (noticeSays === "readOnly") notice.textContent = say("readOnlyNote");
    });
    publishControls();
    navigation = await synchronizePosition(
      () => surface.position(),
      (position) => surface.reveal(position),
    );
    await shortcuts([{id: "save", key: "Ctrl+S", allowInInputs: true, run: () => save()}]);
    status(data.encoding);
    await presented();
  } catch (error) {
    await presented(String(error));
  }
}
