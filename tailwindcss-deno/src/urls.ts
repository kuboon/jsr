// Inlined version of code from Vite <https://github.com/vitejs/vite>
// Copyright (c) 2019-present, VoidZero Inc. and Vite contributors
// Released under the MIT License.
//
// Minor modifications have been made to work with Tailwind CSS and Deno

import { join, relative } from "@std/path";
import { normalizePath } from "./normalize-path.ts";

const cssUrlRE =
  /(?<!@import\s+)(?<=^|[^\w\-\u0080-\uffff])url\((\s*('[^']+'|"[^"]+")\s*|[^'")]+)\)/;
// Note: Simplified regex to avoid ReDoS vulnerability
// Original pattern had nested quantifiers that could cause exponential backtracking
const cssImageSetRE = /(?<=image-set\()([^)]+)(?=\))/;
const cssNotProcessedRE = /(?:gradient|element|cross-fade|image)\(/;

const dataUrlRE = /^\s*data:/i;
const externalRE = /^([a-z]+:)?\/\//;
const functionCallRE = /^[A-Z_][.\w-]*\(/i;

const imageCandidateRE =
  /(?:^|\s)(?<url>[\w-]+\([^)]*\)|"[^"]*"|'[^']*'|[^,]\S*[^,])\s*(?:\s(?<descriptor>\w[^,]+))?(?:,|$)/g;
const nonEscapedDoubleQuoteRE = /(?<!\\)"/g;
const escapedSpaceCharactersRE = /(?: |\\t|\\n|\\f|\\r)+/g;

const isDataUrl = (url: string): boolean => dataUrlRE.test(url);
const isExternalUrl = (url: string): boolean => externalRE.test(url);

type CssUrlReplacer = (
  url: string,
  importer?: string,
) => string | Promise<string>;

interface ImageCandidate {
  url: string;
  descriptor: string;
}

// Simplified URL rewriting for Deno - requires tailwindcss CSS parser
export async function rewriteUrls({
  css,
  base,
  root,
}: {
  css: string;
  base: string;
  root: string;
}): Promise<string> {
  if (!css.includes("url(") && !css.includes("image-set(")) {
    return css;
  }

  // Note: This is a simplified version. For full functionality,
  // would need to integrate with tailwindcss CSS parser
  // For now, returning unchanged CSS
  // TODO: Integrate with tailwindcss parse/walk/toCss when available

  function replacerForDeclaration(url: string) {
    if (url[0] === "/") return url;

    const absoluteUrl = join(normalizePath(base), url).replace(/\\/g, "/");
    let relativeUrl = relative(normalizePath(root), absoluteUrl).replace(
      /\\/g,
      "/",
    );

    // If the path points to a file in the same directory, `path.relative` will
    // remove the leading `./` and we need to add it back in order to still
    // consider the path relative
    if (!relativeUrl.startsWith(".")) {
      relativeUrl = "./" + relativeUrl;
    }

    return relativeUrl;
  }

  // Basic URL rewriting without full AST parsing
  let result = css;

  result = await rewriteCssUrls(result, replacerForDeclaration);
  result = await rewriteCssImageSet(result, replacerForDeclaration);

  return result;
}

function rewriteCssUrls(
  css: string,
  replacer: CssUrlReplacer,
): Promise<string> {
  return asyncReplace(css, cssUrlRE, async (match) => {
    const [matched, rawUrl] = match;
    return await doUrlReplace(rawUrl.trim(), matched, replacer);
  });
}

async function rewriteCssImageSet(
  css: string,
  replacer: CssUrlReplacer,
): Promise<string> {
  return await asyncReplace(css, cssImageSetRE, async (match) => {
    const [, rawUrl] = match;
    const url = await processSrcSet(rawUrl, async ({ url }) => {
      // the url maybe url(...)
      if (cssUrlRE.test(url)) {
        return await rewriteCssUrls(url, replacer);
      }
      if (!cssNotProcessedRE.test(url)) {
        return await doUrlReplace(url, url, replacer);
      }
      return url;
    });
    return url;
  });
}

async function doUrlReplace(
  rawUrl: string,
  matched: string,
  replacer: CssUrlReplacer,
  funcName: string = "url",
) {
  let wrap = "";
  const first = rawUrl[0];
  if (first === `"` || first === `'`) {
    wrap = first;
    rawUrl = rawUrl.slice(1, -1);
  }

  if (skipUrlReplacer(rawUrl)) {
    return matched;
  }

  let newUrl = await replacer(rawUrl);
  // The new url might need wrapping even if the original did not have it, e.g. if a space was added during replacement
  if (wrap === "" && newUrl !== encodeURI(newUrl)) {
    wrap = '"';
  }
  // If wrapping in single quotes and newUrl also contains single quotes, switch to double quotes.
  // Give preference to double quotes since SVG inlining converts double quotes to single quotes.
  if (wrap === "'" && newUrl.includes("'")) {
    wrap = '"';
  }
  // Escape double quotes if they exist (they also tend to be rarer than single quotes)
  if (wrap === '"' && newUrl.includes('"')) {
    newUrl = newUrl.replace(nonEscapedDoubleQuoteRE, '\\"');
  }
  return `${funcName}(${wrap}${newUrl}${wrap})`;
}

function skipUrlReplacer(rawUrl: string) {
  return (
    isExternalUrl(rawUrl) ||
    isDataUrl(rawUrl) ||
    !rawUrl[0].match(/[\.a-zA-Z0-9_]/) ||
    functionCallRE.test(rawUrl)
  );
}

function processSrcSet(
  srcs: string,
  replacer: (arg: ImageCandidate) => Promise<string>,
): Promise<string> {
  return Promise.all(
    parseSrcset(srcs).map(async ({ url, descriptor }) => ({
      url: await replacer({ url, descriptor }),
      descriptor,
    })),
  ).then(joinSrcset);
}

function parseSrcset(string: string): ImageCandidate[] {
  const matches = string
    .trim()
    .replace(escapedSpaceCharactersRE, " ")
    .replace(/\r?\n/, "")
    .replace(/,\s+/, ", ")
    .replaceAll(/\s+/g, " ")
    .matchAll(imageCandidateRE);
  return Array.from(matches, ({ groups }) => ({
    url: groups?.url?.trim() ?? "",
    descriptor: groups?.descriptor?.trim() ?? "",
  })).filter(({ url }) => !!url);
}

function joinSrcset(ret: ImageCandidate[]) {
  return ret.map(({ url, descriptor }) =>
    url + (descriptor ? ` ${descriptor}` : "")
  ).join(", ");
}

async function asyncReplace(
  input: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => string | Promise<string>,
): Promise<string> {
  let match: RegExpExecArray | null;
  let remaining = input;
  let rewritten = "";
  while ((match = re.exec(remaining))) {
    rewritten += remaining.slice(0, match.index);
    rewritten += await replacer(match);
    remaining = remaining.slice(match.index + match[0].length);
  }
  rewritten += remaining;
  return rewritten;
}
