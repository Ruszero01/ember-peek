import {
  ready,
  controls,
  clipboard,
  presented,
  status,
  configuration,
  onSettings,
} from "./sdk.js";
import { createTextView } from "./sdk-view.js";
import { renderMarkdown } from "./sdk-markdown.js";
import { synchronizePosition } from "./sdk-navigation.js";
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
  const output = renderMarkdown(source.text);
  rendered.innerHTML = output.html;
  const nodes = [...rendered.querySelectorAll("[data-line]")];
  const title = document.createElement("h2");
  title.textContent = "大纲";
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
    const empty = document.createElement("p");
    empty.textContent = "暂无标题";
    outline.append(empty);
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
  function reveal(value) {
    if (raw) source.reveal(value);
    else {
      let target = nodes[0];
      for (const node of nodes) {
        if (Number(node.dataset.line) <= value.line) target = node;
        else break;
      }
      if (target)
        rendered.scrollTop +=
          target.getBoundingClientRect().top -
          rendered.getBoundingClientRect().top -
          parseFloat(getComputedStyle(rendered).paddingTop);
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
        label: "复制 Markdown 源码",
        icon: "copy",
        run: () => clipboard(source.text),
      },
      {
        id: "source",
        kind: "toggle",
        label: raw ? "显示渲染格式" : "显示原始格式",
        icon: "file-text",
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
  rendered.addEventListener("click", (event) => {
    if (event.target.closest("a")) event.preventDefault();
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
  measure();
  navigation = await synchronizePosition(position, reveal);
  updateOutline(position().line);
  status(`${data.encoding}${data.truncated ? " · 仅显示前 2 MiB" : ""}`);
  await presented();
} catch (error) {
  await presented(String(error));
}
