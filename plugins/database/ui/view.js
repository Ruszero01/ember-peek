/**
 * The database's content: one object at a time, either the rows it holds or the shape it has.
 *
 * The view owns the session — it is the primary mount — so it fetches the shape and one page
 * of rows from the reader, decides what is in front of the reader, and hands the sidebar, the
 * toolbar and the information area their share. Nothing is ever loaded whole: a page of rows is
 * bounded by the setting, and the reader cuts each cell down to what a grid can show.
 */
import {
  call,
  configuration,
  controls,
  onLocale,
  onMessage,
  onSettings,
  presented,
  postTo,
  ready,
  shortcuts,
  sidebar,
  status,
  translate,
} from "./sdk.js";
import { DATABASE_TEXT } from "./text.js";
import {
  cellClass,
  cellText,
  cellTitle,
  columnType,
  describeError,
  indexColumns,
  indexOrigin,
  keyText,
  pageCount,
  rowCountText,
  statusText,
  structureText,
} from "./db-model.js";
import { mountList } from "./list.js";

const say = translate(DATABASE_TEXT);
/** Rows a page holds unless the setting says otherwise. */
const DEFAULT_PAGE_SIZE = 200;
/** How many shapes the view keeps; a session walking a large schema starts over past this. */
const SHAPES = 32;
const SIDEBAR = { side: "left", width: 240, minWidth: 160, maxWidth: 480 };

// The module resolved. The page is only usable once the host has handed it a port, so the
// bootstrap's watchdog is told about the handshake below, after `ready` resolves.
globalThis.__emberModuleLoaded?.();

const initial = await ready;
// The host answered: this page is up, and the watchdog can stop waiting for it.
globalThis.__emberBoot?.();
if (initial.role === "sidebar") mountList(initial);
else void mountView(initial);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function mountView(initial) {
  document.body.classList.add("role-view");
  const facts = initial.data ?? {};
  const objects = Array.isArray(facts.objects) ? facts.objects : [];

  const content = element("div", "content");
  content.id = "content";
  document.body.append(content);

  const shapes = new Map();
  let selected = -1;
  let shape = null;
  let pageIndex = 0;
  let page = null;
  let mode = "data";
  let pageSize = configuredPageSize();
  let listOpen = configuration().showList !== false;
  let failure = "";
  let generation = 0;

  function configuredPageSize() {
    const wanted = Math.round(Number(configuration().pageSize));
    return Number.isFinite(wanted) && wanted > 0
      ? Math.min(500, Math.max(20, wanted))
      : DEFAULT_PAGE_SIZE;
  }

  const object = () => objects[selected] ?? null;

  /** Ask the reader for one object's shape, remembering it for the pages that follow. */
  async function shapeOf(name) {
    if (shapes.has(name)) return shapes.get(name);
    const value = await call("structure", { name });
    if (shapes.size >= SHAPES) shapes.clear();
    shapes.set(name, value);
    return value;
  }

  /** Load whatever the current selection and mode need, then draw it. */
  async function load() {
    const current = object();
    const ticket = ++generation;
    if (!current) {
      render();
      publish();
      return;
    }
    try {
      shape = await shapeOf(current.name);
      if (ticket !== generation) return;
      if (mode === "data") {
        page = await call("rows", {
          name: current.name,
          offset: pageIndex * pageSize,
          count: pageSize,
        });
      }
      if (ticket !== generation) return;
      failure = "";
    } catch (error) {
      if (ticket !== generation) return;
      failure = describeError(error?.message ?? error, say);
      shape = null;
      page = null;
    }
    render();
    publish();
  }

  function select(name) {
    const index = objects.findIndex((candidate) => candidate.name === name);
    if (index < 0) return Promise.resolve();
    selected = index;
    pageIndex = 0;
    page = null;
    shape = null;
    void postTo("sidebar", { kind: "selected", name }).catch(() => {});
    return load();
  }

  function goPage(index) {
    if (mode !== "data" || index < 0 || index === pageIndex) return Promise.resolve();
    const pages = pageCount(shape?.rows, pageSize);
    if (pages !== null && index >= pages) return Promise.resolve();
    // Without a row count, the page before is the only thing that says whether a later page
    // exists; going back is always allowed, because the reader is already there.
    if (pages === null && index > pageIndex && !page?.hasMore) return Promise.resolve();
    pageIndex = index;
    return load();
  }

  async function openList() {
    listOpen = true;
    try {
      await sidebar(true, SIDEBAR);
    } catch (error) {
      status(describeError(error?.message ?? error, say));
    }
    const current = object();
    if (current) await postTo("sidebar", { kind: "selected", name: current.name }).catch(() => {});
  }

  async function toggleList() {
    if (listOpen) {
      listOpen = false;
      await sidebar(false).catch(() => {});
    } else await openList();
    publish();
  }

  function toggleStructure() {
    mode = mode === "data" ? "structure" : "data";
    if (mode === "data" && !page) {
      void load();
      return;
    }
    render();
    publish();
  }

  // ---------------------------------------------------------------- drawing

  function render() {
    content.replaceChildren();
    if (failure) {
      content.append(element("p", "failure", failure));
      return;
    }
    if (!objects.length) {
      content.append(element("p", "blank", say("empty")));
      return;
    }
    if (mode === "structure" && shape) {
      content.append(structureView(shape));
      return;
    }
    content.append(dataView());
  }

  function dataView() {
    const current = object();
    const columns = page?.columns ?? shape?.columns?.map((column) => column.name) ?? [];
    const wrap = element("div", "grid-wrap");
    const table = element("table", "grid");
    const meta = new Map((shape?.columns ?? []).map((column) => [column.name, column]));

    const head = element("thead");
    const headRow = element("tr");
    headRow.append(element("th", "index"));
    for (const name of columns) {
      const column = meta.get(name) ?? { name };
      const cell = element("th");
      cell.append(element("span", "grid-name", column.name));
      const detail = [columnType(column.type, say), keyText(column, say)].filter(Boolean).join(" · ");
      if (detail) cell.append(element("span", "grid-type", detail));
      headRow.append(cell);
    }
    head.append(headRow);
    table.append(head);

    const body = element("tbody");
    const rows = page?.rows ?? [];
    if (!rows.length) {
      const row = element("tr");
      const cell = element("td", "blank");
      cell.colSpan = columns.length + 1;
      cell.textContent = say(current?.kind === "view" ? "emptyView" : "emptyTable");
      row.append(cell);
      body.append(row);
    }
    const offset = page?.offset ?? pageIndex * pageSize;
    rows.forEach((values, index) => {
      const row = element("tr");
      row.append(element("th", "index", String(offset + index + 1)));
      values.forEach((value, column) => {
        const cell = element("td", cellClass(value), cellText(value));
        const title = cellTitle(value, say);
        if (title) cell.title = title;
        if (!columns[column]) cell.classList.add("beyond");
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    wrap.append(table);
    return wrap;
  }

  function structureView(current) {
    const wrap = element("div", "structure");

    const fields = element("dl", "ui-fields");
    pair(fields, say("rowCountLabel"), rowCountText(current.rows, say));
    pair(fields, say("columnCountLabel"), String(current.columns?.length ?? 0));
    wrap.append(fields);

    wrap.append(heading(say("columnsHeading")));
    const columns = element("table", "detail");
    columns.append(headerRow([say("columnName"), say("columnType"), say("columnNotNull"), say("columnPrimary"), say("columnDefault"), say("columnGenerated")]));
    const columnBody = element("tbody");
    for (const column of current.columns ?? []) {
      const row = element("tr");
      row.append(element("td", "name", column.name));
      row.append(element("td", "muted", columnType(column.type, say)));
      row.append(element("td", null, column.notNull ? say("yes") : say("no")));
      row.append(element("td", null, Number(column.primaryKey) > 0 ? say("yes") : say("no")));
      row.append(element("td", "mono", column.default ?? say("none")));
      row.append(element("td", null, column.generated ? say("yes") : say("no")));
      columnBody.append(row);
    }
    columns.append(columnBody);
    wrap.append(columns);

    wrap.append(heading(say("indexesHeading")));
    const indexes = current.indexes ?? [];
    if (!indexes.length) {
      wrap.append(element("p", "blank", say("noIndexes")));
    } else {
      const table = element("table", "detail");
      table.append(headerRow([say("indexName"), say("indexUnique"), say("indexOrigin"), say("indexPartial"), say("indexColumns")]));
      const indexBody = element("tbody");
      for (const index of indexes) {
        const row = element("tr");
        row.append(element("td", "name", index.name));
        row.append(element("td", null, index.unique ? say("yes") : say("no")));
        row.append(element("td", "muted", indexOrigin(index.origin, say)));
        row.append(element("td", null, index.partial ? say("yes") : say("no")));
        row.append(element("td", "mono", indexColumns(index.columns, say)));
        indexBody.append(row);
      }
      table.append(indexBody);
      wrap.append(table);
    }

    wrap.append(heading(say("createdHeading")));
    wrap.append(element("pre", "sql", current.sql ?? say("none")));
    return wrap;
  }

  function heading(text) {
    return element("h2", "heading", text);
  }

  function pair(list, label, value) {
    list.append(element("dt", null, label));
    list.append(element("dd", null, value));
  }

  function headerRow(labels) {
    const head = element("thead");
    const row = element("tr");
    for (const label of labels) row.append(element("th", null, label));
    head.append(row);
    return head;
  }

  /** Give the host toolbar, the information area and the sidebar the state they show. */
  function publish() {
    const current = object();
    const items = [
      {
        id: "list",
        kind: "toggle",
        label: say("list"),
        icon: "database",
        active: listOpen,
        run: () => void toggleList(),
      },
      {
        id: "structure",
        kind: "toggle",
        label: say("structure"),
        icon: "table-properties",
        active: mode === "structure",
        run: toggleStructure,
      },
    ];
    if (mode === "data" && current) {
      const pages = pageCount(shape?.rows, pageSize);
      items.push({
        id: "previous",
        kind: "button",
        label: say("previous"),
        icon: "chevron-left",
        run: () => void goPage(pageIndex - 1),
      });
      if (pages !== null && pages > 1) {
        items.push({
          id: "page",
          kind: "scrub",
          label: say("page"),
          value: pageIndex + 1,
          min: 1,
          max: pages,
          step: 1,
          defaultValue: 1,
          direction: "down",
          run: (value) => void goPage(Number(value) - 1),
        });
      }
      items.push({
        id: "next",
        kind: "button",
        label: say("next"),
        icon: "chevron-right",
        run: () => void goPage(pageIndex + 1),
      });
    }
    controls(items);
    if (failure) {
      status(failure);
      return;
    }
    if (!current) {
      status(say("empty"));
      return;
    }
    if (mode === "structure" && shape) {
      status(
        structureText({
          name: current.name,
          kind: current.kind,
          columns: shape.columns?.length ?? 0,
          rows: shape.rows,
          say,
        }),
      );
      return;
    }
    status(
      statusText({
        name: current.name,
        kind: current.kind,
        offset: page?.offset ?? pageIndex * pageSize,
        length: page?.rows?.length ?? 0,
        rows: shape?.rows,
        columns: shape?.columns?.length ?? 0,
        say,
      }),
    );
  }

  // ------------------------------------------------------------- lifecycle

  onMessage((message, from) => {
    if (from !== "sidebar") return;
    if (message?.kind === "select" && typeof message.name === "string") void select(message.name);
    else if (message?.kind === "hello") {
      const current = object();
      if (current) void postTo("sidebar", { kind: "selected", name: current.name }).catch(() => {});
    }
  });
  onLocale(() => {
    render();
    publish();
  });
  onSettings(() => {
    const wanted = configuration().showList !== false;
    if (wanted !== listOpen) {
      if (wanted) void openList().then(publish);
      else {
        listOpen = false;
        void sidebar(false).catch(() => {});
        publish();
      }
    }
    const size = configuredPageSize();
    if (size !== pageSize) {
      pageSize = size;
      pageIndex = 0;
      page = null;
      if (mode === "data") void load();
      else publish();
    }
  });

  if (!objects.length) {
    render();
    publish();
    await presented();
    return;
  }
  await shortcuts([
    { id: "previous", key: "Ctrl+PageUp", run: () => void goPage(pageIndex - 1) },
    { id: "next", key: "Ctrl+PageDown", run: () => void goPage(pageIndex + 1) },
  ]).catch((error) => status(describeError(error?.message ?? error, say)));

  status(say("loading"));
  await select(objects[0].name);
  if (listOpen && !failure) await openList();
  await presented(failure || null);
}
