import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Options as ToJsxRuntimeOptions } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";
import type { Nodes as HastNodes } from "hast";

export type HastToReactOptions = Omit<
  ToJsxRuntimeOptions,
  "Fragment" | "jsx" | "jsxs" | "jsxDEV" | "development"
>;

/**
 * Convert a hast tree into a React element tree. Thin wrapper around
 * `hast-util-to-jsx-runtime` using React's automatic JSX runtime.
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
