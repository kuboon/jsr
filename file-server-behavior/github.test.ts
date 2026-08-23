import { assertEquals } from "@std/assert";
import { FileServerBehavior } from "./github.ts";
import { FIXTURE_FILES, resolve } from "./_resolve_test_util.ts";

Deno.test("GitHub Pages matches the trailing-slash-guide table", () => {
  const behavior = new FileServerBehavior();
  const cases: [string, ReturnType<typeof resolve>][] = [
    ["/file", { type: "serve", path: "/file.html" }],
    ["/file/", { type: "404" }],
    ["/file.html", { type: "serve", path: "/file.html" }],
    ["/folder", { type: "redirect", target: "/folder/" }],
    ["/folder/", { type: "serve", path: "/folder/index.html" }],
    ["/folder/index.html", { type: "serve", path: "/folder/index.html" }],
    ["/both", { type: "serve", path: "/both.html" }],
    ["/both/", { type: "serve", path: "/both/index.html" }],
    ["/both.html", { type: "serve", path: "/both.html" }],
    ["/both/index.html", { type: "serve", path: "/both/index.html" }],
  ];
  for (const [url_path, expected] of cases) {
    assertEquals(
      resolve(behavior, url_path, FIXTURE_FILES),
      expected,
      url_path,
    );
  }
});
