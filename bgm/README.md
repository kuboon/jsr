# @kuboon/bgm

[![JSR](https://jsr.io/badges/@kuboon/bgm)](https://jsr.io/@kuboon/bgm)

Web Audio API でゲームの BGM を鳴らすための、依存ゼロの土台ライブラリ。

メロディは **MML** で、音色は**関数**で利用側が用意し、両者から再生できる
`Track` を作るところと、その再生を受け持つ。

- **イントロ付きループ**: MML の `L`
  から後ろを無限にループする。ループは`AudioBufferSourceNode`
  自身が行うのでサンプル単位で継ぎ目がなく、ループ末尾で鳴り残った余韻は
  ループ先頭側に回り込ませてあるので、継ぎ目で音が途切れない。
- **クロスフェード**: 曲の切り替えは equal-power
  カーブで旧曲をフェードアウト・新曲をフェードイン。フェード中に再度切り替えても安全。
- **バス**: `master` / `bgm` / `se` の音量をそれぞれ `GainNode` で持つ。
- **ブラウザの面倒**: 最初のユーザー操作で `AudioContext` を resume
  し（ブラウザはそれまで suspended のまま）、タブが隠れている間は一時停止する。

## インストール

```sh
deno add jsr:@kuboon/bgm
```

## 使い方

```ts ignore
import { GameAudio } from "@kuboon/bgm";
import { kick, musicBox, pulse, triangle } from "@kuboon/bgm/instruments";

const audio = new GameAudio();

// @0 = musicBox, @1 = triangle, @2 = kick
const field = audio.compose(
  `t120
   @0 o5 l8 c<geg>ceg r L e4dcd4<g4> cdefg4g4 ;
   @1 o3 l4 c g c g     L c g c g     f a g b  ;
   @2 r1                L [c4 r4]4`,
  [musicBox, triangle, kick],
);
const coin = audio.compose("t240 l16 o5 b>e4", [pulse(0.25)]);

audio.playBgm(field);
audio.playBgm(field); // 再生中の曲を指定しても何もしない（restart: true で頭から）
audio.playBgm(battle, { fade: 1 }); // 別に compose した曲へ 1 秒でクロスフェード
audio.playSe(coin, { volume: 0.5 });
audio.setVolume("bgm", 0.3, { fade: 0.5 });
audio.stopBgm({ fade: 2 });
```

## MML

`;` でパートを区切ると、各パートが同時に鳴る。

| 記法            | 意味                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| `c d e f g a b` | 音符。`+` / `#` でシャープ、`-` でフラット（`c+` `b-`）                              |
| `r`             | 休符                                                                                 |
| `4` `8.` `16`   | 音符・休符の後ろに長さ（4 = 四分音符）。`.` は付点。省略時は `l` の長さ              |
| `^`             | 長さの延長（`c4^16`）                                                                |
| `&`             | タイ。同じ音なら 1 音につなげ、違う音ならスラー（隙間なく次へ）                      |
| `o4` `>` `<`    | オクターブ（既定 `o4`、`o4c` が中央のド）。`>` で上げ、`<` で下げる                  |
| `l8`            | 既定の長さ                                                                           |
| `t120`          | テンポ（四分音符/分）。各パートは 1 パート目の冒頭のテンポで始まる                   |
| `v12`           | 音量 0〜15（既定 12）                                                                |
| `q7`            | ゲートタイム 1〜8。音符の長さの 8 分の何だけ鳴らすか（既定 7）                       |
| `@0`            | 音色。`compose()` に渡した配列の添字                                                 |
| `[ ... ]3`      | 繰り返し（回数省略時は 2）。入れ子可                                                 |
| `L`             | ループ開始位置。全パートで同じ時刻に置く。`L` がない曲は余韻が消えるまで鳴って終わる |

## 音色

`Instrument` は 1 音分の情報（周波数・押さえている長さ・強さ・サンプルレート）を
受け取って、その音のサンプル列を返すだけの関数。余韻を含めて好きな長さを返してよい。

```ts ignore
import type { Instrument } from "@kuboon/bgm";

const sine: Instrument = ({ frequency, duration, velocity, sampleRate }) => {
  const out = new Float32Array(Math.round(duration * sampleRate));
  for (let i = 0; i < out.length; i++) {
    out[i] = velocity * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return out;
};
```

`@kuboon/bgm/instruments` にいくつか用意してある。

| 音色                       | 中身                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `pulse(duty)` / `square`   | パルス波（12.5% / 25% / 50% がファミコン定番）。DC オフセットを除去済み             |
| `triangle` / `sawtooth`    | 三角波（ベース向き）/ ノコギリ波                                                    |
| `noise`                    | ノイズ。音程が高いほど明るい                                                        |
| `musicBox`                 | オルゴール。片持ち梁の櫛歯の 2 次モード（基音の 6.27 倍）を重ね、離しても鳴り続ける |
| `electricGuitar`           | エレキギター。Karplus–Strong の撥弦にオーバードライブとキャビネット風ローパス       |
| `kick` / `snare` / `hihat` | ドラム。音程は無視する                                                              |

## API

- `new GameAudio({ context?, pauseWhenHidden? })`
  - `compose(mml, instruments, { gain? })` — MML を音色で合成して `Track` を返す
  - `playBgm(track, { fade?, restart? })` / `stopBgm({ fade? })`
  - `bgm` — 再生中の `Track`、`bgmPosition` —
    曲内の再生位置（秒、ループ内に折り返し済み）
  - `playSe(track, { volume?, playbackRate? })` — 1 回再生。ループ点は無視
  - `setVolume(bus, value, { fade? })` / `volume(bus)` / `bus(name)` — `bus()`
    は `GainNode` そのもので、フィルタなどを自分で挿せる
  - `pause()` / `resume()` / `paused` — BGM・SE・フェードをまとめて止める
  - `close()`
- `parseMml(mml)` / `renderMml(mml, instruments, sampleRate, { gain? })` —
  `AudioContext` なしで使える下位 API
- `createTrack(buffer, loopPoints?)` — 自前で用意した `AudioBuffer` を `Track`
  にする

## Demo

<https://kuboon.github.io/jsr/#bgm>

## License

[MIT](./LICENSE)
