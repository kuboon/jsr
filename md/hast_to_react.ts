/**
 * Convert a hast (HTML AST) tree into a React element tree.
 *
 * @module
 */

import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Options as ToJsxRuntimeOptions } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";
import type { Nodes as HastNodes } from "hast";

/**
 * Options forwarded to `hast-util-to-jsx-runtime`. The JSX runtime
 * (`Fragment`, `jsx`, `jsxs`) is supplied by {@linkcode hastToReact} itself,
 * so those fields are omitted here.
 */
export type HastToReactOptions = Omit<
  ToJsxRuntimeOptions,
  "Fragment" | "jsx" | "jsxs" | "jsxDEV" | "development"
>;

/**
 * Convert a hast tree into a React element tree. Thin wrapper around
 * `hast-util-to-jsx-runtime` using React's automatic JSX runtime, ready to
 * render with `react-dom` (or any other React renderer).
 *
 * @example
 * ```ts
 * import { renderToStaticMarkup } from "react-dom/server";
 * import { hastToReact, markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello");
 * const html = renderToStaticMarkup(hastToReact(hast)); // "<h1>Hello</h1>"
 * ```
 *
 * @param tree The hast tree to convert.
 * @param options Forwarded to `hast-util-to-jsx-runtime`.
 * @returns A React element tree (`ReactNode`).
 */
export function hastToReact(
  tree: HastNodes,
  options?: HastToReactOptions,
): ReactNode {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    ...options,
  }) as ReactNode;
}
