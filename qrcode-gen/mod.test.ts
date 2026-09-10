import { assertEquals, assertThrows } from "@std/assert";
import { Qrcode } from "./mod.ts";

Deno.test("module count follows 17 + 4*version, per version", () => {
  for (const version of [1, 2, 7, 10, 40]) {
    const qr = new Qrcode("HELLO", { type: "model2", size: version });
    assertEquals(qr.version, version);
    const { size, matrix } = qr.toJSON();
    assertEquals(size, 17 + 4 * version);
    assertEquals(matrix.length, size);
    for (const row of matrix) assertEquals(row.length, size);
  }
});

Deno.test("auto-selects the smallest version that fits, when size is omitted", () => {
  const qr = new Qrcode("HELLO WORLD");
  assertEquals(qr.version, 1);
});

Deno.test("the always-dark module is set", () => {
  for (const version of [1, 6, 7, 20]) {
    const qr = new Qrcode("x".repeat(5), { size: version });
    const { size, matrix } = qr.toJSON();
    assertEquals(matrix[size - 8][8], true);
  }
});

Deno.test("finder patterns occupy the three non-bottom-right corners", () => {
  const qr = new Qrcode("A", { size: 1 });
  const { size, matrix } = qr.toJSON();
  // A finder pattern's outer ring (offset 3 from its center) is entirely dark.
  function isFinderRing(cx: number, cy: number): boolean {
    for (
      const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3], [
        -3,
        0,
      ], [3, 0]]
    ) {
      if (!matrix[cy + dy][cx + dx]) return false;
    }
    return true;
  }
  assertEquals(isFinderRing(3, 3), true);
  assertEquals(isFinderRing(size - 4, 3), true);
  assertEquals(isFinderRing(3, size - 4), true);
});

Deno.test("toJSON returns an independent copy each time", () => {
  const qr = new Qrcode("HELLO");
  const a = qr.toJSON();
  a.matrix[0][0] = !a.matrix[0][0];
  const b = qr.toJSON();
  assertEquals(b.matrix[0][0], !a.matrix[0][0]);
});

Deno.test("different text produces a different matrix", () => {
  const a = new Qrcode("HELLO", { size: 5 }).toJSON();
  const b = new Qrcode("WORLD", { size: 5 }).toJSON();
  assertEquals(JSON.stringify(a) === JSON.stringify(b), false);
});

Deno.test("rejects an out-of-range size", () => {
  assertThrows(() => new Qrcode("x", { size: 0 }), RangeError);
  assertThrows(() => new Qrcode("x", { size: 41 }), RangeError);
});

Deno.test("rejects text too long for an explicit size", () => {
  assertThrows(() => new Qrcode("x".repeat(1000), { size: 1 }), RangeError);
});

Deno.test("rejects an unsupported type", () => {
  // @ts-expect-error rMQR isn't implemented yet
  assertThrows(() => new Qrcode("x", { type: "rMQR" }), RangeError);
});

Deno.test("encodes byte-mode (non-alphanumeric) text", () => {
  const qr = new Qrcode("hello, 世界!");
  assertEquals(qr.toJSON().size, 17 + 4 * qr.version);
});
