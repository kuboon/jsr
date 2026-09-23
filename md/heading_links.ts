import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Options as AutolinkOptions } from "rehype-autolink-headings";
import type { Root } from "hast";
import { SKIP, visit } from "unist-util-visit";

/**
 * Options for {@linkcode rehypeHeadingLinks}, forwarded to
 * `rehype-autolink-headings` (`behavior`, `properties`, `content`, `group`,
 * `test`).
 */
export type RehypeHeadingLinksOptions = AutolinkOptions;

const ID_REF_PROPERTIES = ["ariaDescribedBy", "ariaLabelledBy"] as const;

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Appends `-` to every id without a hyphen, and repoints the links and ARIA
 * references that targeted it. An id containing a hyphen is never a valid
 * JS identifier, so it can't clobber a `window` property or global variable.
 */
function hyphenateIds(tree: Root): void {
  const renamed = new Map<string, string>();
  visit(tree, "element", (node) => {
    // Mermaid's SVG references its own fixed ids via `url(#id)`.
    if (node.tagName === "svg") return SKIP;
    const id = node.properties.id;
    if (typeof id === "string" && !id.includes("-")) {
      renamed.set(id, `${id}-`);
      node.properties.id = `${id}-`;
    }
  });
  if (renamed.size === 0) return;
  visit(tree, "element", (node) => {
    if (node.tagName === "svg") return SKIP;
    const href = node.properties.href;
    if (typeof href === "string" && href.startsWith("#")) {
      const target = renamed.get(decodeFragment(href.slice(1)));
      if (target !== undefined) node.properties.href = `#${target}`;
    }
    for (const key of ID_REF_PROPERTIES) {
      const refs = node.properties[key];
      if (Array.isArray(refs)) {
        node.properties[key] = refs.map((ref) =>
          renamed.get(String(ref)) ?? ref
        );
      }
    }
  });
}

/**
 * Rehype plugin that gives every heading (`h1`-`h6`) a stable `id` slug
 * generated from its text, and wraps the heading's content in an
 * `<a href="#slug">` pointing back to itself. Thin wrapper combining
 * `rehype-slug` and `rehype-autolink-headings`. A heading that already has
 * an `id` (e.g. from `{#custom-id}` syntax) keeps it.
 *
 * It also guards against DOM clobbering, for every id in the tree (headings,
 * GFM footnotes, ...): an id without a hyphen gets one appended
 * (`## Install` → `id="install-"`, while `## Getting Started` stays
 * `getting-started`), and in-document links to it (`[see](#install)`) are
 * repointed to match. Links to ids not in the document (e.g. the host page's
 * `#top`) are left alone. Run it last, once every id is in place.
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
  const slug = rehypeSlug({ prefix: "" });
  const autolink = rehypeAutolinkHeadings({ behavior: "wrap", ...options });
  return (tree: Root) => {
    slug(tree);
    hyphenateIds(tree);
    autolink(tree);
  };
}
