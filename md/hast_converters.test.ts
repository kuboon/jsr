import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownToHast } from "./mod.ts";
import { hastToHtml } from "./hast_to_html.ts";
import { hastToDom } from "./hast_to_dom.ts";
import { hastToRemix } from "./hast_to_remix.ts";
import { hastToReact } from "./hast_to_react.ts";

Deno.test("hastToHtml: serializes a hast tree", async () => {
  const hast = await markdownToHast("# Hi\n\nSome **bold** text.");
  const html = hastToHtml(hast);
  assertStringIncludes(html, "<h1>Hi</h1>");
  assertStringIncludes(html, "<strong>bold</strong>");
});

Deno.test("hastToDom: renders into a DOM fragment", async () => {
  const window = parseHTML("<!doctype html><html><body></body></html>");
  // deno-lint-ignore no-explicit-any
  const document = (window as any).document;
  const hast = await markdownToHast("# Hi\n\nSome **bold** text.");
  const fragment = hastToDom(hast, { document });
  const container = document.createElement("div");
  container.append(fragment);
  assertStringIncludes(container.innerHTML, "<h1>Hi</h1>");
  assertStringIncludes(container.innerHTML, "<strong>bold</strong>");
});

Deno.test("hastToRemix: builds a Remix UI element tree", async () => {
  const hast = await markdownToHast(
    "Some **bold** text with [a link](https://example.com).",
  );
  const remix = hastToRemix(hast) as unknown[];
  const paragraph = remix[0] as {
    type: string;
    props: { children: unknown[] };
  };
  assertEquals(paragraph.type, "p");
  assertStringIncludes(JSON.stringify(paragraph), "https://example.com");
});

Deno.test("hastToReact: builds a React element tree", async () => {
  const hast = await markdownToHast("# Hi\n\nSome **bold** text.");
  const html = renderToStaticMarkup(hastToReact(hast));
  assertStringIncludes(html, "<h1>Hi</h1>");
  assertStringIncludes(html, "<strong>bold</strong>");
});
