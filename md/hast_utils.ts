import type { Element } from "hast";

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

export function findCode(pre: Element): Element | undefined {
  return pre.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
}
