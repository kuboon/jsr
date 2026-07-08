import { visit } from "unist-util-visit";
import { sanitize } from "hast-util-sanitize";
import { codeToHast } from "shiki";
import { shikiSchema } from "./sanitize.ts";
import { findCode, languageOf, textOf } from "./hast_utils.ts";
import type { Element, Root } from "hast";

export interface RehypeShikiOptions {
  /** Single Shiki theme name. Ignored if `themes` is set. Default: `"github-dark"`. */
  theme?: string;
  /** Dual light/dark themes, rendered with CSS variables for live switching. */
  themes?: Record<string, string>;
  /** Language used for code blocks with no (or an unrecognized) language. Default: `"text"`. */
  defaultLanguage?: string;
}

/**
 * Rehype plugin that highlights fenced code blocks with Shiki.
 *
 * Run this *after* the Markdown content itself has been sanitized and
 * after `rehypeMermaid` (so ` ```mermaid ` blocks are already turned into
 * diagrams and skipped here). Each highlighted block is re-sanitized with
 * `shikiSchema` as defense in depth.
 */
export function rehypeShiki(
  options: RehypeShikiOptions = {},
): (tree: Root) => Promise<void> {
  const themeOption = options.themes
    ? { themes: options.themes }
    : { theme: options.theme ?? "github-dark" };
  const defaultLanguage = options.defaultLanguage ?? "text";

  return async function transform(tree: Root): Promise<void> {
    const jobs: Array<() => Promise<void>> = [];

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = findCode(node);
      if (!code) return;
      const lang = languageOf(code);
      if (lang === "mermaid") return;

      const source = textOf(code);
      jobs.push(async () => {
        const highlighted = await highlight(source, lang ?? defaultLanguage) ??
          await highlight(source, defaultLanguage);
        if (!highlighted) return;

        const clean = sanitize(highlighted, shikiSchema) as Root;
        const replacement = clean.children[0];
        if (replacement) parent.children[index] = replacement as Element;
      });

      async function highlight(code: string, lang: string) {
        try {
          return await codeToHast(code, { lang, ...themeOption });
        } catch {
          return undefined;
        }
      }
    });

    await Promise.all(jobs.map((job) => job()));
  };
}
