import { visit } from "unist-util-visit";
import type { Root } from "hast";
import { deepTextOf } from "./hast_utils.ts";

const HEADING_DEPTH: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** One heading in a {@linkcode tocFromHast} result. */
export interface TocEntry {
  /** Heading level, 1-6. */
  depth: number;
  /** The heading's `id`, as assigned by {@linkcode rehypeHeadingLinks}. */
  id: string;
  /** The heading's text content. */
  text: string;
}

/**
 * Extracts a table of contents from a hast tree produced by {@linkcode markdownToHast}: one
 * entry per heading (`h1`-`h6`), in document order.
 *
 * Reads the `id` {@linkcode rehypeHeadingLinks} already assigned to each heading, rather than
 * recomputing a slug.
 *
 * @example
 * ```ts
 * import { markdownToHast, tocFromHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Title\n\n## Section");
 * const toc = tocFromHast(hast);
 * // [
 * //   { depth: 1, id: "user-content-title", text: "Title" },
 * //   { depth: 2, id: "user-content-section", text: "Section" },
 * // ]
 * ```
 *
 * @param hast The hast root, as returned by {@linkcode markdownToHast}.
 * @returns A flat list of headings, in document order.
 */
export function tocFromHast(hast: Root): TocEntry[] {
  const entries: TocEntry[] = [];
  visit(hast, "element", (node) => {
    const depth = HEADING_DEPTH[node.tagName];
    if (depth === undefined) return;
    const id = node.properties?.id;
    if (typeof id !== "string") return;
    entries.push({ depth, id, text: deepTextOf(node) });
  });
  return entries;
}
