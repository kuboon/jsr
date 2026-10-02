import { Qrcode } from "@kuboon/qrcode-gen";

/** The blank margin a scanner needs around the code, in modules. */
const QUIET_ZONE = 4;

/**
 * A QR code for `text` as SVG path data, one `1×1` square per dark module,
 * offset by the quiet zone.
 *
 * @param text What to encode
 * @returns The side of the square `viewBox` (quiet zone included), and the path's `d`
 * @throws {RangeError} When `text` is too long for any QR code version
 */
export function qrPath(text: string): { extent: number; d: string } {
  const { size, matrix } = new Qrcode(text).toJSON();
  let d = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    })
  );
  return { extent: size + QUIET_ZONE * 2, d };
}
