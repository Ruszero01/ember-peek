/**
 * The sidebar: the tables and views this database holds.
 *
 * It is a peer of the view rather than part of it — the host mounts the same page twice and
 * carries opaque payloads between the two documents — so it reads the file's own facts out of
 * its `ready` payload, keeps its filter to itself, and asks the view to change the selection
 * rather than doing it. The list is at most a few thousand buttons, so it is drawn in full and
 * never virtualised; what is filtered out is not drawn at all.
 */
import { onLocale, onMessage, postTo, ready, translate } from "./sdk.js";
import { DATABASE_TEXT } from "./text.js";
import { factsText, matchesFilter, objectSummary } from "./db-model.js";

const say = translate(DATABASE_TEXT);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountList(initial) {
  document.body.classList.add("role-list");
  const facts = initial.data ?? {};
  const objects = Array.isArray(facts.objects) ? facts.objects : [];
  let selected = null;
  let query = "";

  const head = element("div", "list-head");
  const factsLine = element("p", "list-facts", factsText(facts, say));
  const counts = element("p", "list-counts", objectSummary(facts, say));
  head.append(factsLine, counts);

  const filter = element("input", "ui-input");
  filter.type = "search";
  filter.spellcheck = false;
  filter.placeholder = say("filterPlaceholder");
  filter.setAttribute("aria-label", say("filterPlaceholder"));
  filter.addEventListener("input", () => {
    query = filter.value;
    render();
  });
  head.append(filter);

  const list = element("div", "list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", say("list"));

  document.body.append(head, list);

  function visible() {
    return objects.filter((object) => matchesFilter(object.name, query));
  }

  function choose(name) {
    selected = name;
    mark();
    void postTo("view", { kind: "select", name }).catch(() => {});
  }

  function mark() {
    let current = null;
    for (const node of list.children) {
      const on = node.dataset.name === selected;
      node.classList.toggle("on", on);
      node.setAttribute("aria-selected", on ? "true" : "false");
      if (on) current = node;
    }
    current?.scrollIntoView({ block: "nearest" });
  }

  function render() {
    const rows = visible();
    const fragment = document.createDocumentFragment();
    for (const object of rows) {
      const node = element("button", "list-row");
      node.type = "button";
      node.dataset.name = object.name;
      node.setAttribute("role", "option");
      node.append(element("span", "list-name", object.name));
      node.append(element("span", "list-kind", say(object.kind === "view" ? "view" : "table")));
      node.addEventListener("click", () => choose(object.name));
      fragment.append(node);
    }
    if (!rows.length) fragment.append(element("p", "list-empty", say("noMatch")));
    list.replaceChildren(fragment);
    mark();
  }

  // Arrow keys move the selection the way a list is expected to, without the list having to
  // take focus away from the filter box.
  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = visible();
    if (!rows.length) return;
    event.preventDefault();
    const at = rows.findIndex((object) => object.name === selected);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = at === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step));
    choose(rows[next].name);
    list.children[next]?.focus();
  });

  onMessage((message, from) => {
    if (from !== "view" || message?.kind !== "selected" || typeof message.name !== "string") return;
    selected = message.name;
    mark();
  });
  onLocale(() => {
    filter.placeholder = say("filterPlaceholder");
    filter.setAttribute("aria-label", say("filterPlaceholder"));
    list.setAttribute("aria-label", say("list"));
    factsLine.textContent = factsText(facts, say);
    counts.textContent = objectSummary(facts, say);
    render();
  });

  render();
  // The view holds the selection; ask it which object is in front of the reader right now.
  void postTo("view", { kind: "hello" }).catch(() => {});
}
