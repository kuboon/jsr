import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
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
  assertStringIncludes(html, "<h1>Hello</h1>");
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
  assertStringIncludes(toHtml(hast), "<h2>Hello</h2>");
});
