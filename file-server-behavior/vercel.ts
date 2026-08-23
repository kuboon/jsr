import type {
  FileServerBehavior as IFileServerBehavior,
  Redirect,
} from "./types.ts";

export interface VercelOptions {
  /** Serve/redirect extensionless URLs (`/about`) instead of `.html` files. Default `false`. */
  cleanUrls?: boolean;
  /**
   * `true` enforces a trailing slash on directory-style URLs, `false` enforces no
   * trailing slash. `undefined` (default) enforces neither.
   */
  trailingSlash?: boolean;
}

function stripHtmlSuffix(
  url_path: string,
): { noSlash: string; withSlash: string } {
  if (url_path.endsWith("/index.html")) {
    const withSlash = url_path.slice(0, -"index.html".length);
    return { noSlash: withSlash.slice(0, -1), withSlash };
  }
  const noSlash = url_path.slice(0, -".html".length);
  return { noSlash, withSlash: `${noSlash}/` };
}

/**
 * Replicates Vercel's static file resolution, per
 * {@link https://github.com/slorber/trailing-slash-guide}.
 *
 * @example
 * ```ts
 * import { FileServerBehavior } from "@kuboon/file-server-behavior/vercel";
 *
 * new FileServerBehavior({ cleanUrls: false, trailingSlash: undefined });
 * ```
 */
export class FileServerBehavior implements IFileServerBehavior {
  #cleanUrls: boolean;
  #trailingSlash?: boolean;

  constructor(options: VercelOptions = {}) {
    this.#cleanUrls = options.cleanUrls ?? false;
    this.#trailingSlash = options.trailingSlash;
  }

  toLocalPaths(url_path: string): (string | Redirect)[] {
    if (url_path.endsWith(".html")) {
      return this.#fromHtmlPath(url_path);
    }
    return this.#fromExtensionlessPath(url_path);
  }

  #fromHtmlPath(url_path: string): (string | Redirect)[] {
    if (!this.#cleanUrls) {
      return [url_path];
    }
    const { noSlash, withSlash } = stripHtmlSuffix(url_path);
    const target = this.#trailingSlash === true ? withSlash : noSlash;
    return [{ target, path: url_path }];
  }

  #fromExtensionlessPath(url_path: string): (string | Redirect)[] {
    const hasSlash = url_path.endsWith("/");
    const base = hasSlash ? url_path.slice(0, -1) : url_path;
    const dirIndexPath = `${base}/index.html`;
    const contentPaths = this.#cleanUrls && base !== ""
      ? [`${base}.html`, dirIndexPath]
      : [dirIndexPath];

    if (this.#trailingSlash === undefined) {
      return contentPaths;
    }
    const desired = this.#trailingSlash ? `${base}/` : base;
    if (url_path === desired) {
      return contentPaths;
    }
    return contentPaths.map((path) => ({ target: desired, path }));
  }
}
