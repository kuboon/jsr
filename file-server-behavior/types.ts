/**
 * A redirect candidate. `target` is the URL path to redirect to.
 *
 * When `path` is set, the redirect only fires if a local file at `path`
 * exists — callers must check that before redirecting. When `path` is
 * omitted, the redirect is unconditional (no existence check needed).
 */
export interface Redirect {
  target: string;
  path?: string;
}

/**
 * Resolves a request URL path to an ordered list of local-path candidates.
 *
 * Callers walk the returned array in order:
 * - a `string` entry is a local file path — serve it if it exists
 * - a `Redirect` entry — redirect to `target` if `path` is undefined or
 *   a local file at `path` exists
 * - if nothing in the array matches, respond with 404
 */
export interface FileServerBehavior {
  toLocalPaths(url_path: string): (string | Redirect)[];
}
