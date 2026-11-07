# @kuboon/native-map-url

[![JSR](https://jsr.io/badges/@kuboon/native-map-url)](https://jsr.io/@kuboon/native-map-url)

緯度・経度・倍率から、端末に合った地図アプリを開くリンクを作る。iPhone / iPad /
Mac では Apple マップ、それ以外では Google マップ。依存ゼロ。

どちらも universal link（`https://maps.apple.com/...` /
`https://www.google.com/maps/...`）なので、アプリが入っていればアプリが、
なければブラウザで地図が開く。

## インストール

```sh
deno add jsr:@kuboon/native-map-url
```

## 使い方

```ts ignore
import { nativeMapUrl } from "@kuboon/native-map-url";

const url = nativeMapUrl({
  latitude: 35.681236,
  longitude: 139.767125,
  zoom: 16,
});
// iPhone: https://maps.apple.com/frame?center=35.681236,139.767125&span=0.008924,0.010986
// Android: https://www.google.com/maps/@?api=1&map_action=map&center=35.681236,139.767125&zoom=16
link.href = url;
```

User-Agent は省略すると `navigator.userAgent` を読む。サーバー側で作るなら
リクエストの `User-Agent` を第 2 引数に渡す。

```ts ignore
nativeMapUrl(location, request.headers.get("user-agent") ?? "");
```

## API

- `nativeMapUrl(location, userAgent?)` — User-Agent に合わせてどちらかの URL
  を返す
- `appleMapUrl(location)` — Apple マップの URL（`/frame?center=…&span=…`）
- `googleMapUrl(location)` — Google マップの
  URL（`/maps/@?api=1&map_action=map&center=…&zoom=…`）
- `mapProvider(userAgent)` — `"apple"` か `"google"`
- `zoomToSpan(zoom, latitude)` — 倍率を Apple の `span`（緯度幅,
  経度幅）に換算する

`location` は `{ latitude, longitude, zoom? }`。緯度 -90〜90、経度 -180〜180
の外は `RangeError`。座標は小数点以下 6 桁（約 10 cm）に丸める。

### 判定

User-Agent に `iPhone` / `iPad` / `iPod` / `Macintosh` を含めば Apple
マップ。iPadOS 13 以降の Safari は既定で Mac の User-Agent を名乗るので、
`Macintosh` で iPad も拾う（その結果 Mac のブラウザも Apple マップになる）。

### 倍率

`zoom` は Google マップの倍率（0 = 世界全体〜21 = 建物、1 増えるごとに表示範囲が
半分）。Google にはそのまま整数に丸めて渡し、0〜21 に収める。省略すると倍率を
付けず、各アプリの既定に任せる。

Apple マップの `/frame`
は倍率ではなく表示範囲（`span`、緯度と経度の幅）を取るので
換算する。厳密さは狙わず「だいたい同じ範囲」: Web メルカトルでタイル 1 枚（256
px）が `360 / 2^zoom` 度なので、幅 512 px 相当の `720 / 2^zoom` 度を経度幅とし、
緯度幅は `cos(緯度)`
倍に縮める（高緯度ほど同じ画面に収まる緯度の幅が狭いため）。

## License

[MIT](./LICENSE)
