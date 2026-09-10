/**
 * Assembles a QR Model 2 symbol: function patterns, codeword placement, mask selection, and
 * format/version information, per ISO/IEC 18004.
 */

import { alignmentPatternPositions } from "./tables.ts";

type Grid = boolean[][];

function emptyGrid(size: number): Grid {
  return Array.from(
    { length: size },
    () => new Array<boolean>(size).fill(false),
  );
}

function drawFinderPattern(
  modules: Grid,
  isFunction: Grid,
  size: number,
  cx: number,
  cy: number,
): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      modules[y][x] = dist !== 2 && dist !== 4;
      isFunction[y][x] = true;
    }
  }
}

function drawAlignmentPattern(
  modules: Grid,
  isFunction: Grid,
  cx: number,
  cy: number,
): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      modules[cy + dy][cx + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      isFunction[cy + dy][cx + dx] = true;
    }
  }
}

function drawFunctionPatterns(
  version: number,
  size: number,
): { modules: Grid; isFunction: Grid } {
  const modules = emptyGrid(size);
  const isFunction = emptyGrid(size);

  for (let i = 0; i < size; i++) {
    modules[6][i] = i % 2 === 0;
    isFunction[6][i] = true;
    modules[i][6] = i % 2 === 0;
    isFunction[i][6] = true;
  }

  drawFinderPattern(modules, isFunction, size, 3, 3);
  drawFinderPattern(modules, isFunction, size, size - 4, 3);
  drawFinderPattern(modules, isFunction, size, 3, size - 4);

  const alignPos = alignmentPatternPositions(version, size);
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const isFinderCorner = (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0);
      if (!isFinderCorner) {
        drawAlignmentPattern(modules, isFunction, alignPos[i], alignPos[j]);
      }
    }
  }

  // Reserve the format info area (drawn for real, per candidate mask, during mask selection).
  for (let i = 0; i <= 8; i++) {
    isFunction[8][i] = true;
    isFunction[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }
  for (let i = 8; i < 15; i++) isFunction[size - 15 + i][8] = true;
  modules[size - 8][8] = true; // The one always-dark module.

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      isFunction[b][a] = true;
      isFunction[a][b] = true;
    }
  }

  return { modules, isFunction };
}

function placeCodewords(
  modules: Grid,
  isFunction: Grid,
  size: number,
  codewords: readonly number[],
): void {
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] =
            ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }
}

function applyMask(
  modules: Grid,
  isFunction: Grid,
  size: number,
  mask: number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert: boolean;
      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = (x * y) % 2 + (x * y) % 3 === 0;
          break;
        case 6:
          invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0;
          break;
        default:
          invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
          break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

/** Format info for error correction level M (formatBits 0b00) and the given mask, BCH-encoded. */
function drawFormatInfo(modules: Grid, size: number, mask: number): void {
  const data = mask; // (level M's 2-bit indicator, 00, shifted in contributes nothing)
  let remainder = data;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
}

function drawVersionInfo(modules: Grid, size: number, version: number): void {
  if (version < 7) return;
  let remainder = version;
  for (let i = 0; i < 12; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i < 18; i++) {
    const color = bit(i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = color;
    modules[a][b] = color;
  }
}

function computePenalty(modules: Grid, size: number): number {
  const N1 = 3, N2 = 3, N3 = 40, N4 = 10;
  let result = 0;

  function countFinderLikePatterns(history: readonly number[]): number {
    const n = history[1];
    const core = n > 0 && history[2] === n && history[3] === n * 3 &&
      history[4] === n &&
      history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
      (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  }
  function scoreLine(getColor: (i: number) => boolean): void {
    let runColor = false;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    let bordered = false;
    const pushRun = (length: number) => {
      if (!bordered) {
        length += size;
        bordered = true;
      }
      history.pop();
      history.unshift(length);
    };
    for (let i = 0; i < size; i++) {
      const color = getColor(i);
      if (color === runColor) {
        runLength++;
        if (runLength === 5) result += N1;
        else if (runLength > 5) result++;
      } else {
        pushRun(runLength);
        if (!runColor) result += countFinderLikePatterns(history) * N3;
        runColor = color;
        runLength = 1;
      }
    }
    let finalLength = runLength;
    if (runColor) {
      pushRun(finalLength);
      finalLength = 0;
    }
    pushRun(finalLength + size);
    result += countFinderLikePatterns(history) * N3;
  }

  for (let y = 0; y < size; y++) scoreLine((x) => modules[y][x]);
  for (let x = 0; x < size; x++) scoreLine((y) => modules[y][x]);

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] && color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        result += N2;
      }
    }
  }

  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * N4;

  return result;
}

/** Builds the final module grid for `codewords` at `version`, choosing the best of the 8 masks. */
export function buildMatrix(
  version: number,
  codewords: readonly number[],
): boolean[][] {
  const size = 17 + 4 * version;
  const { modules: base, isFunction } = drawFunctionPatterns(version, size);
  placeCodewords(base, isFunction, size, codewords);

  let best: { mask: number; modules: Grid; penalty: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const trial = base.map((row) => row.slice());
    applyMask(trial, isFunction, size, mask);
    drawFormatInfo(trial, size, mask);
    const penalty = computePenalty(trial, size);
    if (best === null || penalty < best.penalty) {
      best = { mask, modules: trial, penalty };
    }
  }

  drawVersionInfo(best!.modules, size, version);
  return best!.modules;
}
