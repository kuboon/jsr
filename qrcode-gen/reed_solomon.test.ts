import { assertEquals } from "@std/assert";
import { computeRemainder, generatorPolynomial } from "./reed_solomon.ts";

Deno.test("computeRemainder: appending it to the data divides evenly by the generator", () => {
  for (const eccLength of [7, 10, 13, 18, 30]) {
    const divisor = generatorPolynomial(eccLength);
    const data = [72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33];
    const remainder = computeRemainder(data, divisor);
    assertEquals(remainder.length, eccLength);

    const codeword = [...data, ...remainder];
    const remainderOfCodeword = computeRemainder(codeword, divisor);
    assertEquals(remainderOfCodeword, remainder.map(() => 0));
  }
});

Deno.test("generatorPolynomial: has one coefficient per non-leading term", () => {
  for (const degree of [1, 5, 26]) {
    assertEquals(generatorPolynomial(degree).length, degree);
  }
});
