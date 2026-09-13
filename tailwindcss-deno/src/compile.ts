import { dirname, join } from "@std/path";
import { toFileUrl } from "@std/path/to-file-url";
import { ResolutionMode, Workspace } from "@deno/loader";
import { DEBUG } from "./env.ts";
import { getModuleDependencies } from "./get-module-dependencies.ts";
import { rewriteUrls } from "./urls.ts";
import {
  __unstable__loadDesignSystem as ___unstable__loadDesignSystem,
  compile as _compile,
  compileAst as _compileAst,
  type Config,
  Features,
  Polyfills,
} from "tailwindcss";

export { Features, Polyfills };

/**
 * Type definition for a custom module resolver function.
 *
 * @param id - The module identifier to resolve
 * @param base - The base path to resolve from
 * @returns The resolved path, false if ignored, or undefined if not found
 */
export type Resolver = (
  id: string,
  base: string,
) => Promise<string | false | undefined>;

/**
 * Options for configuring the Tailwind CSS compiler.
 */
export interface CompileOptions {
  /** Base directory for resolving imports */
  base: string;
  /** Source file path */
  from?: string;
  /** Callback for each dependency found */
  onDependency: (path: string) => void;
  /** Whether to rewrite URLs in CSS */
  shouldRewriteUrls?: boolean;
  /** CSS polyfills to apply */
  polyfills?: Polyfills;

  /** Custom CSS module resolver */
  customCssResolver?: Resolver;
  /** Custom JS module resolver */
  customJsResolver?: Resolver;
}

function createCompileOptions({
  base,
  from,
  polyfills,
  onDependency,
  shouldRewriteUrls,

  customCssResolver,
  customJsResolver,
}: CompileOptions) {
  return {
    base,
    polyfills,
    from,
    loadModule(id: string, base: string) {
      return loadModule(id, base, onDependency, customJsResolver);
    },
    async loadStylesheet(id: string, sheetBase: string) {
      const sheet = await loadStylesheet(
        id,
        sheetBase,
        onDependency,
        customCssResolver,
      );

      if (shouldRewriteUrls) {
        sheet.content = await rewriteUrls({
          css: sheet.content,
          root: base,
          base: sheet.base,
        });
      }

      return sheet;
    },
  };
}

async function ensureSourceDetectionRootExists(compiler: {
  root: Awaited<ReturnType<typeof compile>>["root"];
}) {
  // Verify if the `source(…)` path exists (until the glob pattern starts)
  if (compiler.root && compiler.root !== "none") {
    const globSymbols = /[*{]/;
    const basePath = [];
    for (const segment of compiler.root.pattern.split("/")) {
      if (globSymbols.test(segment)) {
        break;
      }

      basePath.push(segment);
    }

    let exists = false;
    try {
      // `root.base` is the directory of the stylesheet that declared `source()`
      const stat = await Deno.stat(join(compiler.root.base, ...basePath));
      exists = stat.isDirectory;
    } catch {
      exists = false;
    }

    if (!exists) {
      throw new Error(
        `The \`source(${compiler.root.pattern})\` does not exist or is not a directory.`,
      );
    }
  }
}

/**
 * Compiles a Tailwind CSS AST with the given options.
 *
 * @param ast - The AST nodes to compile
 * @param options - Compilation options
 * @returns A compiler instance
 */
export async function compileAst(
  ast: Parameters<typeof _compileAst>[0],
  options: CompileOptions,
): Promise<Awaited<ReturnType<typeof _compileAst>>> {
  const compiler = await _compileAst(ast, createCompileOptions(options));
  await ensureSourceDetectionRootExists(compiler);
  return compiler;
}

/**
 * Compiles Tailwind CSS from a string with the given options.
 *
 * @param css - The CSS string to compile
 * @param options - Compilation options
 * @returns A compiler instance
 */
export async function compile(
  css: string,
  options: CompileOptions,
): Promise<Awaited<ReturnType<typeof _compile>>> {
  const compiler = await _compile(css, createCompileOptions(options));
  await ensureSourceDetectionRootExists(compiler);
  return compiler;
}

/**
 * Loads a design system from CSS (unstable API).
 *
 * @param css - The CSS string containing design system definitions
 * @param options - Load options including base path
 * @returns A design system object
 */
export async function __unstable__loadDesignSystem(
  css: string,
  { base }: { base: string },
): Promise<Awaited<ReturnType<typeof ___unstable__loadDesignSystem>>> {
  return await ___unstable__loadDesignSystem(css, {
    base,
    loadModule(id, base) {
      return loadModule(id, base, () => {});
    },
    loadStylesheet(id, base) {
      return loadStylesheet(id, base, () => {});
    },
  });
}

/**
 * Loads a module for Tailwind CSS configuration or plugins.
 *
 * @param id - The module identifier
 * @param base - The base path
 * @param onDependency - Callback for dependencies
 * @param customJsResolver - Custom JS resolver
 * @returns The loaded module
 */
export async function loadModule(
  id: string,
  base: string,
  onDependency: (path: string) => void,
  customJsResolver?: Resolver,
): Promise<{ path: string; base: string; module: Config }> {
  if (id[0] !== ".") {
    const resolvedPath = await resolveJsId(id, base, customJsResolver);
    if (!resolvedPath) {
      throw new Error(`Could not resolve '${id}' from '${base}'`);
    }

    const module = await importModule(toModuleUrl(resolvedPath).href);
    const moduleWithDefault = module as Config & { default?: Config };
    return {
      path: resolvedPath,
      base: dirname(resolvedPath),
      module: moduleWithDefault.default ?? module,
    };
  }

  const resolvedPath = await resolveJsId(id, base, customJsResolver);
  if (!resolvedPath) {
    throw new Error(`Could not resolve '${id}' from '${base}'`);
  }

  // Bust the module cache so edits to a config/plugin are picked up on rebuild
  const url = toModuleUrl(resolvedPath);
  url.searchParams.set("id", String(Date.now()));

  const [module, moduleDependencies] = await Promise.all([
    importModule(url.href),
    getModuleDependencies(resolvedPath),
  ]);

  for (const file of moduleDependencies) {
    onDependency(file);
  }
  return {
    path: resolvedPath,
    base: dirname(resolvedPath),
    module: (module as { default?: unknown }).default ?? module,
  };
}

async function loadStylesheet(
  id: string,
  base: string,
  onDependency: (path: string) => void,
  cssResolver?: Resolver,
) {
  const resolvedPath = await resolveCssId(id, base, cssResolver);
  if (!resolvedPath) {
    throw new Error(`Could not resolve '${id}' from '${base}'`);
  }

  onDependency(resolvedPath);

  const file = await Deno.readTextFile(resolvedPath);
  return {
    path: resolvedPath,
    base: dirname(resolvedPath),
    content: file,
  };
}

/**
 * Turn a resolution result into the URL to import it from.
 *
 * `resolveJsId` returns a local path for `file:` modules, but hands back the
 * URL itself for anything else (`https:`, ...), which `toFileUrl` rejects.
 */
function toModuleUrl(resolvedPath: string): URL {
  return resolvedPath.includes("://")
    ? new URL(resolvedPath)
    : toFileUrl(resolvedPath);
}

/**
 * Import a module that `resolveJsId` already resolved.
 *
 * `deno publish` reports this dynamic import as `unanalyzable-dynamic-import`,
 * warning that specifiers coming from the local import map stop working once
 * the package is published. That does not apply here: the specifier is always
 * an absolute URL built by `toModuleUrl`, so it never goes through this
 * package's import map. The check below keeps it that way.
 */
async function importModule(url: string): Promise<Config> {
  if (!url.includes("://")) {
    throw new Error(`Expected an absolute URL to import, got '${url}'`);
  }

  try {
    return await import(url);
  } catch (error) {
    // For TypeScript files or special module formats, try with import maps
    console.error(`Failed to import ${url}:`, error);
    throw error;
  }
}

// Create a Deno loader workspace for module resolution
let workspace: Workspace | null = null;
let cssWorkspace: Workspace | null = null;

function getWorkspace() {
  if (!workspace) {
    workspace = new Workspace();
  }
  return workspace;
}

/**
 * Workspace used to resolve stylesheets.
 *
 * CSS has to be resolved under the `style` export condition, the same one
 * Tailwind's own resolver uses. Without it `@import "tailwindcss"` picks the
 * `import` condition and lands on the JavaScript entrypoint (`dist/lib.mjs`),
 * which then fails to parse as CSS.
 */
function getCssWorkspace() {
  if (!cssWorkspace) {
    cssWorkspace = new Workspace({ nodeConditions: ["style"] });
  }
  return cssWorkspace;
}

/**
 * Turn a base *directory* into the referrer URL to resolve against.
 *
 * `base` is always a directory (`compile()` takes one, and `loadModule` /
 * `loadStylesheet` hand back `dirname(resolvedPath)`), but a `file:` URL
 * without a trailing slash is a file: resolving `./a.css` against
 * `file:///project` yields `file:///a.css` instead of `file:///project/a.css`.
 */
function toBaseUrl(base: string): URL {
  const url = toFileUrl(base);
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

/**
 * Report a @deno/loader failure that the file system fallback recovered from.
 *
 * The fallback keeps compilation going, but the original error is the only
 * place that explains *why* the loader refused the specifier (a version blocked
 * by `minimumDependencyAge`, a missing lockfile entry, ...), so it is logged
 * instead of dropped.
 */
function debugLoaderFallback(id: string, base: string, cause: unknown): void {
  if (!DEBUG) return;
  console.warn(
    `@deno/loader could not resolve '${id}' from '${base}', falling back to file system resolution:`,
    cause,
  );
}

/**
 * Build the error for a specifier that neither @deno/loader nor the file system
 * fallback could resolve, keeping the loader failure as `cause`.
 */
function unresolvedError(id: string, base: string, cause: unknown): Error {
  return new Error(`Could not resolve '${id}' from '${base}'`, { cause });
}

async function resolveCssId(
  id: string,
  base: string,
  customCssResolver?: Resolver,
): Promise<string | false | undefined> {
  if (customCssResolver) {
    const customResolution = await customCssResolver(id, base);
    if (customResolution) {
      return customResolution;
    }
  }

  // Use @deno/loader for CSS resolution
  try {
    const ws = await getCssWorkspace();
    const loader = await ws.createLoader();

    const resolved = await loader.resolve(
      id,
      toBaseUrl(base).href,
      ResolutionMode.Import,
    );
    if (resolved) {
      return new URL(resolved).pathname;
    }
  } catch (error) {
    // Fall back to simple file resolution
    const simplePath = join(base, id);
    try {
      await Deno.stat(simplePath);
    } catch {
      throw unresolvedError(id, base, error);
    }
    debugLoaderFallback(id, base, error);
    return simplePath;
  }

  return undefined;
}

async function resolveJsId(
  id: string,
  base: string,
  customJsResolver?: Resolver,
): Promise<string | false | undefined> {
  if (customJsResolver) {
    const customResolution = await customJsResolver(id, base);
    if (customResolution) {
      return customResolution;
    }
  }

  // Use @deno/loader for JS/TS resolution
  try {
    const ws = await getWorkspace();
    const loader = await ws.createLoader();

    const resolved = await loader.resolve(
      id,
      toBaseUrl(base).href,
      ResolutionMode.Import,
    );
    if (resolved) {
      // Convert file:// URL to local path
      const url = new URL(resolved);
      if (url.protocol === "file:") {
        return url.pathname;
      }
      return resolved;
    }
  } catch (error) {
    // Fall back to simple file resolution for relative paths
    if (id.startsWith(".")) {
      const simplePath = join(base, id);
      // The bare path first, then the same path with common extensions
      const candidates = [
        simplePath,
        ...[".ts", ".js", ".tsx", ".jsx", ".mts", ".mjs"].map((ext) =>
          simplePath + ext
        ),
      ];

      for (const candidate of candidates) {
        try {
          await Deno.stat(candidate);
        } catch {
          // Not this one, keep trying
          continue;
        }
        debugLoaderFallback(id, base, error);
        return candidate;
      }
    }

    throw unresolvedError(id, base, error);
  }

  return undefined;
}
