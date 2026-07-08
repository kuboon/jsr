import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { rehypeMermaid, type RehypeMermaidOptions } from "./mermaid.ts";
import { rehypeShiki, type RehypeShikiOptions } from "./shiki.ts";
import { markdownSchema } from "./sanitize.ts";

export { rehypeMermaid, type RehypeMermaidOptions } from "./mermaid.ts";
export { rehypeShiki, type RehypeShikiOptions } from "./shiki.ts";
export { markdownSchema, mermaidSvgSchema, shikiSchema } from "./sanitize.ts";

export interface MarkdownToHtmlOptions {
  /** Options passed to `beautiful-mermaid`'s renderer (theme colors, etc.). */
  mermaid?: RehypeMermaidOptions;
  /** Options passed to Shiki (theme(s), default language). */
  shiki?: RehypeShikiOptions;
}

/**
 * Convert Markdown to sanitized HTML.
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
 *   code — is passed through `rehype-sanitize` before being serialized.
 */
export async function markdownToHtml(
  markdown: string,
  options: MarkdownToHtmlOptions = {},
): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, markdownSchema)
    .use(rehypeMermaid, options.mermaid)
    .use(rehypeShiki, options.shiki)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
