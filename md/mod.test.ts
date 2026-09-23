import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import ts from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";
import { markdownToHast } from "./mod.ts";

async function render(
  markdown: string,
  options?: Parameters<typeof markdownToHast>[1],
): Promise<string> {
  const hast = await markdownToHast(markdown, options);
  return toHtml(hast);
}

Deno.test("markdownToHast: renders basic markdown", async () => {
  const html = await render("# Hello\n\nSome **bold** text.");
  assertStringIncludes(
    html,
    '<h1 id="hello-"><a href="#hello-">Hello</a></h1>',
  );
  assertStringIncludes(html, "<strong>bold</strong>");
});

Deno.test("markdownToHast: renders GFM tables", async () => {
  const html = await render("| a | b |\n| - | - |\n| 1 | 2 |\n");
  assertStringIncludes(html, "<table>");
});

Deno.test("markdownToHast: strips <script> tags entirely", async () => {
  const html = await render("Hello <script>alert(1)</script> world");
  assert(!html.includes("<script"));
  assert(!/alert\(1\)/.test(html) || !html.includes("<script"));
});

Deno.test("markdownToHast: strips inline event handlers", async () => {
  const html = await render('<img src="x" onerror="alert(1)">');
  assert(!html.includes("onerror"));
});

Deno.test("markdownToHast: strips javascript: URLs from links", async () => {
  const html = await render("[click me](javascript:alert(1))");
  assert(!html.includes("javascript:"));
});

Deno.test("markdownToHast: keeps safe http(s) links", async () => {
  const html = await render("[example](https://example.com)");
  assertStringIncludes(html, 'href="https://example.com"');
});

Deno.test("markdownToHast: renders a mermaid code block as sanitized SVG", async () => {
  const html = await render(
    "```mermaid\ngraph TD\nA[Start] --> B[End]\n```\n",
  );
  assertStringIncludes(html, '<div class="mermaid-diagram">');
  assertStringIncludes(html, "<svg");
  assert(!html.includes("<script"));
});

Deno.test("markdownToHast: mermaid diagrams escape malicious node labels", async () => {
  const html = await render(
    '```mermaid\ngraph TD\nA["<img src=x onerror=alert(1)>"] --> B\n```\n',
  );
  // The label text is rendered as inert SVG <text> content: the literal
  // words may appear, but never as an actual, parseable <img ...> tag.
  assert(!/<img[\s>]/.test(html));
});

Deno.test("markdownToHast: highlights other fenced code blocks with Shiki", async () => {
  const html = await render("```ts\nconst x: number = 1;\n```\n");
  assertStringIncludes(html, "shiki");
  assertStringIncludes(html, "<span");
});

Deno.test("markdownToHast: falls back gracefully for unknown languages", async () => {
  const html = await render("```not-a-real-language\nhello\n```\n");
  assertStringIncludes(html, "hello");
});

Deno.test("markdownToHast: does not leak a remote font @import", async () => {
  const html = await render("```mermaid\ngraph TD\nA-->B\n```\n");
  assertEquals(html.includes("fonts.googleapis.com"), false);
});

Deno.test("markdownToHast: runs a custom mdast transformer", async () => {
  const hast = await markdownToHast("# Hello\n\nWorld", {
    mdastTransform: (tree) => {
      visit(tree, "heading", (node) => {
        node.depth = 2;
      });
    },
  });
  assertStringIncludes(
    toHtml(hast),
    '<h2 id="hello-"><a href="#hello-">Hello</a></h2>',
  );
});

Deno.test("markdownToHast: heading ids are deduplicated", async () => {
  const html = await render("# Hello\n\n# Hello\n");
  assertStringIncludes(html, 'id="hello-"');
  assertStringIncludes(html, 'id="hello-1"');
});

Deno.test("markdownToHast: {#custom-id} overrides the heading slug", async () => {
  const html = await render("## Install **now** {#setup}\n");
  assertStringIncludes(
    html,
    '<h2 id="setup-"><a href="#setup-">Install <strong>now</strong></a></h2>',
  );
});

Deno.test("markdownToHast: an invalid {#...} marker stays as text", async () => {
  const html = await render("## Bad {#no spaces}\n");
  assertStringIncludes(html, 'id="bad-no-spaces"');
  assertStringIncludes(html, "Bad {#no spaces}");
});

Deno.test("markdownToHast: only ids without a hyphen get one appended", async () => {
  const html = await render("## Getting Started\n\n## インストール\n");
  assertStringIncludes(html, 'id="getting-started"');
  assertStringIncludes(html, 'id="インストール-"');
});

Deno.test("markdownToHast: links to renamed ids follow them, others are left alone", async () => {
  const html = await render(
    "## Install {#setup}\n\n## インストール\n\n" +
      "[in](#setup) [jp](#インストール) [top](#top) [out](https://example.com/#setup)\n",
  );
  assertStringIncludes(html, '<a href="#setup-">in</a>');
  assertStringIncludes(html, '<a href="#インストール-">jp</a>');
  assertStringIncludes(html, '<a href="#top">top</a>');
  assertStringIncludes(html, '<a href="https://example.com/#setup">out</a>');
});

Deno.test("markdownToHast: mermaid's own SVG ids are left alone", async () => {
  const html = await render("```mermaid\ngraph TD\nA-->B\n```\n");
  assertStringIncludes(html, 'id="arrowhead"');
});

Deno.test("markdownToHast: footnote links point at their targets", async () => {
  const html = await render("Text[^1]\n\n[^1]: Note\n");
  assertStringIncludes(html, 'href="#fn-1" id="fnref-1"');
  assertStringIncludes(html, '<li id="fn-1">');
  assertStringIncludes(html, 'href="#fnref-1"');
});

Deno.test("rehypeShiki: a core highlighter replaces the bundled one", async () => {
  // The point of this test is the type as much as the behavior: a real
  // `HighlighterCore` has to satisfy `ShikiHighlighter`, or the option is
  // useless. It carries TypeScript and nothing else, so `json` comes back
  // through the plain-text fallback — Shiki markup, but no per-token colors.
  const highlighter = await createHighlighterCore({
    langs: [ts],
    themes: [githubDark],
    engine: createJavaScriptRegexEngine(),
  });

  const highlighted = await render("```ts\nconst x: number = 1;\n```\n", {
    shiki: { highlighter, theme: "github-dark" },
  });
  assertStringIncludes(highlighted, '<span style="color:');

  const notCarried = await render("```json\n{}\n```\n", {
    shiki: { highlighter, theme: "github-dark" },
  });
  assertStringIncludes(notCarried, "{}");
  assertEquals(notCarried.includes('<span style="color:'), false);
});
