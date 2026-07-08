/**
 * 二層キャッシュ ({@link CachedKvRepo}) — 高速側 (`fast`) と低速側 (`slow`) の
 * 二つの {@link KvRepo} を束ねるアダプタ。
 *
 * 典型ユースケース：
 *
 * - `fast = MemoryKvRepo` でリクエスト内 / プロセス内キャッシュを構成し、
 *   `slow = DenoKvRepo` 等の永続層への往復を減らす。
 * - フェイルオーバーや TTL の異なるストレージを段階的に重ねる。
 *
 * 動作概要：
 *
 * - **読み込み**：まず `fast` を参照し、ヒットすれば即返す。ミス時のみ `slow` を読み、
 *   返値で `fast` を更新する（lazy populate）。
 * - **書き込み**：`updater` には `slow` の現在値を渡し、得た新値を `fast` と
 *   `slow` の両方に書き込む。`null` を返した場合は両方から削除する。
 *   戻り値は `slow` の {@link KvUpdateResult}。
 * - **イテレーション**：`slow` を起点に走査する。`fast` だけにあるエントリは
 *   現れない。
 *
 * `fast` は単に直近観測値の近似であり、`slow` を権威ソースとして扱う設計。
 * 並行更新時に `fast` が一時的にズレても、次回 `update` で `slow` 経由の
 * 値で再同期される。
 *
 * @example
 * ```ts
 * import { CachedKvRepo } from "@kuboon/kv/cached.ts";
 * import { MemoryKvRepo } from "@kuboon/kv/memory.ts";
 * import { DenoKvRepo } from "@kuboon/kv/denoKv.ts";
 *
 * const fast = new MemoryKvRepo<string>(["session-cache"]);
 * const slow = new DenoKvRepo<string>(["session"]);
 * const sessions = new CachedKvRepo<string>(["session"], { fast, slow });
 *
 * await sessions.entry("abc").update(() => "user-1"); // fast と slow 双方に書く
 * await sessions.entry("abc").get();                  // fast から返る
 * ```
 *
 * @module
 */

import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";

class Entry<TVal> implements KvEntryInterface<TVal, KvKeyPart, KvOptions> {
  constructor(
    public key: KvKeyPart,
    public fullKey: KvKeyPart[],
    private slow: KvEntryInterface<TVal, KvKeyPart, KvOptions>,
    private fast: KvEntryInterface<TVal, KvKeyPart, KvOptions>,
  ) {}
  async get(): Promise<TVal | null> {
    let entry = await this.fast.get();
    if (!entry) {
      entry = await this.slow.get();
      await this.fast.update(() => entry);
    }
    return entry;
  }
  async update(
    updater: (current: TVal | null) => TVal | null,
    opts: KvOptions = {},
  ): Promise<KvUpdateResult<TVal>> {
    const current = await this.slow.get();
    const updated = updater(current);
    if (updated === null) {
      await this.fast.update(() => null, opts);
      return await this.slow.update(() => null, opts);
    }
    await this.fast.update(() => updated, opts);
    return await this.slow.update(() => updated, opts);
  }
}

/**
 * `fast` / `slow` の二つの {@link KvRepo} を束ね、読み込みを `fast` でショートカット
 * しつつ書き込みを両側に伝播させる {@link KvRepo} 実装。
 *
 * 詳細な挙動はモジュールドキュメント参照。
 */
export class CachedKvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  #fast: KvRepo<TVal, KvKeyPart, KvOptions>;
  #slow: KvRepo<TVal, KvKeyPart, KvOptions>;

  /**
   * @param prefix このリポジトリの公開プレフィックス（{@link Entry.fullKey} の組み立てに使う）。
   *               実際のストレージ操作は `fast.entry(key)` / `slow.entry(key)` に委譲されるため、
   *               実体側のキー位置は各バックエンドの prefix で決まる。
   * @param options.fast 高速側 {@link KvRepo}（`MemoryKvRepo` 等）。
   * @param options.slow 低速側 {@link KvRepo}（永続層、`DenoKvRepo` 等）。権威ソース。
   */
  constructor(
    public prefix: KvKey = [],
    public options: {
      fast: KvRepo<TVal, KvKeyPart, KvOptions>;
      slow: KvRepo<TVal, KvKeyPart, KvOptions>;
    },
  ) {
    this.#fast = options.fast;
    this.#slow = options.slow;
  }

  /** `slow` の {@link KvRepo.genKey} に委譲する。 */
  genKey(): string {
    return this.#slow.genKey();
  }

  /**
   * 指定キーの二層キャッシュ済みエントリアクセサを返す。
   *
   * 返るエントリの `fullKey` は `[...this.prefix, key]`。
   */
  entry<TEntryVal = TVal>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    return new Entry(
      key,
      [...this.prefix, key],
      this.#slow.entry<TEntryVal>(key),
      this.#fast.entry<TEntryVal>(key),
    );
  }

  /** `slow` を辿りつつ、各キーをキャッシュ済みエントリ経由で yield する。 */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    for await (const entry of this.#slow) {
      yield this.entry(entry.key);
    }
  }
}
