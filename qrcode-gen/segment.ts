/**
 * Mode selection and bit-stream encoding for QR Model 2, error correction level M.
 */

import { totalDataCodewords } from "./tables.ts";

export type Mode = "numeric" | "alphanumeric" | "byte";

const MODE_INDICATOR: Record<Mode, number> = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
};

const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** Picks the smallest mode (numeric < alphanumeric < byte) that can represent `text` losslessly. */
export function chooseMode(text: string): Mode {
  if ([...text].every((c) => c >= "0" && c <= "9")) return "numeric";
  if ([...text].every((c) => ALPHANUMERIC_CHARSET.includes(c))) {
    return "alphanumeric";
  }
  return "byte";
}

/** Width, in bits, of the character-count indicator for `mode` at `version`. */
function charCountBits(mode: Mode, version: number): number {
  const range = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const widths: Record<Mode, readonly [number, number, number]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
  };
  return widths[mode][range];
}

function dataBitCount(mode: Mode, text: string): number {
  if (mode === "byte") return new TextEncoder().encode(text).length * 8;
  if (mode === "numeric") {
    const n = text.length;
    return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
  }
  const n = text.length;
  return Math.floor(n / 2) * 11 + (n % 2 === 1 ? 6 : 0);
}

/** Total bit length of the mode indicator, character count, and encoded data, at `version`. */
export function segmentBitLength(
  text: string,
  mode: Mode,
  version: number,
): number {
  return 4 + charCountBits(mode, version) + dataBitCount(mode, text);
}

/** The smallest version (1–40) at which `text` fits in `mode`, at error correction level M. */
export function selectVersion(text: string, mode: Mode): number {
  for (let version = 1; version <= 40; version++) {
    if (
      segmentBitLength(text, mode, version) <= totalDataCodewords(version) * 8
    ) return version;
  }
  throw new RangeError(
    "Text is too long to fit in a model2 QR code at any version (1-40) with error correction level M",
  );
}

class BitWriter {
  #bits: number[] = [];

  append(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.#bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.#bits.length;
  }

  toBytes(): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < this.#bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | this.#bits[i + j];
      bytes.push(byte);
    }
    return bytes;
  }
}

function writeSegment(
  text: string,
  mode: Mode,
  version: number,
  bits: BitWriter,
): void {
  bits.append(MODE_INDICATOR[mode], 4);
  if (mode === "byte") {
    const utf8 = new TextEncoder().encode(text);
    bits.append(utf8.length, charCountBits(mode, version));
    for (const byte of utf8) bits.append(byte, 8);
  } else if (mode === "numeric") {
    bits.append(text.length, charCountBits(mode, version));
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      bits.append(Number.parseInt(chunk, 10), chunk.length * 3 + 1);
    }
  } else {
    bits.append(text.length, charCountBits(mode, version));
    let i = 0;
    for (; i + 1 < text.length; i += 2) {
      const value = ALPHANUMERIC_CHARSET.indexOf(text[i]) * 45 +
        ALPHANUMERIC_CHARSET.indexOf(text[i + 1]);
      bits.append(value, 11);
    }
    if (i < text.length) bits.append(ALPHANUMERIC_CHARSET.indexOf(text[i]), 6);
  }
}

/**
 * Builds the padded data codewords for `text` at `version`: the encoded segment, a terminator,
 * padding to a byte boundary, and alternating pad bytes up to the version's full data capacity.
 *
 * @throws {RangeError} If `text` does not fit in `mode` at `version`.
 */
export function buildCodewords(
  text: string,
  mode: Mode,
  version: number,
): number[] {
  const capacityBits = totalDataCodewords(version) * 8;
  const bits = new BitWriter();
  writeSegment(text, mode, version, bits);
  if (bits.length > capacityBits) {
    throw new RangeError(
      `Text does not fit in a model2 QR code of version ${version} at level M`,
    );
  }

  bits.append(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.append(0, 1);

  const bytes = bits.toBytes();
  const padBytes = [0xec, 0x11];
  for (let i = 0; bytes.length < capacityBits / 8; i++) {
    bytes.push(padBytes[i % 2]);
  }
  return bytes;
}
