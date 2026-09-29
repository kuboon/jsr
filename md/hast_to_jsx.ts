/**
 * Convert a hast (HTML AST) tree into elements built by an automatic JSX
 * runtime — React's, Preact's, or any other.
 *
 * The caller supplies the runtime (`Fragment`, `jsx`, `jsxs`), so this module
 * does not depend on React at all. `hast-util-to-jsx-runtime` already takes
 * those as required options; this entry point used to fill them in from
 * `react/jsx-runtime` and so pinned every consumer to that major. Passing them
 * in means one React — the consumer's, whichever version — and a Preact or
 * Solid runtime works just as well.
 *
 * @module
 */

import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Options as JsxRuntimeOptions } from "hast-util-to-jsx-runtime";
import type { Nodes as HastNodes } from "hast";

/**
 * Options for {@linkcode hastToJsx}, forwarded to `hast-util-to-jsx-runtime`.
 *
 * `Fragment`, `jsx` and `jsxs` are required: they are the JSX runtime, and
 * they come from the caller. Import them from `react/jsx-runtime`,
 * `preact/jsx-runtime`, or whatever runtime you render with.
 */
export type HastToJsxOptions = JsxRuntimeOptions;

/**
 * Convert a hast tree into an element tree built by the supplied JSX runtime,
 * ready to render with `react-dom` (or the matching renderer).
 *
 * Thin wrapper around
 * {@link https://github.com/syntax-tree/hast-util-to-jsx-runtime | `hast-util-to-jsx-runtime`}.
 *
 * @example
 * ```ts ignore
 * import { Fragment, jsx, jsxs } from "react/jsx-runtime";
 * import { renderToStaticMarkup } from "react-dom/server";
 * import { markdownToHast } from "@kuboon/md";
 * import { hastToJsx } from "@kuboon/md/hast_to_jsx.ts";
 *
 * const hast = await markdownToHast("# Hello");
 * const html = renderToStaticMarkup(
 *   hastToJsx(hast, { Fragment, jsx, jsxs }) as React.ReactNode,
 * ); // "<h1>Hello</h1>"
 * ```
 *
 * @param tree The hast tree to convert.
 * @param options The JSX runtime, plus anything else
 * `hast-util-to-jsx-runtime` accepts.
 * @returns An element built by the supplied runtime. Cast it to your
 * renderer's node type (`ReactNode`, `VNode`, …) at the call site.
 */
export function hastToJsx(
  tree: HastNodes,
  options: HastToJsxOptions,
): ReturnType<typeof toJsxRuntime> {
  return toJsxRuntime(tree, options);
}
