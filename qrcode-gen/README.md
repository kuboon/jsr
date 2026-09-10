# @kuboon/qrcode-gen

A zero-dependency QR code encoder. It only computes the module grid — turning
that into an SVG, a `<canvas>` drawing, a PNG, or anything else is left to the
caller, unlike most QR libraries that bundle a renderer.

## Usage

```ts
import { Qrcode } from "@kuboon/qrcode-gen";

const qr = new Qrcode("https://example.com", { type: "model2" });
const modules = qr.toJSON(); // boolean[][], [row][column], true = dark module
```

`type` and `size` are both optional:

- `type` selects the QR variant. Only `"model2"` (the everyday square QR code)
  is implemented so far; `"rMQR"` (rectangular Micro QR) is planned.
- `size` is the model2 version, `1`–`40`. Left unset, the smallest version that
  fits the text is chosen automatically.

```ts ignore
new Qrcode("HELLO WORLD", { size: 5 });
```

## Encoding

The mode — numeric, alphanumeric, or byte (UTF-8) — is chosen automatically from
the text, using whichever is most compact:

| Mode         | Content                                      |
| ------------ | -------------------------------------------- |
| numeric      | digits `0`–`9`                               |
| alphanumeric | digits, uppercase `A`–`Z`, space, `$%*+-./:` |
| byte         | anything else, as UTF-8                      |

Error correction is fixed at level M (recovers from ~15% damage). Lower/higher
levels, and manual mode selection, aren't exposed — see [Scope](#scope).

## Scope

- **Model 2 only, for now.** rMQR support is planned; the `type` option already
  exists so adding it won't be a breaking change.
- **One error correction level.** Level M is a reasonable default for most uses;
  this package doesn't expose L/Q/H.
- **No ECI.** Byte-mode content is written as raw UTF-8, with no ECI designator
  declaring that. This is what most QR encoders do and most scanners (including
  phone cameras) auto-detect it correctly, but a few older decoders default to
  Latin-1 for byte mode and will misread non-ASCII text. Prefer
  alphanumeric-safe content when targeting such scanners.
- **No mixed-mode segments.** A scenario like `"item #" + numericSku` encodes
  entirely as one byte segment rather than switching modes mid-stream, which a
  size-optimizing encoder would do. Simpler code, slightly larger symbols for
  mixed content.
- **No rendering.** `toJSON()` is the whole output. Draw it in an SVG, a
  `<canvas>`, a terminal, wherever — a caller doing this already has strong
  opinions about styling.

## License

MIT
