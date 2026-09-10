/** Splits data codewords into blocks, appends each block's error correction, and interleaves them. */

import {
  ECC_CODEWORDS_PER_BLOCK,
  NUM_ERROR_CORRECTION_BLOCKS,
} from "./tables.ts";
import { computeRemainder, generatorPolynomial } from "./reed_solomon.ts";

/**
 * Per ISO/IEC 18004: the data is split into `numBlocks` blocks, the first (shorter) blocks each
 * getting `floor(total/numBlocks)` codewords and the last, longer blocks one more each, so the
 * lengths add back up to `data.length`.
 */
export function interleave(data: readonly number[], version: number): number[] {
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[version - 1];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version - 1];
  const shortBlockLength = Math.floor(data.length / numBlocks);
  const numLongBlocks = data.length % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;
  const divisor = generatorPolynomial(eccPerBlock);

  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const length = shortBlockLength + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(computeRemainder(block, divisor));
  }

  const result: number[] = [];
  const maxDataLength = shortBlockLength + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLength; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}
