// Markdown 渲染的契约测试。渲染规则与「清理后交给视口的 HTML」是两步，这里钉住第一步：提示块的
// 标记要变成数据属性而不是正文、文档自带的 HTML 与图片引用要留在结果里、图片引用要以宿主能解析的
// 形式交出去（Markdown 图片与文档自带的 `<img>` 都要先摘下）、白名单里不得出现会执行或自行联网
// 的标签。清理本身（DOMPurify）需要浏览器，只能在 `docs/testing.md` 的手动验收里走一遍。
import { test } from "node:test";
import assert from "node:assert/strict";

// The SDK page is written for a browser and asks for one as soon as it is imported.
globalThis.addEventListener = () => {};
globalThis.window = { addEventListener: () => {} };
const { renderDocument, documentHtml, parkImage } = await import(
  "../sdk/web/text/markdown.js"
);

test("a callout marker becomes the quote's kind instead of its text", () => {
  const { html } = renderDocument("> [!info] 全局变量\n> 在函数外定义\n");
  assert.match(html, /<blockquote[^>]*class="md-callout"[^>]*data-ember-callout="info"/);
  assert.match(html, /data-ember-callout-title="全局变量"/);
  assert.doesNotMatch(html, /\[!info\]/);
  // The body is anchored where it really is: the marker line is gone, so the text sits one
  // line further down.
  assert.match(html, /<p data-line="2">在函数外定义<\/p>/);
});

test("a callout the document left untitled names itself later", () => {
  const bare = renderDocument("> [!info]\n> body\n").html;
  assert.match(bare, /data-ember-callout="info"/);
  // The name is wording, so it comes from the view in the interface language.
  assert.doesNotMatch(bare, /data-ember-callout-title/);
  // A marker line that carried the whole quote leaves an empty quote, not an empty paragraph.
  const empty = renderDocument("> [!tip] 试试这样\n").html;
  assert.match(empty, /data-ember-callout="tip"/);
  assert.match(empty, /data-ember-callout-title="试试这样"/);
  assert.doesNotMatch(empty, /<p[\s>]/);
});

test("an unfamiliar callout type keeps the word the document used", () => {
  const { html } = renderDocument("> [!notice]\n> body\n");
  assert.match(html, /data-ember-callout="note"/);
  assert.match(html, /data-ember-callout-title="notice"/);
});

test("the fold sign is handed to the view rather than folded here", () => {
  const collapsed = renderDocument("> [!warning]- 注意\n> 正文\n").html;
  assert.match(collapsed, /data-ember-callout="warning"/);
  assert.match(collapsed, /data-ember-callout-fold="-"/);
  assert.match(collapsed, /<p[^>]*>正文<\/p>/);
  assert.match(
    renderDocument("> [!warning]+ 注意\n> 正文\n").html,
    /data-ember-callout-fold="\+"/,
  );
});

test("text that only looks like a callout stays text", () => {
  // A fenced block is code, and a quote's marker only counts on its first line.
  assert.doesNotMatch(
    renderDocument("```\n> [!info] not a callout\n```\n").html,
    /md-callout/,
  );
  assert.doesNotMatch(
    renderDocument("> see [!info] inline\n").html,
    /md-callout/,
  );
});

test("every image reference is parked for the host to resolve", () => {
  const markdown = renderDocument("![Logo](assets/brand/mark.svg)\n").html;
  assert.match(markdown, /data-ember-resource="assets\/brand\/mark\.svg"/);
  // Nothing is requested before the host answers: the reference replaces the source it came
  // from, and the view resolves the two the same way.
  assert.match(markdown, /src="data:image\/gif/);
  assert.match(
    renderDocument('<img src="assets/brand/mark.svg" width="88" alt="Logo" />\n').html,
    /<img[^>]*src="assets\/brand\/mark\.svg"[^>]*width="88"/,
  );
});

test("文档自带的图片也要在页面能请求之前摘下引用", () => {
  // 规则给 Markdown 图片占位的那个地址就是清理阶段要认出来的标记：认不出来就会把占位地址
  // 当成引用，于是真正的引用反而丢了。
  const placeholder = /src="([^"]+)"/.exec(
    renderDocument("![Logo](assets/brand/mark.svg)\n").html,
  )[1];
  const image = (attributes) => ({
    tagName: "IMG",
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
  });
  const written = image({ src: "assets/brand/mark.svg", width: "88" });
  parkImage(written);
  assert.equal(written.getAttribute("src"), placeholder);
  assert.equal(written.getAttribute("data-ember-resource"), "assets/brand/mark.svg");
  // 已经摘下过的图片不再摘一次，否则引用会被占位地址盖掉。
  const parked = image({ src: placeholder, "data-ember-resource": "assets/brand/mark.svg" });
  parkImage(parked);
  assert.equal(parked.getAttribute("data-ember-resource"), "assets/brand/mark.svg");
  // 没有指任何东西的图片不是引用，不该被派去请求。
  const bare = image({ alt: "Logo" });
  parkImage(bare);
  assert.equal(bare.getAttribute("src"), null);
  parkImage({
    tagName: "DIV",
    getAttribute: () => "assets/a.svg",
    setAttribute: () => assert.fail("只有图片带引用"),
  });
});

test("a document may lay itself out, in a list that cannot run or fetch on its own", () => {
  const { html } = renderDocument(
    '<div align="center">\n  <img src="assets/brand/mark.svg" alt="Logo" />\n\n  # Title\n</div>\n',
  );
  assert.match(html, /<div align="center">/);
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  for (const tag of [
    "script", "iframe", "object", "embed", "style", "link", "meta", "base",
    "form", "input", "button", "video", "audio", "source", "picture",
  ])
    assert.ok(
      !documentHtml.tags.includes(tag),
      `${tag} would run, load or submit on its own`,
    );
  // What the view finishes drawing is data attributes on elements the list does allow.
  assert.ok(documentHtml.attributes.includes("src"));
  assert.ok(documentHtml.attributes.includes("align"));
});

test("标题的 id 就是文档自己写的那个链接要跳的名字", () => {
  const { html, headings } = renderDocument(
    "## Installation and use\n\n### 安装与使用\n\n## Installation and use\n\n## ！？\n",
  );
  // GitHub 与 Obsidian 是同一套拼法：小写、去标点、空格换连字符，中文原样留着。
  assert.match(html, /id="installation-and-use"/);
  assert.match(html, /id="安装与使用"/);
  // 重名各占一个锚点，链接才会落在确定的那一个上；没有可命名的字就退回它在文中的位置。
  assert.deepEqual(
    headings.map((heading) => heading.id),
    ["installation-and-use", "安装与使用", "installation-and-use-1", "heading-3"],
  );
});
