import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { DOMParser } from "@b-fuze/deno-dom";

import { elementPath } from "./picker.ts";

const html = `<!doctype html><html><body>
  <header><nav><a>one</a><a>two</a></nav></header>
  <main>
    <form id="settings"><label>Name <input name="name"></label><button>Save</button></form>
    <section><p>a</p><p>b <em id="dup">x</em></p></section>
    <section><p id="dup">c</p><p id="1bad">d</p></section>
  </main>
</body></html>`;

const doc = new DOMParser().parseFromString(html, "text/html");

/** The path, and whether it finds the element again. */
function pathOf(selector: string): string {
  const element = doc.querySelector(selector)!;
  const path = elementPath(element as unknown as Element);
  assertEquals(doc.querySelector(path), element, path);
  return path;
}

describe("elementPath", () => {
  it("stops at a unique id", () => {
    assertEquals(pathOf("#settings button"), "#settings > button");
  });

  it("counts repeated tags among their siblings only", () => {
    assertEquals(
      pathOf("nav a + a"),
      "body > header > nav > a:nth-of-type(2)",
    );
  });

  it("walks past an id that is not unique, or not plain", () => {
    assertEquals(
      pathOf("section + section p + p"),
      "body > main > section:nth-of-type(2) > p:nth-of-type(2)",
    );
    assertEquals(
      pathOf("section em"),
      "body > main > section:nth-of-type(1) > p:nth-of-type(2) > em",
    );
  });

  it("carries nothing of the element's contents", () => {
    const path = pathOf("#settings input");
    assertEquals(path, "#settings > label > input");
  });
});
