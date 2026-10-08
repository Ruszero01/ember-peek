import {
  ready,
  controls,
  clipboard,
  createIcon,
  presented,
  status,
  configuration,
  onSettings,
  resourceUrl,
  openExternal,
  translate,
  onLocale,
} from "./sdk.js";
import { createTextView } from "./sdk-view.js";
import { renderMarkdown } from "./sdk-markdown.js";
import { synchronizePosition } from "./sdk-navigation.js";
/** The plugin's own wording, in the language the host is showing. */
const say = translate({
  "zh-CN": {
    outline: "大纲",
    empty: "暂无标题",
    copy: "复制 Markdown 源码",
    copyCode: "复制代码",
    copied: "已复制",
    toRendered: "显示渲染格式",
    toSource: "显示原始格式",
    truncated: " · 仅显示前 2 MiB",
    "callout.note": "提示",
    "callout.info": "信息",
    "callout.abstract": "摘要",
    "callout.todo": "待办",
    "callout.tip": "建议",
    "callout.important": "重要",
    "callout.success": "成功",
    "callout.question": "问题",
    "callout.warning": "警告",
    "callout.caution": "注意",
    "callout.failure": "失败",
    "callout.danger": "危险",
    "callout.bug": "缺陷",
    "callout.example": "示例",
    "callout.quote": "引用",
  },
  en: {
    outline: "Outline",
    empty: "No headings",
    copy: "Copy the Markdown source",
    copyCode: "Copy the code",
    copied: "Copied",
    toRendered: "Show the rendered format",
    toSource: "Show the source format",
    truncated: " · showing the first 2 MiB",
    "callout.note": "Note",
    "callout.info": "Info",
    "callout.abstract": "Abstract",
    "callout.todo": "Todo",
    "callout.tip": "Tip",
    "callout.important": "Important",
    "callout.success": "Success",
    "callout.question": "Question",
    "callout.warning": "Warning",
    "callout.caution": "Caution",
    "callout.failure": "Failure",
    "callout.danger": "Danger",
    "callout.bug": "Bug",
    "callout.example": "Example",
    "callout.quote": "Quote",
  },
});

const initial = await ready;
const data = initial.source?.data || initial.data;
const sourceRoot = document.querySelector("#source"),
  rendered = document.querySelector("#rendered"),
  outline = document.querySelector("#outline");
let navigation,
  raw = false,
  scheduled = false,
  activeHeading;
try {
  const source = await createTextView({
    parent: sourceRoot,
    text: data.text,
    name: initial.file.name,
    onPosition: changed,
  });
  /** The glyph each callout kind is drawn with. The wording comes from the interface language
   *  and the drawing from the host's icon set, so neither is this plugin's to keep in sync. */
  const calloutGlyphs = {
    note: "pencil",
    info: "info",
    abstract: "clipboard-list",
    todo: "list-todo",
    tip: "lightbulb",
    important: "flame",
    success: "circle-check",
    question: "circle-help",
    warning: "triangle-alert",
    caution: "triangle-alert",
    failure: "circle-x",
    danger: "octagon-alert",
    bug: "bug",
    example: "list",
    quote: "quote",
  };
  const icons = new Map();
  /** One request per glyph, cloned per use: a document with forty code blocks still asks the
   *  host for its copy icon once. A glyph the host cannot draw costs the icon, never the view. */
  async function glyph(name, size = 15) {
    const key = `${name}/${size}`;
    if (!icons.has(key)) icons.set(key, createIcon(name, size).catch(() => null));
    const element = await icons.get(key);
    return element ? element.cloneNode(true) : null;
  }
  /**
   * Callout quotes. The document wrote `> [!info]`, the renderer passed that on as data
   * attributes, and the drawing happens here: the title row is wording and an icon rather than
   * document content, and the fold the document asked for is a disclosure around the body it
   * wrote. The kind is the contract between the two — see `sdk/web/text/markdown.js`.
   */
  async function drawCallouts() {
    for (const quote of rendered.querySelectorAll("blockquote[data-ember-callout]")) {
      const fold = quote.dataset.emberCalloutFold || "";
      const row = document.createElement(fold ? "summary" : "div");
      row.className = "md-callout-title";
      const icon = await glyph(calloutGlyphs[quote.dataset.emberCallout] || "info");
      if (icon) row.append(icon);
      const label = document.createElement("span");
      label.className = "md-callout-label";
      row.append(label);
      if (!fold) {
        quote.prepend(row);
        continue;
      }
      const body = document.createElement("details");
      body.className = "md-callout-fold";
      body.open = fold === "+";
      body.append(row, ...quote.childNodes);
      quote.append(body);
    }
    labelCallouts();
  }
  /** A callout's wording follows the interface language, like the outline's. */
  function labelCallouts() {
    for (const quote of rendered.querySelectorAll("blockquote[data-ember-callout]")) {
      const label = quote.querySelector(".md-callout-label");
      if (!label) continue;
      const written = quote.dataset.emberCalloutTitle;
      label.textContent = written || say(`callout.${quote.dataset.emberCallout}`);
    }
  }
  /**
   * A copy button per code block. It belongs to the block it copies rather than to the host's
   * toolbar — the toolbar's copy takes the whole document, this one takes the code in front of
   * the reader — so it is drawn where the code is.
   */
  const copyButtons = [];
  const copyTimers = new Map();
  async function drawCodeBlocks() {
    const copy = await glyph("copy");
    for (const block of rendered.querySelectorAll("pre")) {
      if (block.closest(".md-code")) continue;
      const frame = document.createElement("div");
      frame.className = "md-code";
      block.replaceWith(frame);
      frame.append(block);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ui-icon-button md-copy";
      if (copy) button.append(copy.cloneNode(true));
      button.addEventListener("click", () => copyBlock(block, button));
      frame.append(button);
      copyButtons.push(button);
    }
    labelCopyButtons();
  }
  function labelCopyButtons() {
    for (const button of copyButtons) {
      const text = say(button.classList.contains("on") ? "copied" : "copyCode");
      button.setAttribute("aria-label", text);
      button.title = text;
    }
  }
  async function copyBlock(block, button) {
    try {
      await clipboard(block.textContent);
    } catch (error) {
      console.error("Copying a code block failed:", error);
      return;
    }
    const done = await glyph("check");
    const copy = await glyph("copy");
    clearTimeout(copyTimers.get(button));
    button.classList.add("on");
    if (done) button.replaceChildren(done);
    labelCopyButtons();
    copyTimers.set(
      button,
      setTimeout(() => {
        button.classList.remove("on");
        if (copy) button.replaceChildren(copy);
        labelCopyButtons();
      }, 1200),
    );
  }
  const output = renderMarkdown(source.text);
  rendered.innerHTML = output.html;
  for (const image of rendered.querySelectorAll("img")) {
    // A Markdown image was parked on a placeholder so nothing is requested before the host
    // resolves it; a document's own `<img>` still carries its reference in `src`. Both go
    // through the same session resource, which is what makes a relative path, an absolute path
    // and a public HTTP(S) URL behave alike — and what draws an SVG as the picture it is.
    const reference = image.dataset.emberResource || image.getAttribute("src") || "";
    if (!reference) continue;
    try {
      image.addEventListener(
        "error",
        () => image.replaceWith(document.createTextNode(image.alt || reference)),
        { once: true },
      );
      image.src = resourceUrl(reference);
      image.removeAttribute("data-ember-resource");
    } catch (error) {
      image.replaceWith(document.createTextNode(image.alt || String(error)));
    }
  }
  await Promise.all([drawCallouts(), drawCodeBlocks()]);
  const nodes = [...rendered.querySelectorAll("[data-line]")];
  // The outline is this plugin's own surface, so its name is in the interface language.
  // The heading and the empty note are this plugin's own words and are refreshed below
  // when the language changes; the entry text comes from the document itself.
  const title = document.createElement("h2");
  let emptyNote = null;
  function labelOutline() {
    outline.setAttribute("aria-label", say("outline"));
    title.textContent = say("outline");
    if (emptyNote) emptyNote.textContent = say("empty");
  }
  labelOutline();
  outline.append(title);
  const buttons = output.headings.map((heading) => {
    const button = document.createElement("button");
    button.textContent = heading.title;
    button.title = heading.title;
    button.style.paddingLeft = `${8 + (heading.level - 1) * 10}px`;
    button.onclick = () => {
      reveal({ line: heading.line });
      navigation?.changed();
      updateOutline(heading.line);
    };
    outline.append(button);
    return button;
  });
  if (!buttons.length) {
    emptyNote = document.createElement("p");
    emptyNote.textContent = say("empty");
    outline.append(emptyNote);
  }
  let measured = [];
  function measure() {
    if (raw) return;
    const top = rendered.getBoundingClientRect().top;
    measured = nodes.map((node) => ({
      line: Number(node.dataset.line),
      top: node.getBoundingClientRect().top - top + rendered.scrollTop,
    }));
  }
  new ResizeObserver(() => {
    measure();
    changed();
  }).observe(rendered);
  function renderedLine() {
    const top =
      rendered.scrollTop +
      parseFloat(getComputedStyle(rendered).paddingTop) +
      4;
    let low = 0,
      high = measured.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (measured[middle].top <= top) low = middle + 1;
      else high = middle;
    }
    return low ? measured[low - 1].line : 1;
  }
  function position() {
    return raw ? source.position() : { line: renderedLine(), column: 0 };
  }
  /** Put an element at the top of the viewport, inside the padding the document sits in. */
  function scrollTo(node) {
    rendered.scrollTop +=
      node.getBoundingClientRect().top -
      rendered.getBoundingClientRect().top -
      parseFloat(getComputedStyle(rendered).paddingTop);
  }
  /**
   * Jump to what a link named. The name is the id the renderer gave the heading, which is what
   * the document itself wrote — `[start](#getting-started)` — so the scan is over ids rather than
   * a selector, and a name that matches nothing leaves the reading position alone.
   */
  function jump(fragment) {
    let name = fragment;
    try {
      name = decodeURIComponent(fragment);
    } catch {
      // A fragment need not be percent-encoded; what did not decode is used as written.
    }
    const target = name
      ? [...rendered.querySelectorAll("[id]")].find((node) => node.id === name)
      : null;
    if (target) scrollTo(target);
    changed();
  }
  function reveal(value) {
    if (raw) source.reveal(value);
    else {
      let target = nodes[0];
      for (const node of nodes) {
        if (Number(node.dataset.line) <= value.line) target = node;
        else break;
      }
      if (target) scrollTo(target);
    }
    updateOutline(value.line);
  }
  function updateOutline(line) {
    let low = 0,
      high = output.headings.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (output.headings[middle].line <= line) low = middle + 1;
      else high = middle;
    }
    const index = low - 1;
    if (index === activeHeading) return;
    if (buttons[activeHeading]) {
      buttons[activeHeading].classList.remove("active");
      buttons[activeHeading].removeAttribute("aria-current");
    }
    if (buttons[index]) {
      const button = buttons[index];
      button.classList.add("active");
      button.setAttribute("aria-current", "true");
      if (
        button.offsetTop < outline.scrollTop ||
        button.offsetTop + button.offsetHeight >
          outline.scrollTop + outline.clientHeight
      )
        outline.scrollTop = button.offsetTop - outline.clientHeight / 2;
    }
    activeHeading = index;
  }
  function changed() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      navigation?.changed();
      updateOutline(position().line);
    });
  }
  function publish() {
    controls([
      {
        id: "copy",
        kind: "button",
        label: say("copy"),
        icon: "copy",
        run: () => clipboard(source.text),
      },
      {
        id: "source",
        kind: "toggle",
        label: raw ? say("toRendered") : say("toSource"),
        icon: "code",
        active: raw,
        run() {
          const anchor = position();
          raw = !raw;
          sourceRoot.hidden = !raw;
          rendered.hidden = raw;
          source.view.requestMeasure();
          requestAnimationFrame(() => {
            measure();
            reveal(anchor);
          });
          publish();
        },
      },
    ]);
  }
  rendered.addEventListener("scroll", changed, { passive: true });
  // A link is a way out of the document, and this page is sandboxed: it can neither navigate nor
  // open anything by itself. So the click is judged where the document was read — a fragment jumps
  // inside the document, a web or mail address goes to the host, which hands it to the system — and
  // anything else, such as a relative path, stays inert rather than becoming a request nobody
  // asked for. The host decides what may be opened; this only decides what is a link at all.
  rendered.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    const href = (link.getAttribute("href") || "").trim();
    if (href.startsWith("#")) {
      jump(href.slice(1));
      return;
    }
    if (/^(https?|mailto):/i.test(href))
      openExternal(href).catch((error) =>
        console.error("Opening a link failed:", error),
      );
  });
  function settings() {
    source.configure({
      numbers: configuration().lineNumbers !== false,
      wrap: configuration().wrap !== false,
    });
  }
  settings();
  onSettings(settings);
  publish();
  onLocale(() => {
    labelOutline();
    labelCallouts();
    labelCopyButtons();
    publish();
    publishStatus();
  });
  measure();
  navigation = await synchronizePosition(position, reveal);
  updateOutline(position().line);
  const publishStatus = () =>
    status(`${data.encoding}${data.truncated ? say("truncated") : ""}`);
  publishStatus();
  await presented();
} catch (error) {
  await presented(String(error));
}
