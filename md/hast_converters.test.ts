import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseHTML } from "linkedom";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownToHast } from "./mod.ts";
import { hastToHtml } from "./hast_to_html.ts";
import { hastToDom } from "./hast_to_dom.ts";
import { hastToElement } from "./hast_to_element.ts";

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

Deno.test("hastToElement: builds an element tree with the supplied factory", async () => {
  const hast = await markdownToHast(
    "Some **bold** text with [a link](https://example.com).",
  );
  const remix = hastToElement(hast, fakeCreateElement) as FakeElement[];
  const paragraph = remix[0];
  assertEquals(paragraph.type, "p");
  assertStringIncludes(JSON.stringify(paragraph), "https://example.com");
});

Deno.test("hastToElement: nests children through the factory", async () => {
  const hast = await markdownToHast("Some **bold** text.");
  const [paragraph] = hastToElement(hast, fakeCreateElement) as FakeElement[];
  const children = paragraph.props.children as (FakeElement | string)[];
  assertEquals(children[0], "Some ");
  assertEquals((children[1] as FakeElement).type, "strong");
});

/**
 * React's `createElement` has the same shape, so it can be injected directly —
 * except that hast's `style` is a *string* (per the spec) and React wants an
 * object. This is the normalizing factory the README documents.
 */
function reactFactory(
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
) {
  const { style, ...rest } = props;
  return createElement(
    type,
    typeof style === "string"
      ? { ...rest, style: styleToObject(style) }
      : props,
    ...children,
  );
}

function styleToObject(style: string): Record<string, string> {
  return Object.fromEntries(
    style.split(";").filter(Boolean).map((rule) => {
      const [name, ...rest] = rule.split(":");
      return [
        name.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        rest.join(":").trim(),
      ];
    }),
  );
}

Deno.test("hastToElement: React's createElement works through a normalizing factory", async () => {
  // Real React, to prove the seam works with it — the package itself no longer
  // imports React at all.
  const hast = await markdownToHast(
    "# Hi\n\nSome **bold** text.\n\n```ts\nconst x = 1;\n```",
  );
  const html = renderToStaticMarkup(
    hastToElement(hast, reactFactory) as ReactNode,
  );
  assertStringIncludes(html, '<h1 id="hi-"><a href="#hi-">Hi</a></h1>');
  assertStringIncludes(html, "<strong>bold</strong>");
  // the Shiki block is what breaks without the normalization
  assertStringIncludes(html, 'class="shiki github-dark"');
  assertStringIncludes(html, "background-color:#24292e");
});

Deno.test("markdownToHast: Shiki's nodes carry hast property names", async () => {
  const hast = await markdownToHast("```ts\nconst x = 1;\n```");
  const names = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const walk = (node: any) => {
    if (node.type === "element") {
      for (const key of Object.keys(node.properties ?? {})) {
        names.add(`${node.tagName}.${key}`);
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(hast);

  // Shiki emits `class` / `tabindex`; `rehypeShiki` normalizes them, so nothing
  // downstream has to special-case the one subtree that spells them raw.
  assertEquals([...names].filter((n) => n.endsWith(".class")), []);
  assertEquals([...names].filter((n) => n.endsWith(".tabindex")), []);
  assertEquals(names.has("pre.className"), true);
  assertEquals(names.has("pre.tabIndex"), true);
  // `style` stays a string — that is what the hast spec says it is.
  assertEquals(names.has("pre.style"), true);
});

Deno.test("markdownToHast: normalizing Shiki does not change the HTML", async () => {
  const html = hastToHtml(await markdownToHast("```ts\nconst x = 1;\n```"));
  assertStringIncludes(html, '<pre class="shiki github-dark"');
  assertStringIncludes(html, 'style="background-color:#24292e;color:#e1e4e8"');
  assertStringIncludes(html, 'tabindex="0"');
});
