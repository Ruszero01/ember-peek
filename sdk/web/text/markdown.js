import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { translate } from "../index.js";

/** Text the renderer supplies for a document that has none of its own. */
const say = translate({
  "zh-CN": { image: "图片", untitled: "无标题" },
  en: { image: "Image", untitled: "Untitled" },
});

/**
 * What a document's own HTML may contain.
 *
 * A README lays itself out with a little HTML — boxes, alignment, images — and a preview that
 * escapes all of it shows the markup instead of the page. This list is therefore the tags
 * Markdown itself produces plus the layout and image tags such a document needs, and nothing
 * that runs, loads or submits on its own: no script, frame, style, media or form control. The
 * sanitizer runs with exactly this list, so the boundary is stated here rather than inherited
 * from a library's defaults, and `tests/markdown.test.mjs` fails if a tag that can execute or
 * fetch by itself is ever added to it.
 */
export const documentHtml = Object.freeze({
  tags: [
    "a", "abbr", "b", "blockquote", "br", "caption", "center", "cite", "code", "dd", "del",
    "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
    "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "samp", "small", "span",
    "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u",
    "ul", "var", "wbr",
  ],
  attributes: [
    "align", "alt", "class", "colspan", "dir", "height", "href", "id", "lang", "rowspan", "src",
    "start", "title", "width",
  ],
});

/** A callout marker: `[!info]`, an optional fold sign, an optional title — Obsidian's syntax. */
const calloutMarker = /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-]?)[ \t]*(.*)$/;

/**
 * The callout types Obsidian names, folded onto the kinds this preview draws. Those kinds are
 * the contract with the view, which owns a glyph and a wording for each of them. A type that is
 * not in this table is drawn as a note but keeps the document's own word as its title, so an
 * unfamiliar flavour still reads as something rather than as a bare box.
 */
const calloutKinds = {
  note: "note", abstract: "abstract", summary: "abstract", tldr: "abstract", info: "info",
  todo: "todo", tip: "tip", hint: "tip", important: "important", success: "success",
  check: "success", done: "success", question: "question", help: "question", faq: "question",
  warning: "warning", attention: "warning", caution: "caution", failure: "failure",
  fail: "failure", missing: "failure", danger: "danger", error: "danger", bug: "bug",
  example: "example", quote: "quote", cite: "quote",
};

/**
 * Turn a quote whose first line is a callout marker into a callout: the marker says which kind it
 * is and whether it starts folded, and stops being body text. Running before inline parsing is
 * what lets the body be read as Markdown again — the marker line is taken out of the content the
 * inline rule has not seen yet.
 */
function calloutQuotes(markdown) {
  markdown.core.ruler.after("block", "ember-callout", (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].type !== "blockquote_open") continue;
      const paragraph = tokens[index + 1];
      const line = tokens[index + 2];
      if (paragraph?.type !== "paragraph_open" || line?.type !== "inline") continue;
      const end = line.content.indexOf("\n");
      const head = end === -1 ? line.content : line.content.slice(0, end);
      const marker = calloutMarker.exec(head);
      if (!marker) continue;
      const [, written, fold, title] = marker;
      const known = calloutKinds[written.toLowerCase()];
      const quote = tokens[index];
      quote.attrSet("class", "md-callout");
      quote.attrSet("data-ember-callout", known || "note");
      if (title) quote.attrSet("data-ember-callout-title", title);
      else if (!known) quote.attrSet("data-ember-callout-title", written);
      if (fold) quote.attrSet("data-ember-callout-fold", fold);
      const body = end === -1 ? "" : line.content.slice(end + 1);
      // A marker line that carried the whole quote leaves nothing behind for the body to be.
      if (!body.trim()) tokens.splice(index + 1, 3);
      else {
        line.content = body;
        // What is left sits a line further down, and that is where a scroll position pointing at
        // this paragraph has to land.
        if (Array.isArray(line.map) && Array.isArray(paragraph.map)) {
          line.map = [line.map[0] + 1, line.map[1]];
          paragraph.map = [paragraph.map[0] + 1, paragraph.map[1]];
        }
      }
    }
  });
}

// `html: true` because a document may lay itself out, and what it may then contain is the
// allowlist above, which the sanitizer enforces. Linkifying and typographic replacement stay
// off: guessing at a bare word or reshaping a quotation changes what the document said.
const parser = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
});
parser.use(calloutQuotes);

/**
 * Where an image reference waits until the view has resolved it through the host, so that the
 * page asks for nothing on its own: an image naming the network would otherwise be fetched
 * directly, past the host's permission, size and private-network checks, and a relative path
 * would be read from the plugin package instead of from the document.
 */
const pendingImage = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

/**
 * Take the reference off an image's `src` and park it where the view reads it.
 *
 * A Markdown image is parked while the rules render it; one the document wrote as HTML only
 * becomes an element once its markup has been parsed, which is what cleaning does — so cleaning
 * calls this for every image. The placeholder marks an image that is parked already, and parking
 * that one again would file the placeholder as its reference.
 */
export function parkImage(node) {
  if (node.tagName !== "IMG") return;
  const source = node.getAttribute("src");
  if (!source || source === pendingImage) return;
  node.setAttribute("data-ember-resource", source);
  node.setAttribute("src", pendingImage);
}

// Keep the document reference as inert data. The view resolves it through the host only
// after sanitization, so Markdown cannot smuggle script/navigation attributes into the DOM.
parser.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const reference = token.attrGet("src") || "";
  token.attrSet("src", pendingImage);
  token.attrSet("data-ember-resource", reference);
  token.attrSet("alt", token.content || say("image"));
  return renderer.renderToken(tokens, index, options);
};
// The hook belongs to the sanitizer, which only exists where there is a DOM to clean into —
// without one `DOMPurify` is the factory that makes sanitizers, not one of them, and cleaning
// could not run there either.
if (DOMPurify.isSupported) DOMPurify.addHook("afterSanitizeAttributes", parkImage);
/**
 * The name a heading answers to. A document links to its own headings — `[start](#getting-started)`
 * — and GitHub and Obsidian both spell that name out of the heading's own words: lowercased, with
 * the punctuation dropped and the spaces turned into hyphens. A name already in use takes a
 * number, so one link still lands on one heading, and a heading with nothing nameable in it falls
 * back to its place in the document.
 */
function headingId(title, index, used) {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  if (!base) return `heading-${index}`;
  let id = base;
  for (let suffix = 1; used.has(id); suffix++) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

/**
 * The document as the rules render it, before it is cleaned. Separate from `renderMarkdown`
 * because cleaning needs a browser and the rules are worth exercising without one.
 */
export function renderDocument(text) {
  const tokens = parser.parse(text, {});
  const headings = [];
  const used = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.map && token.nesting !== -1)
      token.attrSet("data-line", String(token.map[0] + 1));
    if (token.type === "heading_open") {
      const id = headingId(tokens[i + 1]?.content || "", headings.length, used);
      token.attrSet("id", id);
      headings.push({
        id,
        level: Number(token.tag.slice(1)),
        line: token.map[0] + 1,
        title: tokens[i + 1]?.content || say("untitled"),
      });
    }
  }
  return { html: parser.renderer.render(tokens, parser.options, {}), headings };
}

/** The HTML a view may put in its page: the document, cleaned against the allowlist above. */
export function renderMarkdown(text) {
  const rendered = renderDocument(text);
  return {
    ...rendered,
    html: DOMPurify.sanitize(rendered.html, {
      ALLOWED_TAGS: [...documentHtml.tags],
      ALLOWED_ATTR: [...documentHtml.attributes],
      // How the view finds the pieces it finishes drawing: the image references it resolves
      // through the host, and the callouts it gives a title row.
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
    }),
  };
}
