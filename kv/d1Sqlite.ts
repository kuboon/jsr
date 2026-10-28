/**
 * `node:sqlite` 上に {@link D1Like} を作る。D1 のない環境（ローカル開発・
 * テスト）で `@kuboon/kv/d1.ts` の {@link D1KvRepo} を動かすためのもので、
 * CAS を担う条件付き UPDATE や prefix の範囲スキャン、TTL フィルタといった
 * SQL が手書きのフェイクではなく本物の SQLite エンジンで実行される。
 *
 * D1 と SQLite はエンジンを共有するが API の形は違うので、{@link D1KvRepo}
 * が使う一握りのメソッドだけを写している。Deno では `node:sqlite` が標準で
 * 使えるので追加の依存はない。
 *
 * @example
 * ```ts
 * import { D1KvRepo } from "@kuboon/kv/d1.ts";
 * import { createSqliteD1 } from "@kuboon/kv/d1Sqlite.ts";
 *
 * const db = createSqliteD1(); // :memory:
 * const repo = new D1KvRepo<string>(db, ["greeting"]);
 * await repo.entry("ja").update(() => "こんにちは");
 * db.close();
 * ```
 *
 * @module
 */

import { DatabaseSync } from "node:sqlite";

import { D1_KV_SCHEMA, type D1Like, type D1PreparedLike } from "./d1.ts";

/** {@link createSqliteD1} のオプション。 */
export type SqliteD1Options = {
  /** SQLite ファイルのパス。省略時は `:memory:`。 */
  path?: string;
  /**
   * 事前にテーブルを作るかどうか（既定 `true`）。`false` にすると何も触って
   * いないデータベースになる（{@link lazyD1} の動作確認用）。
   */
  schema?: boolean;
};

/**
 * `node:sqlite` の `DatabaseSync` を {@link D1Like} として開く。
 * 使い終わったら `close()` すること。
 */
export const createSqliteD1 = (
  { path = ":memory:", schema = true }: SqliteD1Options = {},
): D1Like & { close(): void } => {
  const db = new DatabaseSync(path);
  if (schema) db.exec(D1_KV_SCHEMA);

  // D1 は `?1` 形式のパラメータを使う。node:sqlite もこれを位置引数として束縛する。
  const prepare = (sql: string): D1PreparedLike => {
    let args: unknown[] = [];
    const self: D1PreparedLike = {
      bind(...values: unknown[]) {
        args = values;
        return self;
      },
      first<T>() {
        const row = db.prepare(sql).get(...args as never[]);
        return Promise.resolve((row ?? null) as T | null);
      },
      all<T>() {
        const rows = db.prepare(sql).all(...args as never[]);
        return Promise.resolve({ results: rows as T[] });
      },
      run() {
        const res = db.prepare(sql).run(...args as never[]);
        return Promise.resolve({ meta: { changes: Number(res.changes) } });
      },
    };
    return self;
  };

  return { prepare, close: () => db.close() };
};
