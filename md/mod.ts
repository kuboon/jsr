/**
 * A [unified](https://unifiedjs.com/)-based Markdown → sanitized hast (HTML
 * AST) converter, with Mermaid diagrams via
 * {@link https://github.com/lukilabs/beautiful-mermaid | beautiful-mermaid}
 * and code highlighting via {@link https://shiki.style/ | Shiki}.
 *
 * ```ts
 * import { hastToHtml, markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello");
 * const html = hastToHtml(hast); // "<h1>Hello</h1>"
 * ```
 *
 * Convert the resulting hast tree to whatever you need next with
 * {@linkcode hastToHtml}, {@linkcode hastToDom}, {@linkcode hastToReact}, or
 * {@linkcode hastToRemix}.
 *
 * > [!IMPORTANT]
 * > Raw HTML in the Markdown input (`<script>`, `onerror=` attributes,
 * > `javascript:` links, ...) never reaches the output — see
 * > {@linkcode markdownToHast} for how that's guaranteed.
 *
 * @module
 */

import { unified } from "unified";
import type { Transformer } from "unified";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot } from "hast";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import { rehypeMermaid, type RehypeMermaidOptions } from "./mermaid.ts";
import { rehypeShiki, type RehypeShikiOptions } from "./shiki.ts";
import { markdownSchema } from "./sanitize.ts";

export { rehypeMermaid, type RehypeMermaidOptions } from "./mermaid.ts";
export { rehypeShiki, type RehypeShikiOptions } from "./shiki.ts";
export { markdownSchema, mermaidSvgSchema, shikiSchema } from "./sanitize.ts";
export { hastToDom, type HastToDomOptions } from "./hast_to_dom.ts";
export { hastToHtml, type HastToHtmlOptions } from "./hast_to_html.ts";
export { hastToRemix } from "./hast_to_remix.ts";
export { hastToReact, type HastToReactOptions } from "./hast_to_react.ts";

/** Options for {@linkcode markdownToHast}. */
export interface MarkdownToHastOptions {
  /** Options passed to `beautiful-mermaid`'s renderer (theme colors, etc.). */
  mermaid?: RehypeMermaidOptions;
  /** Options passed to Shiki (theme(s), default language). */
  shiki?: RehypeShikiOptions;
  /**
   * An mdast transformer run right after parsing (GFM included), before
   * the tree is converted to hast. Use this to plug in remark plugins
   * such as `remark-frontmatter` or `remark-toc`.
   */
  mdastTransform?: Transformer<MdastRoot, MdastRoot>;
}

/**
 * Convert Markdown to a sanitized hast (HTML AST) tree.
 *
 * - GitHub Flavored Markdown is supported (tables, task lists,
 *   strikethrough, autolinks).
 * - Mermaid code blocks (language `mermaid`) are rendered to SVG diagrams
 *   with `beautiful-mermaid`.
 * - Other fenced code blocks are syntax-highlighted with Shiki.
 * - Raw HTML in the input (`<script>`, `onerror=`, `javascript:` links,
 *   ...) never reaches the output: the Markdown parser drops raw HTML
 *   outright, and every HTML fragment this function generates — the
 *   Markdown-derived content, the rendered diagrams, and the highlighted
 *   code — is passed through `rehype-sanitize` before being returned.
 *
 * Convert the result yourself (e.g. with {@linkcode hastToHtml}) if you
 * need an HTML string, or with {@linkcode hastToDom}, {@linkcode
 * hastToReact}, {@linkcode hastToRemix} for other targets.
 *
 * @example
 * ```ts
 * import { markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello\n\n**bold** text");
 * ```
 *
 * @example With a custom mdast transformer
 * ```ts
 * import { markdownToHast } from "@kuboon/md";
 * import { visit } from "unist-util-visit";
 *
 * const hast = await markdownToHast("# Hello", {
 *   mdastTransform: (tree) => {
 *     visit(tree, "heading", (node) => {
 *       if (node.depth < 6) node.depth = (node.depth + 1) as typeof node.depth;
 *     });
 *   },
 * });
 * ```
 *
 * @param markdown The Markdown source to convert.
 * @param options See {@linkcode MarkdownToHastOptions}.
 * @returns The sanitized hast root node.
 */
export async function markdownToHast(
  markdown: string,
  options: MarkdownToHastOptions = {},
): Promise<HastRoot> {
  const processor = unified().use(remarkParse).use(remarkGfm);
  if (options.mdastTransform) {
    processor.use(() => options.mdastTransform!);
  }
  processor
    .use(remarkRehype)
    .use(rehypeSanitize, markdownSchema)
    .use(rehypeMermaid, options.mermaid)
    .use(rehypeShiki, options.shiki);

  const mdast = processor.parse(markdown);
  return await processor.run(mdast) as HastRoot;
}
