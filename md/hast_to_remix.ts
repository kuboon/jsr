/**
 * Convert a hast (HTML AST) tree into a
 * {@link https://github.com/remix-run/remix/tree/main/packages/ui | Remix UI}
 * element tree.
 *
 * The caller supplies `createElement`, so this module does not depend on
 * `@remix-run/ui` at all. That is not ceremony: a library that imports the UI
 * runtime pins a version range, and `@remix-run/ui`'s ranges do not overlap
 * across minors — a consumer one minor ahead of this package would resolve a
 * **second copy of the runtime**, with module-level state existing twice and no
 * error to say so. Taking the factory as an argument leaves exactly one copy,
 * the consumer's, whichever version that is.
 *
 * Nothing here is Remix-specific beyond the name. Any `createElement(type,
 * props, ...children)` factory works.
 *
 * @module
 */

import type { Element as HastElement, Nodes as HastNodes } from "hast";

/**
 * The element factory this module builds with — `@remix-run/ui`'s
 * `createElement`, or any function of the same shape.
 *
 * @typeParam Element The element type the factory returns.
 */
export type CreateElement<Element> = (
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
) => Element;

/**
 * What {@linkcode hastToRemix} returns: an element, a text string, or a list of
 * them. Assignable to `RemixNode` when the factory is Remix's.
 *
 * @typeParam Element The element type the factory returns.
 */
export type ElementTree<Element> =
  | Element
  | string
  | ElementTree<Element>[];

function propsFrom(node: HastElement): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    if (value === undefined || value === null || value === false) continue;
    props[key] = Array.isArray(value) ? value.join(" ") : value;
  }
  return props;
}

function convert<Element>(
  node: HastNodes,
  createElement: CreateElement<Element>,
): ElementTree<Element> | undefined {
  switch (node.type) {
    case "root":
      return node.children
        .map((child) => convert(child, createElement))
        .filter((child) => child !== undefined);
    case "element":
      return createElement(
        node.tagName,
        propsFrom(node),
        ...node.children
          .map((child) => convert(child, createElement))
          .filter((child) => child !== undefined),
      );
    case "text":
      return node.value;
    default:
      // comments and doctypes have no element equivalent.
      return undefined;
  }
}

/**
 * Convert a hast tree into a
 * {@link https://github.com/remix-run/remix/tree/main/packages/ui | Remix UI}
 * element tree, ready to hand to `createRoot(...).render(...)`.
 *
 * Follows the element shape described in
 * {@link https://github.com/remix-run/remix/blob/main/packages/ui/src/runtime/jsx.ts | Remix's jsx.ts}.
 *
 * @example
 * ```ts ignore
 * import { createElement } from "@remix-run/ui";
 * import { markdownToHast } from "@kuboon/md";
 * import { hastToRemix } from "@kuboon/md/hast_to_remix.ts";
 *
 * const hast = await markdownToHast("# Hello");
 * const remix = hastToRemix(hast, createElement);
 * // createRoot(container).render(remix); // from "@remix-run/ui"
 * ```
 *
 * @typeParam Element The element type `createElement` returns.
 * @param tree The hast tree to convert.
 * @param createElement The element factory to build with.
 * @returns An element tree built by `createElement`.
 */
export function hastToRemix<Element>(
  tree: HastNodes,
  createElement: CreateElement<Element>,
): ElementTree<Element> {
  return convert(tree, createElement) ?? [];
}
