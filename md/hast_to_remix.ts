/**
 * Convert a hast (HTML AST) tree into a
 * {@link https://github.com/remix-run/remix/tree/main/packages/ui | Remix UI}
 * element tree.
 *
 * @module
 */

import { createElement } from "@remix-run/ui";
import type { RemixNode } from "@remix-run/ui";
import type { Element as HastElement, Nodes as HastNodes } from "hast";

function propsFrom(node: HastElement): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    if (value === undefined || value === null || value === false) continue;
    props[key] = Array.isArray(value) ? value.join(" ") : value;
  }
  return props;
}

function convert(node: HastNodes): RemixNode | undefined {
  switch (node.type) {
    case "root":
      return node.children.map(convert).filter((child) => child !== undefined);
    case "element":
      return createElement(
        node.tagName,
        propsFrom(node),
        ...node.children.map(convert).filter((child) => child !== undefined),
      );
    case "text":
      return node.value;
    default:
      // comments and doctypes have no Remix UI equivalent.
      return undefined;
  }
}

/**
 * Convert a hast tree into a
 * {@link https://github.com/remix-run/remix/tree/main/packages/ui | Remix UI}
 * element tree (`RemixNode`), ready to hand to `createRoot(...).render(...)`.
 *
 * Follows the element shape described in
 * {@link https://github.com/remix-run/remix/blob/main/packages/ui/src/runtime/jsx.ts | Remix's jsx.ts}.
 *
 * @example
 * ```ts
 * import { hastToRemix, markdownToHast } from "@kuboon/md";
 *
 * const hast = await markdownToHast("# Hello");
 * const remix = hastToRemix(hast);
 * // createRoot(container).render(remix); // from "@remix-run/ui"
 * ```
 *
 * @param tree The hast tree to convert.
 * @returns A Remix UI `RemixNode`.
 */
export function hastToRemix(tree: HastNodes): RemixNode {
  return convert(tree) ?? [];
}
