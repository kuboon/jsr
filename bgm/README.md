# @kuboon/bgm

[![JSR](https://jsr.io/badges/@kuboon/bgm)](https://jsr.io/@kuboon/bgm)

Web Audio API でゲームの BGM を鳴らすための、依存ゼロの土台ライブラリ。

- **イントロ付きループ**: イントロを 1 回鳴らしたあと、`loopStart`〜`loopEnd`
  の区間を無限にループする。ループは `AudioBufferSourceNode`
  自身が行うのでサンプル単位で継ぎ目がない（タイマーで繋ぐのではない）。
- **クロスフェード**: 曲の切り替えは equal-power
  カーブで旧曲をフェードアウト・新曲をフェードイン。途中で音量が落ち込まない。
  フェード中に再度切り替えても安全。
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

const audio = new GameAudio();

// ループ点は秒で指定。loopEnd 省略時は曲の末尾
const field = await audio.load("field.ogg", { loopStart: 4.8, loopEnd: 52.8 });
const battle = await audio.load("battle.ogg", { loopStart: 2.4 });
const coin = await audio.load("coin.wav");

audio.playBgm(field);
audio.playBgm(field); // 再生中の曲を指定しても何もしない（restart: true で頭から）
audio.playBgm(battle, { fade: 1 }); // 1 秒でクロスフェード
audio.playSe(coin, { volume: 0.5 });
audio.setVolume("bgm", 0.3, { fade: 0.5 });
audio.stopBgm({ fade: 2 });
```

`AudioBuffer` を自前で用意した場合（合成した音など）は
`createTrack(buffer, loopPoints)` で `Track` にする。

### ループ点の単位

ループ点は**秒**。`decodeAudioData`
は再生側のサンプルレートにリサンプルするので、ファイルのメタデータ（`LOOPSTART`
タグなど）にサンプル数で書かれている場合は、**ファイルの**サンプルレートで割ってから渡す。

### メモリ

継ぎ目のないループのために、曲は丸ごと `AudioBuffer`
にデコードしてメモリに載せる。3 分のステレオ 48 kHz でおよそ 70 MB。`<audio>`
要素のストリーミング再生はメモリが軽いが、サンプル単位のループはできない。

## API

- `new GameAudio({ context?, pauseWhenHidden? })`
  - `load(url | ArrayBuffer, loopPoints?)` — 取得してデコードし `Track` を返す
  - `playBgm(track, { fade?, restart? })` / `stopBgm({ fade? })`
  - `bgm` — 再生中の `Track`、`bgmPosition` —
    曲内の再生位置（秒、ループ内に折り返し済み）
  - `playSe(track, { volume?, playbackRate? })` — 1 回再生。ループ点は無視
  - `setVolume(bus, value, { fade? })` / `volume(bus)` / `bus(name)` — `bus()`
    は `GainNode` そのもので、フィルタなどを自分で挿せる
  - `pause()` / `resume()` / `paused` — BGM・SE・フェードをまとめて止める
  - `close()`
- `createTrack(buffer, loopPoints?)`

## Demo

<https://kuboon.github.io/jsr/#bgm>

## License

[MIT](./LICENSE)
