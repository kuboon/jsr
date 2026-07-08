/**
 * オンメモリ実装の {@link KvRepo}。
 *
 * 主な用途：
 *
 * - 単体テストで本物の KV を立ち上げずに動作確認する。
 * - サーバー単一プロセス内で完結する一時的なキャッシュ。
 *
 * 永続化されないこと、プロセスをまたいで共有されないことに注意。
 *
 * @example
 * ```ts
 * import { MemoryKvRepo } from "@kuboon/kv/memory.ts";
 *
 * const repo = new MemoryKvRepo<number>(["counters"]);
 * await repo.entry("a").update((n) => (n ?? 0) + 1);
 * console.log(await repo.entry("a").get()); // 1
 * ```
 *
 * @module
 */

// deno-lint-ignore-file require-await
import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";
import { monotonicUlid } from "@std/ulid";

type Entry<T> = { value: T; expireAt: number | null };

function keyToString(key: KvKey): string {
  return JSON.stringify(key);
}

/**
 * 単一プロセスのメモリ上に値を保持する {@link KvRepo} 実装。
 *
 * 期限切れエントリは {@link MemoryKvRepo.entry get} / `update` 呼び出し時に
 * 遅延的に破棄される（タイマーは持たない）。
 */
export class MemoryKvRepo<T> implements KvRepo<T, KvKeyPart, KvOptions> {
  private store = new Map<string, Entry<T>>();

  /**
   * @param prefix このリポジトリ配下のエントリ共通プレフィックス。
   * @param options 全エントリに適用されるデフォルト {@link KvOptions}（`expireIn` 等）。
   *               個別 `update` 呼び出しで上書き可能。
   */
  constructor(public prefix: KvKey = [], public options: KvOptions = {}) {}

  /** 新規エントリ用の一意キーを ULID で生成する。 */
  genKey(): string {
    return monotonicUlid();
  }

  private fullKey(key: KvKeyPart): KvKey {
    return [...this.prefix, key];
  }

  private isExpired(entry: Entry<T>): boolean {
    return entry.expireAt !== null && Date.now() >= entry.expireAt;
  }

  /**
   * 指定キーのエントリアクセサを返す。`update` は常に `ok: true` を返す
   * （メモリ単一プロセスで競合が発生しないため）。
   */
  entry<TEntryVal = T>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    const fullKey = this.fullKey(key);
    const strKey = keyToString(fullKey);
    const store = this.store;
    const isExpired = this.isExpired.bind(this);
    const repoOptions = this.options;

    const entry = {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        const entry = store.get(strKey);
        if (!entry || isExpired(entry)) {
          store.delete(strKey);
          return null;
        }
        return entry.value as unknown as TEntryVal;
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult<TEntryVal>> {
        const entry = store.get(strKey);
        const current = entry && !isExpired(entry)
          ? entry.value as unknown as TEntryVal
          : null;
        const updated = updater(current);
        if (updated === null) {
          store.delete(strKey);
        } else {
          const expireIn = opts.expireIn ?? repoOptions.expireIn;
          store.set(strKey, {
            value: updated as unknown as T,
            expireAt: expireIn != null ? Date.now() + expireIn : null,
          });
        }
        return { ok: true, val: updated };
      },
    };
    return entry;
  }

  /** prefix 配下のエントリを順に yield する。 */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<T, KvKeyPart, KvOptions>
  > {
    for await (const key of this.store.keys()) {
      const kvEntry = this.entry(JSON.parse(key).pop()!);
      yield kvEntry;
    }
  }
}
