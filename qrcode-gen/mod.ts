/**
 * A zero-dependency QR code encoder. It only computes the module grid — turning that into an SVG,
 * a canvas, or any other picture is left to the caller.
 *
 * Only QR Model 2 is implemented so far, at error correction level M.
 *
 * @example
 * ```ts
 * import { Qrcode } from "@kuboon/qrcode-gen";
 *
 * const qr = new Qrcode("https://example.com", { type: "model2" });
 * const modules = qr.toJSON(); // boolean[][], true = dark module
 * ```
 */

import { buildCodewords, chooseMode, selectVersion } from "./segment.ts";
import { interleave } from "./interleave.ts";
import { buildMatrix } from "./matrix.ts";

/** The QR variant to encode as. Only `"model2"` is implemented; `"rMQR"` is planned. */
export type QrcodeType = "model2";

/** Options for {@link Qrcode}. */
export type QrcodeOptions = {
  /** The QR variant. Defaults to `"model2"`. */
  type?: QrcodeType;
  /**
   * The model2 version, 1 to 40 (a higher version is a bigger, higher-capacity symbol). Defaults
   * to the smallest version that fits `text` at error correction level M.
   */
  size?: number;
};

/**
 * A QR code, encoded at construction time.
 *
 * The encoding mode (numeric, alphanumeric, or byte) is chosen automatically from `text`'s
 * content, and the error correction level is fixed at M.
 */
export class Qrcode {
  /** The model2 version this symbol was encoded at. */
  readonly version: number;
  #modules: boolean[][];

  constructor(text: string, options: QrcodeOptions = {}) {
    const type = options.type ?? "model2";
    if (type !== "model2") {
      throw new RangeError(
        `Unsupported type "${type}". Only "model2" is currently implemented.`,
      );
    }

    const mode = chooseMode(text);
    this.version = options.size ?? selectVersion(text, mode);
    if (this.version < 1 || this.version > 40) {
      throw new RangeError(
        `size must be between 1 and 40, got ${this.version}`,
      );
    }

    const dataCodewords = buildCodewords(text, mode, this.version);
    const allCodewords = interleave(dataCodewords, this.version);
    this.#modules = buildMatrix(this.version, allCodewords);
  }

  /** The module grid, `[row][column]`, `true` for a dark module. */
  toJSON(): boolean[][] {
    return this.#modules.map((row) => row.slice());
  }
}
