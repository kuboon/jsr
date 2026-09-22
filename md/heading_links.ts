import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Options as AutolinkOptions } from "rehype-autolink-headings";
import type { Root } from "hast";
import { ID_PREFIX } from "./sanitize.ts";

/**
 * Options for {@linkcode rehypeHeadingLinks}. All fields besides `prefix`
 * are forwarded to `rehype-autolink-headings` (`behavior`, `properties`,
 * `content`, `group`, `test`).
 */
export interface RehypeHeadingLinksOptions extends AutolinkOptions {
  /**
   * Prefix added to generated heading ids (and the matching `#`-fragment
   * hrefs that link to them). Default: `"h-"`, the same prefix
   * {@linkcode markdownSchema} applies to every other user-derived id —
   * heading text is user-authored, so ids derived from it are prefixed to
   * prevent DOM-clobbering attacks (e.g. a heading titled "attributes"
   * producing `id="attributes"`).
   */
  prefix?: string;
}

/**
 * Rehype plugin that gives every heading (`h1`-`h6`) a stable `id` slug
 * generated from its text, and wraps the heading's content in an
 * `<a href="#slug">` pointing back to itself. Thin wrapper combining
 * `rehype-slug` and `rehype-autolink-headings`. A heading that already has
 * an `id` (e.g. from `{#custom-id}` syntax) keeps it.
 *
 * Used internally by {@linkcode markdownToHast}; import it directly only if
 * you're assembling your own `unified` pipeline instead of using that
 * function.
 *
 * @param options See {@linkcode RehypeHeadingLinksOptions}.
 * @returns A `unified` tree transformer.
 */
export function rehypeHeadingLinks(
  options: RehypeHeadingLinksOptions = {},
): (tree: Root) => void {
  const { prefix, ...autolinkOptions } = options;
  const slug = rehypeSlug({ prefix: prefix ?? ID_PREFIX });
  const autolink = rehypeAutolinkHeadings({
    behavior: "wrap",
    ...autolinkOptions,
  });
  return (tree: Root) => {
    slug(tree);
    autolink(tree);
  };
}
