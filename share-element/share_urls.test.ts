import { assertEquals } from "@std/assert";
import { lineShareUrl, threadsShareUrl, xShareUrl } from "./share_urls.ts";

const URL_WITH_SPECIAL_CHARS =
  "https://example.com/posts/1?utm_source=share&ref=x";
const ENCODED = encodeURIComponent(URL_WITH_SPECIAL_CHARS);

Deno.test("xShareUrl encodes the url into the tweet intent", () => {
  assertEquals(
    xShareUrl(URL_WITH_SPECIAL_CHARS),
    `https://twitter.com/intent/tweet?url=${ENCODED}`,
  );
});

Deno.test("lineShareUrl encodes the url into LINE's share intent", () => {
  assertEquals(
    lineShareUrl(URL_WITH_SPECIAL_CHARS),
    `https://social-plugins.line.me/lineit/share?url=${ENCODED}`,
  );
});

Deno.test("threadsShareUrl encodes the url into the post's text", () => {
  assertEquals(
    threadsShareUrl(URL_WITH_SPECIAL_CHARS),
    `https://www.threads.net/intent/post?text=${ENCODED}`,
  );
});
