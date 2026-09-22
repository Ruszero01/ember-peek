import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { translate } from "../index.js";

/** Text the renderer supplies for a document that has none of its own. */
const say = translate({
  "zh-CN": { image: "图片", untitled: "无标题" },
  en: { image: "Image", untitled: "Untitled" },
});
const parser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});
// Keep the document reference as inert data. The view resolves it through the host only
// after sanitization, so Markdown cannot smuggle script/navigation attributes into the DOM.
parser.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const reference = token.attrGet("src") || "";
  token.attrSet("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
  token.attrSet("data-ember-resource", reference);
  token.attrSet("alt", token.content || say("image"));
  return renderer.renderToken(tokens, index, options);
};
export function renderMarkdown(text) {
  const tokens = parser.parse(text, {});
  const headings = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.map && token.nesting !== -1)
      token.attrSet("data-line", String(token.map[0] + 1));
    if (token.type === "heading_open") {
      const id = `heading-${headings.length}`;
      token.attrSet("id", id);
      headings.push({
        id,
        level: Number(token.tag.slice(1)),
        line: token.map[0] + 1,
        title: tokens[i + 1]?.content || say("untitled"),
      });
    }
  }
  return {
    html: DOMPurify.sanitize(
      parser.renderer.render(tokens, parser.options, {}),
    ),
    headings,
  };
}
