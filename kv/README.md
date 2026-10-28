# @kuboon/kv

[![JSR](https://jsr.io/badges/@kuboon/kv)](https://jsr.io/@kuboon/kv)

バックエンドに依存しない Key-Value ストア抽象 `KvRepo` を提供するパッケージ。
type とキーを先に渡してインスタンスを初期化するので、get/set の対称性を保ちやすい。

同一の `KvRepo` インターフェースを実装する複数のバックエンドを差し替え可能：

- `@kuboon/kv/memory.ts` — オンメモリ実装。テスト・ローカル用。
- `@kuboon/kv/denoKv.ts` — Deno KV (`Deno.openKv()`) バックエンド。
- `@kuboon/kv/turso.ts` — Turso (libSQL) バックエンド。
- `@kuboon/kv/d1.ts` — Cloudflare D1 バックエンド（`d1Sqlite.ts` でローカル代替）。
- `@kuboon/kv/cached.ts` — fast / slow の二層キャッシュ。

利用側を `KvRepo` 型に対して書いておけば、本番は Deno KV、テストは Memory
といった差し替えができる。

## インストール

```sh
deno add jsr:@kuboon/kv
```

## 使い方

```ts
import type { KvRepo } from "@kuboon/kv";
import { MemoryKvRepo } from "@kuboon/kv/memory.ts";

const repo: KvRepo<string> = new MemoryKvRepo<string>(["greeting"]);
await repo.entry("ja").update(() => "こんにちは");
console.log(await repo.entry("ja").get()); // "こんにちは"
```

## Cloudflare D1

Workers KV ではなく D1 を使うのは、`update` の compare-and-set（単回使用トークンや
レートリミット）に結果整合な Workers KV では応えられないため。D1 の
`prepare()` だけを使うので、Worker の binding をそのまま渡せる。`lazyD1` で包むと
binding の参照をクエリ実行時まで遅らせつつ、初回に `kv` テーブルを自動作成する。

```ts
import { D1KvRepo, lazyD1, sweepExpired } from "@kuboon/kv/d1.ts";

let env: { DB: D1Database } | undefined;
const db = lazyD1(() => env!.DB);
const sessions = new D1KvRepo<Session>(db, ["session"], {
  expireIn: 1000 * 60 * 60 * 24 * 7,
});

export default {
  fetch(req: Request, e: typeof env) {
    env = e;
    // sessions.entry(id).get() / .update(...)
  },
  // D1 に TTL はないので、期限切れ行は cron で掃除する。
  scheduled: (_ev: unknown, e: typeof env) => sweepExpired(e!.DB),
};
```

ローカル開発やテストでは `@kuboon/kv/d1Sqlite.ts` の `createSqliteD1()` が
`node:sqlite` 上に同じ形の binding を作る（追加依存なし）。

## Links

- JSR: <https://jsr.io/@kuboon/kv>

## License

[MIT](./LICENSE)
