import { assertEquals, assertThrows } from "@std/assert";
import {
  createShareButtons,
  defineShareButtons,
  SHARE_BUTTONS_LABELS,
  shareButtonsLabels,
} from "./mod.ts";

// This file runs under `deno test`, which has no DOM — exactly the environment an SSG/SSR build
// evaluates component modules in. Importing mod.ts must not throw there (it already didn't, or
// this file would have failed to load), and these two entry points must degrade gracefully.

Deno.test("defineShareButtons returns false where there is no DOM", () => {
  assertEquals(defineShareButtons(), false);
});

Deno.test("createShareButtons throws where there is no DOM", () => {
  assertThrows(() => createShareButtons(), Error, "needs a DOM");
});

// The names a row carries come from the language its page declares, so that a Japanese page does
// not have to hand the row a translation to stop saying "Copy URL" in the middle of Japanese.

Deno.test("a language gets its own names", () => {
  assertEquals(shareButtonsLabels("ja").copy, "URL をコピー");
  assertEquals(shareButtonsLabels("en").copy, "Copy URL");
});

Deno.test("the region is not part of the question", () => {
  // `ja-JP` and `ja` want the same words, and the tag's case is not the page's to get right.
  assertEquals(shareButtonsLabels("ja-JP"), shareButtonsLabels("ja"));
  assertEquals(shareButtonsLabels("JA"), shareButtonsLabels("ja"));
});

Deno.test("a language nobody wrote names for reads English", () => {
  // Better than a row of empty tooltips, and better than guessing at a translation.
  assertEquals(shareButtonsLabels("fr"), shareButtonsLabels("en"));
  assertEquals(shareButtonsLabels(""), shareButtonsLabels("en"));
});

Deno.test("brand names are not translated", () => {
  for (const labels of Object.values(SHARE_BUTTONS_LABELS)) {
    assertEquals([labels.x, labels.line, labels.threads], [
      "X",
      "LINE",
      "Threads",
    ]);
  }
});

Deno.test("adding a language is adding a key", () => {
  SHARE_BUTTONS_LABELS.fr = {
    ...SHARE_BUTTONS_LABELS.en,
    share: "Partager",
    copy: "Copier l'URL",
  };
  try {
    assertEquals(shareButtonsLabels("fr-CA").share, "Partager");
  } finally {
    delete SHARE_BUTTONS_LABELS.fr;
  }
});
