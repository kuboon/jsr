# @kuboon/kv

[![JSR](https://jsr.io/badges/@kuboon/kv)](https://jsr.io/@kuboon/kv)

バックエンドに依存しない Key-Value ストア抽象 `KvRepo` を提供するパッケージ。
type とキーを先に渡してインスタンスを初期化するので、get/set の対称性を保ちやすい。

同一の `KvRepo` インターフェースを実装する複数のバックエンドを差し替え可能：

- `@kuboon/kv/memory.ts` — オンメモリ実装。テスト・ローカル用。
- `@kuboon/kv/denoKv.ts` — Deno KV (`Deno.openKv()`) バックエンド。
- `@kuboon/kv/turso.ts` — Turso (libSQL) バックエンド。
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

## Links

- JSR: <https://jsr.io/@kuboon/kv>

## License

[MIT](./LICENSE)
