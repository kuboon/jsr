import { assertEquals, assertThrows } from "@std/assert";
import { buildCodewords, chooseMode, selectVersion } from "./segment.ts";
import { totalDataCodewords } from "./tables.ts";

Deno.test("chooseMode picks the narrowest mode that fits", () => {
  assertEquals(chooseMode("0123456789"), "numeric");
  assertEquals(chooseMode("HELLO WORLD"), "alphanumeric");
  assertEquals(chooseMode("hello world"), "byte");
  assertEquals(chooseMode("こんにちは"), "byte");
});

Deno.test("selectVersion: version 1-M numeric capacity is 34 digits", () => {
  assertEquals(selectVersion("1".repeat(34), "numeric"), 1);
  assertEquals(selectVersion("1".repeat(35), "numeric"), 2);
});

Deno.test("selectVersion: version 2-M numeric capacity is 63 digits", () => {
  assertEquals(selectVersion("1".repeat(63), "numeric"), 2);
  assertEquals(selectVersion("1".repeat(64), "numeric"), 3);
});

Deno.test("selectVersion picks larger versions for less efficient modes", () => {
  const digits = "1".repeat(50);
  const numericVersion = selectVersion(digits, "numeric");
  const byteVersion = selectVersion(digits, "byte");
  assertEquals(numericVersion < byteVersion, true);
});

Deno.test("buildCodewords fills exactly the version's data capacity", () => {
  for (const version of [1, 2, 5, 10]) {
    const codewords = buildCodewords("HELLO WORLD", "alphanumeric", version);
    assertEquals(codewords.length, totalDataCodewords(version));
  }
});

Deno.test("buildCodewords throws when the text does not fit the given version", () => {
  assertThrows(() => buildCodewords("1".repeat(100), "numeric", 1), RangeError);
});
