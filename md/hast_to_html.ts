/**
 * Serialize a hast (HTML AST) tree to an HTML string.
 *
 * @module
 */

import { toHtml } from "hast-util-to-html";
import type { Options } from "hast-util-to-html";
import type { Nodes as HastNodes } from "hast";

/** Options forwarded to `hast-util-to-html`'s `toHtml`. */
export type { Options as HastToHtmlOptions } from "hast-util-to-html";

/**
 * Serialize a hast tree to an HTML string. Thin wrapper around
 * `hast-util-to-html`.
 *
 * @example
 * ```ts
 * import { hastToHtml, markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello");
 * const html = hastToHtml(hast); // "<h1>Hello</h1>"
 * ```
 *
 * @param tree The hast tree to serialize.
 * @param options Forwarded to `hast-util-to-html`.
 * @returns The serialized HTML string.
 */
export function hastToHtml(tree: HastNodes, options?: Options): string {
  return toHtml(tree, options);
}
