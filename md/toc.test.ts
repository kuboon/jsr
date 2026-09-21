import { assertEquals } from "@std/assert";
import { markdownToHast } from "./mod.ts";
import { tocFromHast } from "./toc.ts";

Deno.test("tocFromHast: one entry per heading, in document order, with depth and id", async () => {
  const hast = await markdownToHast(
    "# Title\n\nIntro text.\n\n## Section One\n\nBody.\n\n### Subsection\n\n## Section Two\n",
  );
  assertEquals(tocFromHast(hast), [
    { depth: 1, id: "user-content-title", text: "Title" },
    { depth: 2, id: "user-content-section-one", text: "Section One" },
    { depth: 3, id: "user-content-subsection", text: "Subsection" },
    { depth: 2, id: "user-content-section-two", text: "Section Two" },
  ]);
});

Deno.test("tocFromHast: collects text through inline formatting and the self-link wrapper", async () => {
  const hast = await markdownToHast("## Hello **World**\n");
  assertEquals(tocFromHast(hast), [
    { depth: 2, id: "user-content-hello-world", text: "Hello World" },
  ]);
});

Deno.test("tocFromHast: returns an empty array for headless documents", async () => {
  const hast = await markdownToHast("Just a paragraph, no headings.");
  assertEquals(tocFromHast(hast), []);
});
