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
 * - ` ```mermaid ` code blocks are rendered to SVG diagrams with
 *   `beautiful-mermaid`.
 * - Other fenced code blocks are syntax-highlighted with Shiki.
 * - Raw HTML in the input (`<script>`, `onerror=`, `javascript:` links,
 *   ...) never reaches the output: the Markdown parser drops raw HTML
 *   outright, and every HTML fragment this function generates — the
 *   Markdown-derived content, the rendered diagrams, and the highlighted
 *   code — is passed through `rehype-sanitize` before being returned.
 *
 * Serialize the result yourself (e.g. with `rehype-stringify`) if you
 * need an HTML string.
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
