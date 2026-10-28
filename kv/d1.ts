/**
 * Cloudflare D1 をバックエンドとする {@link KvRepo} 実装。
 *
 * Workers KV ではなく D1 を使うのは、{@link KvEntryInterface.update} の
 * compare-and-set（単回使用トークン、リフレッシュトークンの再利用検知、
 * レートリミット等）に結果整合な Workers KV では応えられないため。ここでは
 * CAS を `UPDATE ... WHERE version = ?` の条件付き更新で表現し、SQLite が
 * 返す変更行数で成否を判定する。衝突時は {@link KvUpdateResult.ok} が
 * `false` で返り、再試行はしない。
 *
 * 単一の `kv` テーブル（`key` / `value` / `version` / `expires_at`）に全 prefix
 * のエントリを格納する。キーは Deno KV と同じ配列のまま受け取り、順序を保つ
 * 一本の TEXT 主キーにエンコードするので、prefix 走査は主キーの範囲スキャンに
 * なる。値は JSON でシリアライズするので、JSON 表現可能な値のみ格納できる。
 *
 * D1 自体に TTL はない。期限切れの行は読み出し・走査時に無視されるだけで
 * 残り続けるので、{@link sweepExpired} を cron（scheduled handler）から
 * 定期的に呼んで掃除すること。
 *
 * データベースは {@link D1Like}（`D1Database` の `prepare` 部分集合）として
 * 呼び出し側が渡す。Worker の binding をそのまま渡してもよいし、
 * {@link lazyD1} で包めば binding の参照をステートメント実行時まで遅らせつつ
 * 初回にテーブルを自動作成できる。ローカル開発・テストでは
 * `@kuboon/kv/d1Sqlite.ts` の `createSqliteD1()` が `node:sqlite` 上に同じ
 * 形の binding を作る。
 *
 * @example
 * ```ts
 * import { D1KvRepo, lazyD1, sweepExpired } from "@kuboon/kv/d1.ts";
 *
 * type Profile = { name: string };
 *
 * export default {
 *   async fetch(_req: Request, env: { DB: D1Database }) {
 *     const profiles = new D1KvRepo<Profile>(env.DB, ["profile"]);
 *     await profiles.entry("alice").update(() => ({ name: "Alice" }));
 *     return Response.json(await profiles.entry("alice").get());
 *   },
 *   async scheduled(_ev: unknown, env: { DB: D1Database }) {
 *     await sweepExpired(env.DB);
 *   },
 * };
 * ```
 *
 * @module
 */

import { monotonicUlid } from "@std/ulid";

import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";

/** Cloudflare の `D1Database` のうち、このモジュールが使う部分集合。 */
export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

/** `D1PreparedStatement` のうち、このモジュールが使う部分集合。 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

/**
 * テーブル定義。すべて `IF NOT EXISTS` なので、既に存在するデータベースに
 * 適用しても何も変わらない。
 */
export const D1_KV_SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS kv_expires_at ON kv (expires_at);
`;

/** テーブルとインデックスが無ければ作る。冪等。 */
export const applyD1Schema = async (db: D1Like): Promise<void> => {
  // D1 の prepared statement は 1 文しか受け付けないので文ごとに実行する。
  for (const statement of D1_KV_SCHEMA.split(";")) {
    if (statement.trim()) await db.prepare(statement.trim() + ";").run();
  }
};

/**
 * 実際のデータベースへの参照をステートメント実行時まで遅らせ、最初の実行前に
 * スキーマの存在を保証する {@link D1Like} ラッパー。
 *
 * どちらも Workers で動かす際の都合から来ている。binding はモジュールスコープ
 * では触れない（デプロイ時の検証で binding なしにトップレベルが実行される）
 * ので、ステートメントごとに取得する。またデプロイはテーブルを作らないので、
 * プレビューや新規データベース、`cf dev` のローカル DB は最初のクエリで
 * `no such table: kv` になる。ここで保証しておけば isolate ごとに冪等な文が
 * 一度走るだけで全環境をカバーできる。
 *
 * 失敗した試行は記憶しないので、一度の一時的なエラーで isolate 内の全リクエスト
 * が失敗し続けることはなく、次のステートメントで再試行される。
 *
 * @example
 * ```ts
 * import { D1KvRepo, lazyD1 } from "@kuboon/kv/d1.ts";
 *
 * // env は fetch handler 内で代入される前提。
 * let env: { DB: D1Database } | undefined;
 * const db = lazyD1(() => env!.DB);
 * const sessions = new D1KvRepo<unknown>(db, ["session"], {
 *   expireIn: 1000 * 60 * 60 * 24 * 7,
 * });
 * ```
 */
export const lazyD1 = (getDb: () => D1Like): D1Like => {
  let ready: Promise<void> | undefined;
  const ensureSchema = (): Promise<void> => {
    ready ??= applyD1Schema(getDb()).catch((error) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };

  const statement = (sql: string, values: unknown[]): D1PreparedLike => ({
    bind: (...next: unknown[]) => statement(sql, next),
    async first<T>() {
      await ensureSchema();
      return await getDb().prepare(sql).bind(...values).first<T>();
    },
    async all<T>() {
      await ensureSchema();
      return await getDb().prepare(sql).bind(...values).all<T>();
    },
    async run() {
      await ensureSchema();
      return await getDb().prepare(sql).bind(...values).run();
    },
  });

  return { prepare: (sql) => statement(sql, []) };
};

// --- key codec ------------------------------------------------------------
// 区切りに "\u0000" は使わない。SQLite は TEXT 中の NUL を終端とみなすので、
// NUL を含むキーが黙って切り詰められ、範囲スキャンから漏れる。NUL は
// エスケープ対象にする。
const SEP = "\u0001";

/**
 * キーパートを型タグ付きでエンコードする。区切り文字はエスケープするので、
 * パートが境界を偽装することはない。タグにより Deno KV と同様 `1` と `"1"`
 * は区別される。
 */
const encodePart = (part: KvKeyPart): string => {
  const tag = typeof part === "string"
    ? "s"
    : typeof part === "number"
    ? "n"
    : typeof part === "bigint"
    ? "B"
    : "b";
  const raw = String(part);
  return tag +
    raw
      .replaceAll("\\", "\\\\")
      .replaceAll("\u0000", "\\0")
      .replaceAll(SEP, "\\1");
};

/** 完全なキーを、順序を保つ TEXT 主キーにエンコードする。 */
export const encodeKey = (key: KvKey): string => key.map(encodePart).join(SEP);

/**
 * `prefix` の真下にあるキー全体を覆う半開区間。Deno KV の `list({ prefix })`
 * と同じく、子孫は含み prefix そのもののキーは含まない。
 */
export const prefixRange = (prefix: KvKey): { lo: string; hi: string } => {
  const base = encodeKey(prefix);
  return { lo: base + SEP, hi: base + "\u0002" };
};

/**
 * パートごとのエスケープの逆変換。左から右への一回走査で行う。`replaceAll`
 * を二回かけると、リテラルのバックスラッシュに続く `0`（`\\0` にエンコード
 * される）がエスケープされた NUL と読まれて曖昧になるため。
 */
const unescapePart = (s: string): string => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      out += s[i];
      continue;
    }
    const next = s[++i];
    out += next === "0" ? "\u0000" : next === "1" ? SEP : next;
  }
  return out;
};

/** {@link encodeKey} の逆変換。prefix 走査時に使う。 */
export const decodeKey = (encoded: string): KvKey => {
  if (encoded === "") return [];
  return encoded.split(SEP).map((chunk): KvKeyPart => {
    const tag = chunk[0];
    const raw = unescapePart(chunk.slice(1));
    switch (tag) {
      case "n":
        return Number(raw);
      case "B":
        return BigInt(raw);
      case "b":
        return raw === "true";
      default:
        return raw;
    }
  });
};

// --- repo -----------------------------------------------------------------

type Row = { value: string; version: number; expires_at: number | null };

/**
 * Cloudflare D1 上のエントリ集合を扱う {@link KvRepo} 実装。
 */
export class D1KvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  /**
   * @param db D1 の binding、または {@link lazyD1} 等で包んだ {@link D1Like}。
   * @param prefix このリポジトリ配下のエントリ共通プレフィックス。
   * @param options 全エントリに適用されるデフォルト {@link KvOptions}（`expireIn` 等）。
   */
  constructor(
    public db: D1Like,
    public prefix: KvKey = [],
    public options: KvOptions = {},
  ) {}

  /** 新規エントリ用の一意キーを ULID で生成する。 */
  genKey(): string {
    return monotonicUlid();
  }

  /**
   * 指定キーのエントリアクセサを返す。`update` は `version` 列による楽観的
   * 並行制御で、`updater` 実行中に他者が同キーを書き換えた場合 `ok: false` を返す。
   */
  entry<TEntryVal = TVal>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    return this.entryForKey<TEntryVal>(key, [...this.prefix, key]);
  }

  private entryForKey<TEntryVal>(
    key: KvKeyPart,
    fullKey: KvKey,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    const db = this.db;
    const encoded = encodeKey(fullKey);
    const repoOptions = this.options;

    const read = (): Promise<Row | null> =>
      db
        .prepare("SELECT value, version, expires_at FROM kv WHERE key = ?1")
        .bind(encoded)
        .first<Row>();

    const isLive = (row: Row, now: number): boolean =>
      row.expires_at == null || now < row.expires_at;

    return {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        const row = await read();
        // 期限切れの行は掃除されるまで残るので、無いものとして扱う。
        if (!row || !isLive(row, Date.now())) return null;
        return JSON.parse(row.value) as TEntryVal;
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult<TEntryVal>> {
        const row = await read();
        const now = Date.now();
        // 期限切れの行は `updater` には `null` として見せるが、行自体は残って
        // いるので書き込みは INSERT ではなく version 付きの UPDATE になる。
        const current = row && isLive(row, now)
          ? JSON.parse(row.value) as TEntryVal
          : null;

        const updated = updater(current);

        if (updated === null) {
          if (!row) return { ok: true, val: null }; // もともと無い
          const res = await db
            .prepare("DELETE FROM kv WHERE key = ?1 AND version = ?2")
            .bind(encoded, row.version)
            .run();
          return { ok: res.meta.changes === 1, val: null };
        }

        const expireIn = opts.expireIn ?? repoOptions.expireIn;
        const expiresAt = expireIn != null ? now + expireIn : null;
        const value = JSON.stringify(updated);

        if (!row) {
          // 「存在しない」に対する CAS。他の書き込みが先に INSERT していれば
          // 衝突として負ける。これが単回使用トークンを単回にする。
          const res = await db
            .prepare(
              "INSERT INTO kv (key, value, version, expires_at) VALUES (?1, ?2, 1, ?3) " +
                "ON CONFLICT (key) DO NOTHING",
            )
            .bind(encoded, value, expiresAt)
            .run();
          const ok = res.meta.changes === 1;
          return { ok, val: ok ? updated : current };
        }
        const res = await db
          .prepare(
            "UPDATE kv SET value = ?2, version = version + 1, expires_at = ?3 " +
              "WHERE key = ?1 AND version = ?4",
          )
          .bind(encoded, value, expiresAt, row.version)
          .run();
        const ok = res.meta.changes === 1;
        return { ok, val: ok ? updated : current };
      },
    };
  }

  /** prefix 配下（期限内）のエントリをキー順に yield する。 */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    const { lo, hi } = prefixRange(this.prefix);
    const { results } = await this.db
      .prepare(
        "SELECT key FROM kv WHERE key >= ?1 AND key < ?2 " +
          "AND (expires_at IS NULL OR expires_at > ?3) ORDER BY key",
      )
      .bind(lo, hi, Date.now())
      .all<{ key: string }>();

    for (const row of results) {
      const parts = decodeKey(row.key);
      const rest = parts.slice(this.prefix.length);
      if (rest.length === 0) continue;
      yield this.entryForKey<TVal>(rest[0], [...this.prefix, ...rest]);
    }
  }
}

/**
 * 期限切れの行を削除し、削除した行数を返す。D1 に TTL はないので、
 * scheduled (cron) handler から定期的に呼ぶこと。
 */
export const sweepExpired = async (db: D1Like): Promise<number> => {
  const res = await db
    .prepare("DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= ?1")
    .bind(Date.now())
    .run();
  return res.meta.changes;
};
