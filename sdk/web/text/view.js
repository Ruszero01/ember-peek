import { onLocale, onTheme, translate } from "../index.js";
import { textGutter } from "../gutter.js";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Decoration,
  ViewPlugin,
  MatchDecorator,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  LanguageDescription,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { languages } from "@codemirror/language-data";

/** What a screen reader calls this surface, in the language the host is showing. */
const say = translate({
  "zh-CN": { preview: "文本预览", editor: "文本编辑" },
  en: { preview: "Text preview", editor: "Text editor" },
});
/** The attributes the surface is announced with, in the current language. */
function surfaceLabels(editable) {
  return EditorView.contentAttributes.of({
    "aria-label": editable ? say("editor") : say("preview"),
    spellcheck: "false",
  });
}

function safeInset(edge) {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        `--safe-${edge}`,
      ),
    ) || 0
  );
}

// The shared virtualized text surface owns both logical line numbers and wrapped layout.
export async function createTextView({
  parent,
  text,
  name,
  editable = false,
  highlight = true,
  wrap = true,
  numbers = true,
  onChange = () => {},
  onPosition = () => {},
}) {
  const language =
    highlight && LanguageDescription.matchFilename(languages, name);
  const support = language ? await language.load() : [];
  const writable = new Compartment(),
    // The label a screen reader announces is written once, at construction, so it is a
    // compartment like the rest: a language change has to reach text that is already up.
    labels = new Compartment(),
    gutter = new Compartment(),
    wrapping = new Compartment(),
    tabs = new Compartment(),
    searchMarks = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text.replace(/\r\n?|\n/g, "\n"),
      extensions: [
        EditorView.scrollMargins.of(() => ({
          top: safeInset("top"),
          bottom: safeInset("bottom"),
        })),
        writable.of(EditorState.readOnly.of(!editable)),
        gutter.of(textGutter(numbers)),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        tabs.of(EditorState.tabSize.of(4)),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        support,
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: "var(--accent)" },
            {
              tag: [tags.string, tags.special(tags.string)],
              color: "color-mix(in srgb, var(--text) 65%, #55a878)",
            },
            {
              tag: [tags.number, tags.bool, tags.null],
              color: "color-mix(in srgb, var(--text) 55%, #ae88c9)",
            },
            {
              tag: [tags.typeName, tags.className],
              color: "color-mix(in srgb, var(--text) 60%, #669fc2)",
            },
            {
              tag: [tags.comment, tags.meta],
              color: "var(--muted)",
              fontStyle: "italic",
            },
            { tag: tags.heading, color: "var(--accent)", fontWeight: "600" },
            {
              tag: tags.link,
              color: "var(--accent)",
              textDecoration: "underline",
            },
            { tag: tags.strong, fontWeight: "700" },
            { tag: tags.emphasis, fontStyle: "italic" },
          ]),
        ),
        searchMarks.of([]),
        labels.of(surfaceLabels(editable)),
        EditorView.theme({
          "&": {
            height: "100%",
            backgroundColor: "var(--canvas)",
            color: "var(--text)",
            fontSize: "var(--mono-size, 13px)",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily:
              'var(--font-mono, Consolas, "Microsoft YaHei UI", monospace)',
            lineHeight: "1.7",
          },
          ".cm-content": {
            padding: "var(--safe-top, 0px) 0 var(--safe-bottom, 0px)",
            caretColor: "var(--accent)",
          },
          ".cm-line": { padding: "0 24px 0 16px" },
          ".cm-gutters": {
            backgroundColor: "var(--canvas)",
            color: "var(--faint)",
            border: "none",
            paddingRight: "8px",
            minWidth: "48px",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "var(--accent-bg)",
            color: "var(--accent)",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-cursor": { borderLeftColor: "var(--accent)" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
            { backgroundColor: "var(--accent-bg)" },
          ".cm-searchMatch": {
            backgroundColor: "var(--accent-bg)",
            outline: "1px solid var(--accent)",
          },
          ".cm-searchMatch-selected": { backgroundColor: "var(--accent-bg)" },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(view.state.doc.toString());
          if (update.docChanged || update.selectionSet)
            queueMicrotask(onPosition);
        }),
        EditorView.domEventHandlers({
          scroll() {
            onPosition();
          },
        }),
      ],
    }),
  });
  onTheme(() => view.requestMeasure());
  onLocale(() =>
    view.dispatch({ effects: labels.reconfigure(surfaceLabels(editable)) }),
  );
  return {
    view,
    get text() {
      return view.state.doc.toString();
    },
    setText(value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    },
    configure({ numbers = true, wrap = true, tabSize = 4 } = {}) {
      view.dispatch({
        effects: [
          gutter.reconfigure(textGutter(numbers)),
          wrapping.reconfigure(wrap ? EditorView.lineWrapping : []),
          tabs.reconfigure(EditorState.tabSize.of(tabSize)),
        ],
      });
    },
    readOnly(value) {
      view.dispatch({
        effects: writable.reconfigure(EditorState.readOnly.of(value)),
      });
    },
    position() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      const line = view.state.doc.lineAt(
        Math.min(block.from, view.state.doc.length),
      );
      return { line: line.number, column: 0 };
    },
    reveal(position) {
      if (!Number.isSafeInteger(position?.line)) return;
      const line = view.state.doc.line(
        Math.max(1, Math.min(view.state.doc.lines, position.line)),
      );
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "start" }),
      });
    },
    select(from, to) {
      view.dispatch({
        selection: { anchor: from, head: to },
        effects: EditorView.scrollIntoView(from, { y: "center" }),
      });
    },
    search(query) {
      const escaped = Array.from(query, (char) =>
        "\\^$.*+?()[]{}|".includes(char) ? "\\" + char : char,
      ).join("");
      const extension = query
        ? ViewPlugin.fromClass(
            class {
              constructor(editor) {
                this.matcher = new MatchDecorator({
                  regexp: new RegExp(escaped, "gi"),
                  decoration: (match, editor, from) =>
                    Decoration.mark({
                      class:
                        editor.state.selection.main.from === from &&
                        editor.state.selection.main.to ===
                          from + match[0].length
                          ? "cm-searchMatch cm-searchMatch-selected"
                          : "cm-searchMatch",
                    }),
                });
                this.decorations = this.matcher.createDeco(editor);
              }
              update(update) {
                this.decorations = update.selectionSet
                  ? this.matcher.createDeco(update.view)
                  : this.matcher.updateDeco(update, this.decorations);
              }
            },
            { decorations: (plugin) => plugin.decorations },
          )
        : [];
      view.dispatch({ effects: searchMarks.reconfigure(extension) });
    },
  };
}
