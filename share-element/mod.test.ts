import { assertEquals, assertThrows } from "@std/assert";
import { createShareButtons, defineShareButtons } from "./mod.ts";

// This file runs under `deno test`, which has no DOM — exactly the environment an SSG/SSR build
// evaluates component modules in. Importing mod.ts must not throw there (it already didn't, or
// this file would have failed to load), and these two entry points must degrade gracefully.

Deno.test("defineShareButtons returns false where there is no DOM", () => {
  assertEquals(defineShareButtons(), false);
});

Deno.test("createShareButtons throws where there is no DOM", () => {
  assertThrows(() => createShareButtons(), Error, "needs a DOM");
});
