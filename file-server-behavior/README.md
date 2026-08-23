# @kuboon/file-server-behavior

[trailing-slash-guide](https://github.com/slorber/trailing-slash-guide) に
基づいて、静的ホスティングサービスの URL 解決ルール(クリーン URL /
トレイリングスラッシュ / index.html の扱い)をエミュレートする。

`toLocalPaths(url_path)` は、要求された URL パスに対応しうるローカルパスの
候補を優先順位付きの配列で返す。実際のファイル存在チェックは呼び出し側が行う。

```ts
type Redirect = { target: string; path?: string };

interface FileServerBehavior {
  toLocalPaths(url_path: string): (string | Redirect)[];
}
```

配列を先頭から順に処理する:

- `string` の要素はローカルファイルパス。存在すればそれを配信する。
- `Redirect` の要素は、`path` が未指定、または `path` のファイルが存在すれば
  `target` へリダイレクトする。
- 何もマッチしなければ 404。

```ts ignore
for (const candidate of behavior.toLocalPaths(url_path)) {
  if (typeof candidate === "string") {
    if (await exists(candidate)) return serveFile(candidate);
  } else if (candidate.path === undefined || await exists(candidate.path)) {
    return redirectTo(candidate.target);
  }
}
return notFound();
```

## 使用例

サブパスごとにホストを切り替える。実際に使わない実装が import
グラフに含まれないよう、ホストごとに export を分けている。

```ts
import { FileServerBehavior } from "@kuboon/file-server-behavior/github";

new FileServerBehavior().toLocalPaths("/dir/file");
// => ["/dir/file.html", { target: "/dir/file/", path: "/dir/file/index.html" }]
```

```ts
import { FileServerBehavior } from "@kuboon/file-server-behavior/vercel";

new FileServerBehavior({ cleanUrls: false, trailingSlash: undefined });
```

`vercel` の `VercelOptions`:

- `cleanUrls`(既定 `false`): `true` で拡張子なし URL を正規形にする。
- `trailingSlash`(既定 `undefined`): `true` でトレイリングスラッシュを強制、
  `false` で禁止、`undefined` でどちらも許容。
