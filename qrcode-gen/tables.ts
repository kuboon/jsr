/**
 * The version-dependent constants that ISO/IEC 18004 fixes for QR Model 2, restricted to error
 * correction level M (the only level this package supports).
 */

/** Reed–Solomon error-correction codewords per block, indexed by version (1–40), for level M. */
export const ECC_CODEWORDS_PER_BLOCK: readonly number[] = [
  10,
  16,
  26,
  18,
  24,
  16,
  18,
  22,
  22,
  26,
  30,
  22,
  22,
  24,
  24,
  28,
  28,
  26,
  26,
  26,
  26,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
  28,
];

/** Number of error-correction blocks, indexed by version (1–40), for level M. */
export const NUM_ERROR_CORRECTION_BLOCKS: readonly number[] = [
  1,
  1,
  1,
  2,
  2,
  4,
  4,
  4,
  5,
  5,
  5,
  8,
  9,
  9,
  10,
  10,
  11,
  13,
  14,
  16,
  17,
  17,
  18,
  20,
  21,
  23,
  25,
  26,
  28,
  29,
  31,
  33,
  35,
  37,
  38,
  40,
  43,
  45,
  47,
  49,
];

/** Number of modules available for data + error correction, before dropping to whole bytes. */
export function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Number of data codewords (excluding error correction) available at level M. */
export function totalDataCodewords(version: number): number {
  const totalCodewords = Math.floor(numRawDataModules(version) / 8);
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[version - 1];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version - 1];
  return totalCodewords - eccPerBlock * numBlocks;
}

/** Row/column coordinates of alignment pattern centers, for a matrix of the given size. */
export function alignmentPatternPositions(
  version: number,
  size: number,
): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step =
    Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}
