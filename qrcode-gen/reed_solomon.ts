/**
 * Reed–Solomon error correction over GF(256), as fixed by ISO/IEC 18004: primitive polynomial
 * 0x11D, generator element 2.
 */

function gfMultiply(x: number, y: number): number {
  // Russian peasant multiplication, reducing modulo the field's primitive polynomial.
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/**
 * The generator polynomial for `degree` error correction codewords, as coefficients from the
 * highest power down to the constant term, omitting the always-1 leading term of degree `degree`.
 */
export function generatorPolynomial(degree: number): number[] {
  const coefficients = new Array(degree).fill(0);
  coefficients[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < coefficients.length; j++) {
      coefficients[j] = gfMultiply(coefficients[j], root);
      if (j + 1 < coefficients.length) coefficients[j] ^= coefficients[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return coefficients;
}

/** The error correction codewords for one block of data, via polynomial long division. */
export function computeRemainder(
  data: readonly number[],
  divisor: readonly number[],
): number[] {
  const remainder = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    divisor.forEach((coefficient, i) => {
      remainder[i] ^= gfMultiply(coefficient, factor);
    });
  }
  return remainder;
}
