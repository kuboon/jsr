import { visit } from "unist-util-visit";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { sanitize } from "hast-util-sanitize";
import { renderMermaid, type RenderOptions } from "beautiful-mermaid";
import { mermaidSvgSchema } from "./sanitize.ts";
import { findCode, languageOf, textOf } from "./hast_utils.ts";
import type { Element, ElementContent, Root } from "hast";

export type RehypeMermaidOptions = RenderOptions;

/** Removes the remote Google Fonts `@import` the renderer embeds by default. */
function stripRemoteFontImports(svg: string): string {
  return svg.replace(/@import\s+url\(['"][^'"]*['"]\)\s*;?/g, "");
}

/**
 * Rehype plugin that replaces ` ```mermaid ` code blocks with a diagram
 * rendered to SVG via `beautiful-mermaid`.
 *
 * Run this *after* the Markdown content itself has been sanitized
 * (e.g. after `rehype-sanitize` with `markdownSchema`): this plugin only
 * sanitizes the SVG it generates, using a schema scoped to SVG's
 * presentational elements (see `mermaidSvgSchema`), as defense in depth
 * in case a diagram's label text ever leaks markup into the output.
 */
export function rehypeMermaid(
  options: RehypeMermaidOptions = {},
): (tree: Root) => Promise<void> {
  return async function transform(tree: Root): Promise<void> {
    const jobs: Array<() => Promise<void>> = [];

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = findCode(node);
      if (!code || languageOf(code) !== "mermaid") return;

      const source = textOf(code);
      jobs.push(async () => {
        let svg: string;
        try {
          svg = await renderMermaid(source, options);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          const errorNode: Element = {
            type: "element",
            tagName: "pre",
            properties: { className: ["mermaid-error"] },
            children: [{
              type: "text",
              value: `Failed to render Mermaid diagram: ${message}`,
            }],
          };
          parent.children[index] = errorNode;
          return;
        }

        const fragment = fromHtmlIsomorphic(stripRemoteFontImports(svg), {
          fragment: true,
        });
        const clean = sanitize(fragment, mermaidSvgSchema) as Root;
        const wrapper: Element = {
          type: "element",
          tagName: "div",
          properties: { className: ["mermaid-diagram"] },
          children: clean.children as ElementContent[],
        };
        parent.children[index] = wrapper;
      });
    });

    await Promise.all(jobs.map((job) => job()));
  };
}
