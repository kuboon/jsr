import { visit } from "unist-util-visit";
import { sanitize } from "hast-util-sanitize";
import { codeToHast } from "shiki/bundle/web";
import { shikiSchema } from "./sanitize.ts";
import { findCode, languageOf, textOf } from "./hast_utils.ts";
import type { Element, Root } from "hast";

/**
 * What this plugin asks a highlighter for.
 *
 * A union rather than two optional fields, because that is the shape Shiki's own
 * `codeToHast` accepts — `{ theme?, themes? }` is assignable to neither half of
 * it, and a `HighlighterCore` would then not satisfy {@linkcode ShikiHighlighter}.
 */
export type ShikiCodeToHastOptions =
  | { lang: string; theme: string }
  | { lang: string; themes: Record<string, string> };

/**
 * Anything that can turn source into a highlighted hast tree.
 *
 * Structural on purpose: a Shiki `HighlighterCore` from `createHighlighterCore()`
 * satisfies it as-is, and so does any wrapper you write.
 */
export interface ShikiHighlighter {
  codeToHast(
    code: string,
    options: ShikiCodeToHastOptions,
  ): Root | Promise<Root>;
}

/** Options for {@linkcode rehypeShiki}. */
export interface RehypeShikiOptions {
  /** Single Shiki theme name. Ignored if `themes` is set. Default: `"github-dark"`. */
  theme?: string;
  /** Dual light/dark themes, rendered with CSS variables for live switching. */
  themes?: Record<string, string>;
  /** Language used for code blocks with no (or an unrecognized) language. Default: `"text"`. */
  defaultLanguage?: string;
  /**
   * Highlighter to use instead of the bundled one.
   *
   * The default is Shiki's `web` bundle: every language it carries, loaded on
   * demand, nothing to configure. Pass a `createHighlighterCore()` highlighter
   * carrying only the languages and themes you actually render when the bundled
   * one is more than you want to ship — languages it does not carry then come
   * back through the plain-text fallback, exactly as an unknown language does.
   *
   * Install size is the same either way: Shiki ships every grammar in one npm
   * package no matter which entry point you import. What changes is the built
   * output.
   *
   * @example
   * ```ts ignore
   * import { createHighlighterCore } from "shiki/core";
   * import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
   * import ts from "@shikijs/langs/typescript";
   * import githubDark from "@shikijs/themes/github-dark";
   *
   * const highlighter = await createHighlighterCore({
   *   langs: [ts],
   *   themes: [githubDark],
   *   engine: createJavaScriptRegexEngine(),
   * });
   *
   * await markdownToHast(source, { shiki: { highlighter, theme: "github-dark" } });
   * ```
   */
  highlighter?: ShikiHighlighter;
}

/**
 * Rehype plugin that highlights fenced code blocks with Shiki.
 *
 * Run this *after* the Markdown content itself has been sanitized and
 * after {@linkcode rehypeMermaid} (so Mermaid code blocks are already
 * turned into diagrams and skipped here). Each highlighted block is
 * re-sanitized with {@linkcode shikiSchema} as defense in depth.
 *
 * Used internally by {@linkcode markdownToHast}; import it directly only
 * if you're assembling your own `unified` pipeline instead of using that
 * function.
 *
 * @param options Theme(s) and default-language settings passed to Shiki.
 * @returns A `unified` tree transformer.
 */
export function rehypeShiki(
  options: RehypeShikiOptions = {},
): (tree: Root) => Promise<void> {
  const themeOption = options.themes
    ? { themes: options.themes }
    : { theme: options.theme ?? "github-dark" };
  const defaultLanguage = options.defaultLanguage ?? "text";
  const toHast: ShikiHighlighter["codeToHast"] = options.highlighter
    ? options.highlighter.codeToHast.bind(options.highlighter)
    : codeToHast;

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
          return await toHast(code, { lang, ...themeOption });
        } catch {
          return undefined;
        }
      }
    });

    await Promise.all(jobs.map((job) => job()));
  };
}
