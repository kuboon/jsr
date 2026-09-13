import { normalizePath } from "../normalize-path.ts";
import * as env from "../env.ts";
import { Instrumentation } from "../instrumentation.ts";
import {
  type __unstable__loadDesignSystem,
  compile,
  loadModule,
} from "../compile.ts";

import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { fromFileUrl } from "@std/path";

/**
 * This package's root directory, so the tests keep working from the workspace
 * root. No trailing slash on purpose: `base` is a directory, and the resolver
 * has to treat it as one either way (see the relative import test below).
 */
const packageRoot = fromFileUrl(new URL("../../", import.meta.url)).replace(
  /[\\/]$/,
  "",
);

Deno.test("normalizePath - basic paths", () => {
  assertEquals(normalizePath("./foo/bar"), "./foo/bar");
  assertEquals(normalizePath("foo\\bar"), "foo/bar");
  assertEquals(normalizePath("/foo/bar"), "/foo/bar");
});

Deno.test("normalizePath - Windows paths", () => {
  assertEquals(normalizePath("C:\\foo\\bar"), "C:/foo/bar");
  assertEquals(normalizePath("foo\\bar\\baz"), "foo/bar/baz");
});

Deno.test("env - DEBUG flag", () => {
  // Should be able to access DEBUG
  assertExists(env.DEBUG !== undefined);
});

Deno.test("Instrumentation - basic functionality", () => {
  const messages: string[] = [];
  const inst = new Instrumentation((msg) => {
    messages.push(msg);
  });

  inst.hit("test-hit");
  inst.start("test-timer");
  inst.end("test-timer");

  inst.report();

  // Should have reported something
  assertEquals(messages.length > 0, true);
  assertEquals(messages[0].includes("test-timer"), true);
});

Deno.test("Instrumentation - nested timers", () => {
  const messages: string[] = [];
  const inst = new Instrumentation((msg) => {
    messages.push(msg);
  });

  inst.start("outer");
  inst.start("inner");
  inst.end("inner");
  inst.end("outer");

  inst.report();

  assertEquals(messages.length > 0, true);
});

Deno.test("compile - basic compilation", async () => {
  const dependencies: string[] = [];
  const options = {
    base: packageRoot,
    onDependency: (path: string) => {
      dependencies.push(path);
    },
  };

  const compiler = await compile(
    "@import 'tailwindcss/index.css'; @plugin 'daisyui'",
    options,
  );
  const built = compiler.build(["flex"]);
  assertStringIncludes(built, "display: flex");
});

Deno.test("compile - resolves a bare package to its CSS entrypoint", async () => {
  // `tailwindcss` exports `index.css` under the `style` condition and
  // `dist/lib.mjs` under `import`; a stylesheet must get the former
  const compiler = await compile(`@import "tailwindcss";`, {
    base: packageRoot,
    onDependency: () => {},
  });

  assertStringIncludes(compiler.build(["flex"]), "display: flex");
});

Deno.test("compile - resolves relative imports against the base directory", async () => {
  const dependencies: string[] = [];
  // No trailing slash: `base` is a directory, not a file
  const options = {
    base: packageRoot,
    onDependency: (path: string) => {
      dependencies.push(path);
    },
  };

  const compiler = await compile(
    `@import "./src/tests/fixtures/a.css";`,
    options,
  );

  // a.css imports ./nested/b.css relative to its own directory
  assertStringIncludes(compiler.build([]), "rebeccapurple");
  assertEquals(
    dependencies.some((path) => path.endsWith("/src/tests/fixtures/a.css")),
    true,
  );
  assertEquals(
    dependencies.some((path) =>
      path.endsWith("/src/tests/fixtures/nested/b.css")
    ),
    true,
  );
});

Deno.test("compile - resolves source() against the base directory", async () => {
  const compiler = await compile(
    `@import "tailwindcss/index.css" source("./src/tests/fixtures");`,
    { base: packageRoot, onDependency: () => {} },
  );

  assertEquals(compiler.root, {
    base: packageRoot,
    pattern: "./src/tests/fixtures",
  });

  // A directory that really is missing must still be rejected
  await assertRejects(
    () =>
      compile(`@import "tailwindcss/index.css" source("./no-such-dir");`, {
        base: packageRoot,
        onDependency: () => {},
      }),
    Error,
    "does not exist or is not a directory",
  );
});

Deno.test("loadModule - loads a module", async () => {
  const dependencies: string[] = [];
  const testModulePath = "./module.ts";
  const baseDir = `${packageRoot}/src/tests/`;

  const result = await loadModule(
    testModulePath,
    baseDir,
    (path: string) => {
      dependencies.push(path);
    },
  );

  // Should return module information
  assertExists(result);
  assertExists(result.path);
  assertExists(result.base);
  assertExists(result.module);

  // Should have loaded the normalizePath function
  assertEquals(typeof result.module.content, "function");
});

Deno.test("loadModule - keeps the @deno/loader failure as `cause`", async () => {
  const id = "@not-a-real-scope/not-a-real-package";
  const error = await assertRejects(
    () => loadModule(id, `${packageRoot}/src/tests/`, () => {}),
    Error,
    `Could not resolve '${id}'`,
  );

  // The reason the loader refused the specifier must not be swallowed
  assertInstanceOf(error.cause, Error);
  assertStringIncludes(error.cause.message, id);
});
