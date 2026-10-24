import { assertEquals, assertThrows } from "@std/assert";

import {
  chatPanelLabels,
  createChatPanel,
  defineChatPanel,
} from "./element.ts";

// `deno test` has no DOM — the environment an SSG/SSR build evaluates component modules in.
// Importing the element must not throw there, and its entry points must say why they cannot work.

Deno.test("defineChatPanel returns false where there is no DOM", () => {
  assertEquals(defineChatPanel(), false);
});

Deno.test("createChatPanel throws where there is no DOM", () => {
  assertThrows(() => createChatPanel(), Error, "needs a DOM");
});

Deno.test("names come from the language, region and case aside", () => {
  assertEquals(chatPanelLabels("ja-JP").send, "送信");
  assertEquals(chatPanelLabels("EN").send, "Send");
  assertEquals(chatPanelLabels("xx").send, "Send");
});
