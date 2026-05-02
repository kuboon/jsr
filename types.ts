/**
 * バックエンドに依存しない Key-Value ストア抽象 `KvRepo` を提供するパッケージ。
 * type とキーを先に渡してインスタンスを初期化するので、 get/set の対称性を保ちやすい。
 *
 * 同一の {@link KvRepo} インターフェースを実装する複数のバックエンドを差し替え可能：
 *
 * - `@kuboon/kv/memory.ts` — オンメモリ実装。テスト・ローカル用。
 * - `@kuboon/kv/denoKv.ts` — Deno KV (`Deno.openKv()`) バックエンド。
 * - `@kuboon/kv/cached.ts` — fast / slow の二層キャッシュ。
 *
 * セッションストレージ等を組み立てる際は、利用側を {@link KvRepo} 型に対して
 * 書いておけば、本番は Deno KV、テストは Memory といった差し替えができる。
 * Cloudflare KV にも対応しようとして挫折。
 *
 * @example
 * ```ts
 * import type { KvRepo } from "@kuboon/kv";
 * import { MemoryKvRepo } from "@kuboon/kv/memory.ts";
 *
 * const repo: KvRepo<string> = new MemoryKvRepo<string>(["greeting"]);
 * await repo.entry("ja").update(() => "こんにちは");
 * console.log(await repo.entry("ja").get()); // "こんにちは"
 * ```
 *
 * @module
 */

/**
 * KV キーを構成する単一のパート。{@link KvKey} の要素として使われる。
 *
 * Deno KV / Cloudflare KV など実バックエンドに合わせ、プリミティブ型に限定。
 */
export type KvKeyPart = string | number | bigint | boolean;

/**
 * 階層的な KV キー。
 *
 * リポジトリ側で `prefix` を持ち、エントリ操作時に `[...prefix, key]` の形で
 * 完全なキーが組み立てられる。
 */
export type KvKey = KvKeyPart[];

/**
 * `update` 等の書き込み操作に渡せるオプション。
 */
export type KvOptions = {
  /**
   * 当該エントリの有効期限（ミリ秒）。経過後は {@link KvEntryInterface.get} が
   * `null` を返す。未指定の場合はリポジトリ側のデフォルト、それも無ければ無期限。
   */
  expireIn?: number;
};

/**
 * {@link KvEntryInterface.update} の戻り値。
 *
 * 楽観的並行制御で衝突した場合 `ok` が `false` となり、`val` には
 * その時点でストア側に保存されていた現在値が入る（実装によってはベストエフォート）。
 */
export type KvUpdateResult<T> = {
  /** 書き込みが成功したかどうか。 */
  ok: boolean;
  /** 書き込み後（または衝突時の現在）の値。削除時は `null`。 */
  val: T | null;
};

/**
 * 単一の KV エントリへのアクセサ。{@link KvRepo.entry} から取得する。
 */
export interface KvEntryInterface<TVal, TKeyPart, TKvOptions = KvOptions> {
  /** リポジトリ prefix を除いた、このエントリのキーパート。 */
  key: TKeyPart;
  /** prefix を含めた完全なキー。 */
  fullKey: TKeyPart[];
  /**
   * 値を取得する。エントリが存在しない、または期限切れの場合は `null`。
   */
  get(): Promise<TVal | null>;
  /**
   * 現在値を読み取り `updater` に渡し、その戻り値で書き込む。
   *
   * - `updater` が `null` を返した場合はエントリを削除する。
   * - 楽観的並行制御に対応する実装では、`updater` 実行中に他者が書き込むと
   *   失敗を返す（{@link KvUpdateResult.ok} が `false`）。
   *
   * @param updater 現在値（または `null`）を受け取り、新しい値（または削除を表す `null`）を返す関数。
   * @param opts このエントリ書き込みに対する {@link KvOptions}。
   */
  update(
    updater: (current: TVal | null) => TVal | null,
    opts?: TKvOptions,
  ): Promise<KvUpdateResult<TVal>>;
}

/**
 * KV リポジトリ抽象。`prefix` 配下のエントリ集合を表す。
 *
 * `for await` で配下エントリを走査でき、{@link KvRepo.entry} で個別アクセスできる。
 */
export interface KvRepo<
  TVal = string,
  TKeyPart = KvKeyPart,
  TKvOptions = KvOptions,
> extends AsyncIterable<KvEntryInterface<TVal, TKeyPart, TKvOptions>> {
  /** このリポジトリが扱う配下エントリの共通プレフィックス。 */
  prefix: TKeyPart[];
  /**
   * このリポジトリの新規エントリ用の一意キー文字列を生成する
   * （典型実装は ULID）。
   */
  genKey(): string;
  /**
   * 指定キーパートの単一エントリを返す。値型を `TEntryVal` として上書き可能。
   */
  entry<TEntryVal = TVal>(
    key: TKeyPart,
  ): KvEntryInterface<TEntryVal, TKeyPart, TKvOptions>;
}
