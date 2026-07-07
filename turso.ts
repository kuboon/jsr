/**
 * Turso (libSQL) をバックエンドとする {@link KvRepo} 実装。
 *
 * 単一の `kv` テーブル（`key` / `value` / `expires_at` / `version`）に全 prefix の
 * エントリを格納する。`update` は `version` 列を使った楽観的並行制御で、書き込み
 * 衝突時は {@link KvUpdateResult.ok} が `false` で返る（再試行はしない）。
 *
 * クライアントは呼び出し側が渡す（`@libsql/client` の `Client`）。エッジで動かす
 * なら `@libsql/client/web`、ローカル/テストなら `@libsql/client/node` の
 * `file:` / `:memory:` を渡せる。テーブルは初回アクセス時に遅延作成する。
 *
 * 値は JSON でシリアライズするので、JSON 表現可能な値のみ格納できる。
 *
 * @example
 * ```ts
 * import { createClient } from "@libsql/client";
 * import { TursoKvRepo } from "@kuboon/kv/turso.ts";
 *
 * const client = createClient({ url, authToken });
 * type Profile = { name: string };
 * const profiles = new TursoKvRepo<Profile>(client, ["profile"]);
 *
 * await profiles.entry("alice").update(() => ({ name: "Alice" }));
 * console.log(await profiles.entry("alice").get()); // { name: "Alice" }
 * ```
 *
 * @module
 */

import type { Client } from "@libsql/client";
import { monotonicUlid } from "@std/ulid";

import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";

// --- key codec ------------------------------------------------------------
// 各キーパートを `<tag><hex>` に、パート境界を `/` で終端して連結する。hex 本体は
// `[0-9a-f]`、tag は `[sngb]` のみなので `/` や LIKE のメタ文字 (`%` `_`) を含まず、
// prefix 一致は末尾 `/` のおかげで文字列 prefix として安全に LIKE できる。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const hex = (s: string): string =>
  Array.from(encoder.encode(s), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

const unhex = (h: string): string => {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return decoder.decode(bytes);
};

const encPart = (part: KvKeyPart): string => {
  switch (typeof part) {
    case "string":
      return "s" + hex(part);
    case "number":
      return "n" + hex(String(part));
    case "bigint":
      return "g" + hex(String(part));
    case "boolean":
      return "b" + (part ? "1" : "0");
    default:
      throw new TypeError(`Unsupported key part: ${typeof part}`);
  }
};

const decPart = (token: string): KvKeyPart => {
  const body = token.slice(1);
  switch (token[0]) {
    case "s":
      return unhex(body);
    case "n":
      return Number(unhex(body));
    case "g":
      return BigInt(unhex(body));
    case "b":
      return body === "1";
    default:
      throw new Error(`Malformed key token: ${token}`);
  }
};

const encKey = (parts: KvKey): string =>
  parts.map((p) => encPart(p) + "/").join("");

// --- schema ---------------------------------------------------------------

const CREATE_TABLE =
  "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER, version INTEGER NOT NULL DEFAULT 0)";

/** クライアント毎にテーブル作成を一度だけ実行するためのキャッシュ。 */
const ensured = new WeakMap<Client, Promise<void>>();

const ensureTable = (client: Client): Promise<void> => {
  let promise = ensured.get(client);
  if (!promise) {
    promise = client.execute(CREATE_TABLE).then(() => {});
    ensured.set(client, promise);
  }
  return promise;
};

const asNumber = (value: unknown): number | null =>
  value == null ? null : Number(value);

/**
 * Turso (libSQL) 上のエントリ集合を扱う {@link KvRepo} 実装。
 */
export class TursoKvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  /**
   * @param client libSQL クライアント（`@libsql/client` の `createClient` の戻り値）。
   * @param prefix このリポジトリ配下のエントリ共通プレフィックス。
   * @param options 全エントリに適用されるデフォルト {@link KvOptions}（`expireIn` 等）。
   */
  constructor(
    public client: Client,
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
    const fullKey = [...this.prefix, key];
    const strKey = encKey(fullKey);
    const client = this.client;
    const repoOptions = this.options;

    return {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        await ensureTable(client);
        const result = await client.execute({
          sql: "SELECT value, expires_at FROM kv WHERE key = ?",
          args: [strKey],
        });
        const row = result.rows[0];
        if (!row) return null;
        const expiresAt = asNumber(row.expires_at);
        if (expiresAt !== null && Date.now() >= expiresAt) return null;
        return JSON.parse(row.value as string) as TEntryVal;
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult<TEntryVal>> {
        await ensureTable(client);
        const read = await client.execute({
          sql: "SELECT value, expires_at, version FROM kv WHERE key = ?",
          args: [strKey],
        });
        const row = read.rows[0];
        const now = Date.now();
        const existed = row !== undefined;
        const expiresAt = row ? asNumber(row.expires_at) : null;
        const live = row !== undefined &&
          (expiresAt === null || now < expiresAt);
        const current = live
          ? JSON.parse(row.value as string) as TEntryVal
          : null;
        const version = row ? Number(row.version) : 0;

        const updated = updater(current);

        if (updated === null) {
          if (!existed) return { ok: true, val: null };
          const del = await client.execute({
            sql: "DELETE FROM kv WHERE key = ? AND version = ?",
            args: [strKey, version],
          });
          return { ok: del.rowsAffected > 0, val: null };
        }

        const expireIn = opts.expireIn ?? repoOptions.expireIn;
        const newExpiresAt = expireIn != null ? now + expireIn : null;
        const value = JSON.stringify(updated);

        if (!existed) {
          // 楽観的挿入。並行して別の書き込みが先に入れば衝突として `ok: false`。
          const insert = await client.execute({
            sql:
              "INSERT INTO kv (key, value, expires_at, version) VALUES (?, ?, ?, 0) ON CONFLICT(key) DO NOTHING",
            args: [strKey, value, newExpiresAt],
          });
          const ok = insert.rowsAffected > 0;
          return { ok, val: ok ? updated : current };
        }

        const update = await client.execute({
          sql:
            "UPDATE kv SET value = ?, expires_at = ?, version = version + 1 WHERE key = ? AND version = ?",
          args: [value, newExpiresAt, strKey, version],
        });
        const ok = update.rowsAffected > 0;
        return { ok, val: ok ? updated : current };
      },
    };
  }

  /** prefix 配下（期限内）のエントリを順に yield する。 */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    await ensureTable(this.client);
    const prefixStr = encKey(this.prefix);
    const result = await this.client.execute({
      sql:
        "SELECT key FROM kv WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)",
      args: [prefixStr + "%", Date.now()],
    });
    for (const row of result.rows) {
      const rest = (row.key as string).slice(prefixStr.length);
      const slash = rest.indexOf("/");
      const token = slash === -1 ? rest : rest.slice(0, slash);
      if (!token) continue;
      yield this.entry(decPart(token));
    }
  }
}
