import { assertEquals } from "@std/assert";
import { test } from "./cloudflareKv.ts";
import type { KvKey } from "./types.ts";

Deno.test("keyToString -> stringToKey で KvKey を復元できる", () => {
  const original: KvKey = [
    "folder/name",
    "a:b/c",
    42,
    0,
    -12.5,
    9007199254740993n,
    true,
    false,
  ];

  const serialized = test.keyToString(original);
  const restored = test.stringToKey(serialized);

  assertEquals(restored, original);
});

Deno.test("stringToKey -> keyToString で文字列表現を復元できる", () => {
  const encoded = [
    "s:folder%2Fname",
    "s:a%3Ab%2Fc",
    "n:42",
    "n:0",
    "n:-12.5",
    "i:9007199254740993",
    "b:1",
    "b:0",
  ].join("/");

  const parsed = test.stringToKey(encoded);
  const reSerialized = test.keyToString(parsed);

  assertEquals(reSerialized, encoded);
});
