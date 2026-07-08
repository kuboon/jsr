import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Options as AutolinkOptions } from "rehype-autolink-headings";
import type { Root } from "hast";

/**
 * Options for {@linkcode rehypeHeadingLinks}. All fields besides `prefix`
 * are forwarded to `rehype-autolink-headings` (`behavior`, `properties`,
 * `content`, `group`, `test`).
 */
export interface RehypeHeadingLinksOptions extends AutolinkOptions {
  /**
   * Prefix added to generated heading ids (and the matching `#`-fragment
   * hrefs that link to them). Default: `"user-content-"`, matching GitHub's
   * own convention — heading text is user-authored, so ids derived from it
   * are prefixed to prevent DOM-clobbering attacks (e.g. a heading titled
   * "attributes" producing `id="attributes"`).
   */
  prefix?: string;
}

/**
 * Rehype plugin that gives every heading (`h1`-`h6`) a stable `id` slug
 * generated from its text, and wraps the heading's content in an
 * `<a href="#slug">` pointing back to itself. Thin wrapper combining
 * `rehype-slug` and `rehype-autolink-headings`.
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
  const slug = rehypeSlug({ prefix: prefix ?? "user-content-" });
  const autolink = rehypeAutolinkHeadings({
    behavior: "wrap",
    ...autolinkOptions,
  });
  return (tree: Root) => {
    slug(tree);
    autolink(tree);
  };
}
