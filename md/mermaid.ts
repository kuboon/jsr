import { SKIP, visit } from "unist-util-visit";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { sanitize } from "hast-util-sanitize";
import { render, type RenderOptions } from "pele";
import { mermaidSvgSchema } from "./sanitize.ts";
import { findCode, languageOf, textOf } from "./hast_utils.ts";
import type { Element, ElementContent, Root } from "hast";

/**
 * Options forwarded to Pele's `render` (fonts, sizes, layout, limits, etc.).
 *
 * Colors are not here: Pele draws with CSS variables (`--pele-bg`,
 * `--pele-fg`, `--pele-accent`, ...), so theme the diagrams from your
 * stylesheet. Links and images are always off — the sanitizer would strip
 * them anyway.
 */
export type RehypeMermaidOptions = Omit<
  RenderOptions,
  "links" | "images" | "linkSchemes" | "imageSchemes" | "linkRel"
>;

/**
 * Rehype plugin that replaces Mermaid code blocks (language `mermaid`) with
 * a diagram rendered to SVG via {@link https://pele.run | Pele}.
 *
 * Run this *after* the Markdown content itself has been sanitized
 * (e.g. after `rehype-sanitize` with {@linkcode markdownSchema}): this
 * plugin only sanitizes the SVG it generates, using a schema scoped to
 * SVG's presentational elements ({@linkcode mermaidSvgSchema}), as defense
 * in depth in case a diagram's label text ever leaks markup into the
 * output.
 *
 * Used internally by {@linkcode markdownToHast}; import it directly only if
 * you're assembling your own `unified` pipeline instead of using that
 * function.
 *
 * @param options Font, layout and limit options passed to Pele.
 * @returns A `unified` tree transformer.
 */
export function rehypeMermaid(
  options: RehypeMermaidOptions = {},
): (tree: Root) => void {
  return function transform(tree: Root): void {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = findCode(node);
      if (!code || languageOf(code) !== "mermaid") return;

      parent.children[index] = diagram(textOf(code), options);
      return SKIP;
    });
  };
}

function diagram(source: string, options: RehypeMermaidOptions): Element {
  let svg: string;
  try {
    svg = render(source, { ...options, links: false, images: false }).svg;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: "element",
      tagName: "pre",
      properties: { className: ["mermaid-error"] },
      children: [{
        type: "text",
        value: `Failed to render Mermaid diagram: ${message}`,
      }],
    };
  }

  const fragment = fromHtmlIsomorphic(svg, { fragment: true });
  const clean = sanitize(fragment, mermaidSvgSchema) as Root;
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["mermaid-diagram"] },
    children: clean.children as ElementContent[],
  };
}
