import { assertEquals, assertThrows } from "@std/assert";
import { Qrcode } from "@kuboon/qrcode-gen";
import { qrPath } from "./qr.ts";

Deno.test("qrPath draws one square per dark module, inside a 4-module quiet zone", () => {
  const url = "https://example.com/posts/1";
  const { size, matrix } = new Qrcode(url).toJSON();
  const { extent, d } = qrPath(url);
  assertEquals(extent, size + 8);
  const squares = d.match(/M(\d+) (\d+)h1v1h-1z/g) ?? [];
  assertEquals(squares.length, matrix.flat().filter(Boolean).length);
  const coordinates = squares.map((square) =>
    square.match(/\d+/g)!.slice(0, 2).map(Number)
  );
  assertEquals(Math.min(...coordinates.flat()), 4);
  assertEquals(Math.max(...coordinates.flat()), size + 3);
});

Deno.test("qrPath refuses text too long for any QR code", () => {
  assertThrows(() => qrPath("x".repeat(5000)), RangeError);
});
