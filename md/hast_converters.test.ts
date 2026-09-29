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
  assertStringIncludes(
    html,
    '<h1 id="hi-"><a href="#hi-">Hi</a></h1>',
  );
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
  assertStringIncludes(
    container.innerHTML,
    '<h1 id="hi-"><a href="#hi-">Hi</a></h1>',
  );
  assertStringIncludes(container.innerHTML, "<strong>bold</strong>");
});

/**
 * Stands in for `@remix-run/ui`'s `createElement`, so this test needs no UI
 * runtime — which is the point of taking the factory as an argument.
 */
type FakeElement = { type: string; props: Record<string, unknown> };
const fakeCreateElement = (
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
): FakeElement => ({ type, props: { ...props, children } });

Deno.test("hastToRemix: builds an element tree with the supplied factory", async () => {
  const hast = await markdownToHast(
    "Some **bold** text with [a link](https://example.com).",
  );
  const remix = hastToRemix(hast, fakeCreateElement) as FakeElement[];
  const paragraph = remix[0];
  assertEquals(paragraph.type, "p");
  assertStringIncludes(JSON.stringify(paragraph), "https://example.com");
});

Deno.test("hastToRemix: nests children through the factory", async () => {
  const hast = await markdownToHast("Some **bold** text.");
  const [paragraph] = hastToRemix(hast, fakeCreateElement) as FakeElement[];
  const children = paragraph.props.children as (FakeElement | string)[];
  assertEquals(children[0], "Some ");
  assertEquals((children[1] as FakeElement).type, "strong");
});

Deno.test("hastToReact: builds a React element tree", async () => {
  const hast = await markdownToHast("# Hi\n\nSome **bold** text.");
  const html = renderToStaticMarkup(hastToReact(hast));
  assertStringIncludes(
    html,
    '<h1 id="hi-"><a href="#hi-">Hi</a></h1>',
  );
  assertStringIncludes(html, "<strong>bold</strong>");
});
