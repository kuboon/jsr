import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { markdownToHtml } from "./mod.ts";

Deno.test("markdownToHtml: renders basic markdown", async () => {
  const html = await markdownToHtml("# Hello\n\nSome **bold** text.");
  assertStringIncludes(html, "<h1>Hello</h1>");
  assertStringIncludes(html, "<strong>bold</strong>");
});

Deno.test("markdownToHtml: renders GFM tables", async () => {
  const html = await markdownToHtml("| a | b |\n| - | - |\n| 1 | 2 |\n");
  assertStringIncludes(html, "<table>");
});

Deno.test("markdownToHtml: strips <script> tags entirely", async () => {
  const html = await markdownToHtml(
    "Hello <script>alert(1)</script> world",
  );
  assert(!html.includes("<script"));
  assert(!/alert\(1\)/.test(html) || !html.includes("<script"));
});

Deno.test("markdownToHtml: strips inline event handlers", async () => {
  const html = await markdownToHtml('<img src="x" onerror="alert(1)">');
  assert(!html.includes("onerror"));
});

Deno.test("markdownToHtml: strips javascript: URLs from links", async () => {
  const html = await markdownToHtml("[click me](javascript:alert(1))");
  assert(!html.includes("javascript:"));
});

Deno.test("markdownToHtml: keeps safe http(s) links", async () => {
  const html = await markdownToHtml("[example](https://example.com)");
  assertStringIncludes(html, 'href="https://example.com"');
});

Deno.test("markdownToHtml: renders a mermaid code block as sanitized SVG", async () => {
  const html = await markdownToHtml(
    "```mermaid\ngraph TD\nA[Start] --> B[End]\n```\n",
  );
  assertStringIncludes(html, '<div class="mermaid-diagram">');
  assertStringIncludes(html, "<svg");
  assert(!html.includes("<script"));
});

Deno.test("markdownToHtml: mermaid diagrams escape malicious node labels", async () => {
  const html = await markdownToHtml(
    '```mermaid\ngraph TD\nA["<img src=x onerror=alert(1)>"] --> B\n```\n',
  );
  // The label text is rendered as inert SVG <text> content: the literal
  // words may appear, but never as an actual, parseable <img ...> tag.
  assert(!/<img[\s>]/.test(html));
});

Deno.test("markdownToHtml: highlights other fenced code blocks with Shiki", async () => {
  const html = await markdownToHtml(
    "```ts\nconst x: number = 1;\n```\n",
  );
  assertStringIncludes(html, "shiki");
  assertStringIncludes(html, "<span");
});

Deno.test("markdownToHtml: falls back gracefully for unknown languages", async () => {
  const html = await markdownToHtml(
    "```not-a-real-language\nhello\n```\n",
  );
  assertStringIncludes(html, "hello");
});

Deno.test("markdownToHtml: does not leak a remote font @import", async () => {
  const html = await markdownToHtml(
    "```mermaid\ngraph TD\nA-->B\n```\n",
  );
  assertEquals(html.includes("fonts.googleapis.com"), false);
});
