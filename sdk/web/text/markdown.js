import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
const parser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});
// Files cannot inject scripts, navigation or network fetches into the preview.
parser.renderer.rules.image = (tokens, index) =>
  parser.utils.escapeHtml(tokens[index].content || "图片");
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
        title: tokens[i + 1]?.content || "无标题",
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
