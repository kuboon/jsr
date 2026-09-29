import type { Element, Nodes } from "hast";

export function languageOf(code: Element): string | undefined {
  const classNames = code.properties?.className;
  if (!Array.isArray(classNames)) return undefined;
  const match = classNames.find(
    (name) => typeof name === "string" && name.startsWith("language-"),
  );
  return typeof match === "string"
    ? match.slice("language-".length)
    : undefined;
}

export function textOf(node: Element): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
  }
  return out;
}

/** Like {@linkcode textOf}, but also descends into child elements (e.g. a heading's `<a>` wrapper). */
export function deepTextOf(node: Element): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += deepTextOf(child);
  }
  return out;
}

export function findCode(pre: Element): Element | undefined {
  return pre.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
}

/**
 * hast property names that some producers emit as raw HTML attribute names.
 *
 * hast carries DOM property names (`className`, `tabIndex`), not attribute
 * names — see
 * {@link https://github.com/syntax-tree/hast#propertyname | the hast spec}.
 * `style` is a string either way, so it is not in here.
 */
const RAW_ATTRIBUTE_NAMES: Record<string, string> = {
  class: "className",
  tabindex: "tabIndex",
};

/**
 * Rewrites raw HTML attribute names in a tree's properties to hast's own.
 *
 * Shiki's `codeToHast` builds its nodes by hand and spells them `class` and
 * `tabindex`; a real parser (`hast-util-from-html`, which the Mermaid path
 * uses) would have produced `className` and `tabIndex`. Serializing to HTML or
 * DOM hides the difference — `property-information` maps both spellings to the
 * same attribute — but anything that reads the tree directly sees it, and a
 * consumer handing the properties to React or another renderer gets
 * `Invalid DOM property \`class\``.
 *
 * Keys are rewritten in place, in order, so the serialized attribute order does
 * not change.
 *
 * @param node The tree to normalize, modified in place.
 */
export function normalizeProperties(node: Nodes): void {
  if (node.type === "element" && node.properties) {
    const next: Element["properties"] = {};
    for (const [key, value] of Object.entries(node.properties)) {
      const name = RAW_ATTRIBUTE_NAMES[key] ?? key;
      next[name] = name === "className" && typeof value === "string"
        ? value.split(/\s+/).filter(Boolean)
        : name === "tabIndex" && typeof value === "string"
        ? Number(value)
        : value;
    }
    node.properties = next;
  }
  if ("children" in node) {
    for (const child of node.children) normalizeProperties(child);
  }
}
