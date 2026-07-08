import { toDom } from "hast-util-to-dom";
import type { Options } from "hast-util-to-dom";
import type { Nodes as HastNodes } from "hast";

export type { Options as HastToDomOptions } from "hast-util-to-dom";

/**
 * Render a hast tree into real DOM nodes. Thin wrapper around
 * `hast-util-to-dom`, defaulting to `fragment: true` since our hast trees
 * are body content rather than a whole document.
 *
 * Requires a `document` — either the global browser `document`, or one
 * passed via `options.document` (e.g. from `linkedom`) for server-side use.
 */
export function hastToDom(
  tree: HastNodes,
  options?: Options,
): ReturnType<typeof toDom> {
  return toDom(tree, { fragment: true, ...options });
}
