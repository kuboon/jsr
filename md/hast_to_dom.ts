/**
 * Render a hast (HTML AST) tree into real DOM nodes.
 *
 * @module
 */

import { toDom } from "hast-util-to-dom";
import type { Options } from "hast-util-to-dom";
import type { Nodes as HastNodes } from "hast";

/** Options forwarded to `hast-util-to-dom`'s `toDom`. */
export type { Options as HastToDomOptions } from "hast-util-to-dom";

/**
 * Render a hast tree into real DOM nodes. Thin wrapper around
 * `hast-util-to-dom`, defaulting to `fragment: true` since
 * {@linkcode markdownToHast}'s trees are body content rather than a whole
 * document.
 *
 * Requires a `document` — either the global browser `document`, or one
 * passed via `options.document` (e.g. from `linkedom`) for server-side use.
 *
 * @example In a browser, using the global `document`
 * ```ts ignore
 * import { hastToDom, markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello");
 * document.body.append(hastToDom(hast));
 * ```
 *
 * @param tree The hast tree to render.
 * @param options Forwarded to `hast-util-to-dom`; pass `document` for a
 * non-browser DOM implementation.
 * @returns The rendered DOM node (a `DocumentFragment` by default).
 */
export function hastToDom(
  tree: HastNodes,
  options?: Options,
): ReturnType<typeof toDom> {
  return toDom(tree, { fragment: true, ...options });
}
