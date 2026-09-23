import { visit } from "unist-util-visit";
import type { Root } from "mdast";

const CUSTOM_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

/**
 * Remark step that honors a trailing `{#custom-id}` on a heading
 * (`## Install {#setup}`), the syntax Pandoc, kramdown and Hugo use: the
 * marker is removed from the heading text and the id is set on the heading.
 * Only `[A-Za-z0-9_-]` ids are recognized; anything else stays as text.
 *
 * Like any other id, it's made clobber-safe by {@linkcode rehypeHeadingLinks}:
 * `{#setup}` ends up as `id="setup-"`, and `[link](#setup)` still reaches it.
 */
export function remarkHeadingId(): (tree: Root) => void {
  return (tree) => {
    visit(tree, "heading", (node) => {
      const last = node.children.at(-1);
      if (last?.type !== "text") return;
      const match = CUSTOM_ID.exec(last.value);
      if (!match) return;
      last.value = last.value.slice(0, match.index);
      if (last.value === "") node.children.pop();
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id: match[1] },
      };
    });
  };
}
