import { toHtml } from "hast-util-to-html";
import type { Options } from "hast-util-to-html";
import type { Nodes as HastNodes } from "hast";

export type { Options as HastToHtmlOptions } from "hast-util-to-html";

/** Serialize a hast tree to an HTML string. Thin wrapper around `hast-util-to-html`. */
export function hastToHtml(tree: HastNodes, options?: Options): string {
  return toHtml(tree, options);
}
