import type { FileServerBehavior, Redirect } from "./types.ts";

export type Resolution =
  | { type: "serve"; path: string }
  | { type: "redirect"; target: string }
  | { type: "404" };

/** Mirrors the caller-side loop a real file server would implement. */
export function resolve(
  behavior: FileServerBehavior,
  url_path: string,
  existingFiles: Set<string>,
): Resolution {
  for (const candidate of behavior.toLocalPaths(url_path)) {
    if (typeof candidate === "string") {
      if (existingFiles.has(candidate)) {
        return { type: "serve", path: candidate };
      }
    } else {
      const r = candidate as Redirect;
      if (r.path === undefined || existingFiles.has(r.path)) {
        return { type: "redirect", target: r.target };
      }
    }
  }
  return { type: "404" };
}

/** The fixture file set used throughout https://github.com/slorber/trailing-slash-guide */
export const FIXTURE_FILES: Set<string> = new Set([
  "/file.html",
  "/folder/index.html",
  "/both.html",
  "/both/index.html",
]);
