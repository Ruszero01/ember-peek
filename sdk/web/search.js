// Shared plugin-side UI, copied into each package next to sdk.js, which is where the
// interface language and the translator come from.
//
// The host has no search component: a plugin that wants search opens its own floating panel
// and mounts this bar inside it. Sharing one implementation is what keeps every plugin's
// search identical in look and behaviour without the host knowing what search is.

import { translate } from "./sdk.js";

/** The bar's own wording, in the language the host is showing. */
const say = translate({
  "zh-CN": {
    placeholder: "搜索文本",
    previous: "上一个匹配",
    next: "下一个匹配",
    close: "关闭搜索",
  },
  en: {
    placeholder: "Search text",
    previous: "Previous match",
    next: "Next match",
    close: "Close search",
  },
});

const icons = {
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>`,
  previous: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>`,
  next: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>`,
};

/** Every occurrence of `query` in `text`, as [start, end) offsets, case-insensitive. */
export function findOccurrences(text, query, limit = 20000) {
  const needle = String(query ?? "").toLowerCase();
  if (!needle) return [];
  const haystack = text.toLowerCase();
  const found = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    found.push({ start: at, end: at + needle.length });
    if (found.length >= limit) break;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

function button(label, icon, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.innerHTML = icons[icon];
  element.addEventListener("click", handler);
  return element;
}

/**
 * Fill `root` with the shared search bar and wire the keyboard. The caller owns the
 * matching: it receives the query and the step, and reports progress back through
 * setStatus so the count stays next to the field.
 *
 *   const bar = mountSearchBar({
 *     root: document.querySelector("#search"),
 *     onQuery: (value) => send({kind: "query", value}),
 *     onStep: (direction) => send({kind: "step", value: direction}),
 *     onClose: () => panel(false),
 *   });
 *   bar.setStatus({query, count, index});
 */
export function mountSearchBar({
  root,
  placeholder = say("placeholder"),
  onQuery,
  onStep,
  onClose,
}) {
  // A panel document paints over the host's card unless it stays transparent.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  root.hidden = false;
  root.className = "search-bar";
  const icon = document.createElement("span");
  icon.className = "search-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = icons.search;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", placeholder);
  const count = document.createElement("span");
  count.className = "search-count";
  count.setAttribute("aria-live", "polite");
  input.addEventListener("input", () => onQuery?.(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onStep?.(event.shiftKey ? "previous" : "next");
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  });
  root.replaceChildren(
    icon,
    input,
    count,
    button(say("previous"), "previous", () => onStep?.("previous")),
    button(say("next"), "next", () => onStep?.("next")),
    button(say("close"), "close", () => onClose?.()),
  );
  let filled = false;
  return {
    focus: () => input.focus(),
    /** `index` is zero-based; the bar shows it one-based like every editor does. */
    setStatus({ query = "", count: total = 0, index = 0 } = {}) {
      if (!filled) {
        filled = true;
        input.value = query;
      }
      if (!query) count.textContent = "";
      else count.textContent = total ? `${index + 1}/${total}` : "0/0";
    },
  };
}
