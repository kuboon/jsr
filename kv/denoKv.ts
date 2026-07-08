/**
 * Deno KV (`Deno.openKv()`) をバックエンドとする {@link KvRepo} 実装。
 *
 * `update` は Deno KV の atomic transaction（{@link Deno.AtomicOperation}）で
 * 楽観的並行制御される。書き込み衝突が発生した場合は
 * {@link KvUpdateResult.ok} が `false` で返り、再試行はしない。
 *
 * モジュール読み込み時に {@link kv} を `await Deno.openKv()` で開く副作用を持つ
 * （top-level await）ので、`--unstable-kv` を有効にして実行すること。
 *
 * @example
 * ```ts
 * import { DenoKvRepo } from "@kuboon/kv/denoKv.ts";
 *
 * type Profile = { name: string };
 * const profiles = new DenoKvRepo<Profile>(["profile"]);
 *
 * await profiles.entry("alice").update(() => ({ name: "Alice" }));
 * console.log(await profiles.entry("alice").get()); // { name: "Alice" }
 *
 * for await (const e of profiles) {
 *   console.log(e.key, await e.get());
 * }
 * ```
 *
 * @module
 */

// import { memcache } from "./memcache.ts";
import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";
import { monotonicUlid } from "@std/ulid";

/**
 * モジュール読み込み時に開かれる、プロセス共有の {@link Deno.Kv} ハンドル。
 *
 * 同一プロセス内の {@link DenoKvRepo} インスタンスはすべてこのハンドルを共有する。
 */
export const kv: Deno.Kv = await Deno.openKv();

/**
 * Deno KV 上のエントリ集合を扱う {@link KvRepo} 実装。
 *
 * `prefix` 配下を atomic 操作で読み書きする。`update` は楽観的並行制御で、
 * 衝突時は {@link KvUpdateResult.ok} が `false`、`val` には衝突時点で
 * 既に保存されていた値が入る。
 */
export class DenoKvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  /**
   * @param prefix このリポジトリ配下のエントリ共通プレフィックス。
   * @param options 全エントリに適用されるデフォルト {@link KvOptions}（`expireIn` 等）。
   *               個別 `update` 呼び出しで上書き可能。
   */
  constructor(public prefix: KvKey = [], public options: KvOptions = {}) {
  }
  /** 新規エントリ用の一意キーを ULID で生成する。 */
  genKey(): string {
    return monotonicUlid();
  }
  /**
   * 指定キーのエントリアクセサを返す。
   *
   * `update` は内部で `kv.atomic().check(current).set(...).commit()` を
   * 行う楽観的並行制御で、`updater` 実行中に他者が同キーを書き換えた場合
   * `ok: false` で返る。
   */
  entry<TEntryVal = TVal>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    const fullKey = [...this.prefix, key];
    return {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        return await kv.get<TEntryVal>(fullKey).then((x) => x.value);
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult<TEntryVal>> {
        const current = await kv.get<TEntryVal>(fullKey);
        const updated = updater(current.value);
        const atomic = kv.atomic().check(current);
        if (updated === null) {
          const result = await atomic.delete(fullKey).commit();
          return { ok: result.ok, val: result.ok ? null : current.value };
        }
        const result = await atomic.set(fullKey, updated, opts).commit();
        const val = result.ok ? updated : current.value;
        return { ok: result.ok, val };
      },
    };
  }
  /** prefix 配下のエントリを Deno KV の `list` で順に yield する。 */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    const list = kv.list({ prefix: this.prefix });
    for await (const entry of list) {
      const fullKey = entry.key as KvKey;
      const key = fullKey.slice(this.prefix.length)[0];
      yield this.entry<TVal>(key);
    }
  }
}
