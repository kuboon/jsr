import type {
  FileServerBehavior as IFileServerBehavior,
  Redirect,
} from "./types.ts";

function hasExtension(path: string): boolean {
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".");
}

/**
 * Replicates GitHub Pages' static file resolution.
 *
 * - `/file.html` (any explicit extension) is served as-is.
 * - `/folder/` serves `/folder/index.html`.
 * - `/file` first tries `/file.html`; if that doesn't exist but
 *   `/file/index.html` does, it redirects to `/file/`.
 *
 * @example
 * ```ts
 * import { FileServerBehavior } from "@kuboon/file-server-behavior/github";
 *
 * new FileServerBehavior().toLocalPaths("/dir/file"); // => ["/dir/file.html", { target: "/dir/file/", path: "/dir/file/index.html" }]
 * ```
 */
export class FileServerBehavior implements IFileServerBehavior {
  toLocalPaths(url_path: string): (string | Redirect)[] {
    if (url_path.endsWith("/")) {
      return [`${url_path}index.html`];
    }
    if (hasExtension(url_path)) {
      return [url_path];
    }
    return [
      `${url_path}.html`,
      { target: `${url_path}/`, path: `${url_path}/index.html` },
    ];
  }
}
