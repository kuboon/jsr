import { assertEquals, assertThrows } from "@std/assert";
import { createShareDialog, defineShareDialog } from "./mod.ts";

// This file runs under `deno test`, which has no DOM — exactly the environment an SSG/SSR build
// evaluates component modules in. Importing mod.ts must not throw there (it already didn't, or
// this file would have failed to load), and these two entry points must degrade gracefully.

Deno.test("defineShareDialog returns false where there is no DOM", () => {
  assertEquals(defineShareDialog(), false);
});

Deno.test("createShareDialog throws where there is no DOM", () => {
  assertThrows(() => createShareDialog(), Error, "needs a DOM");
});
