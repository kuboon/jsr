import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";

// type Entry<T> = { value: T; expireAt: number | null };

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

export class CachedKvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  #fast: KvRepo<TVal, KvKeyPart, KvOptions>;
  #slow: KvRepo<TVal, KvKeyPart, KvOptions>;

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

  genKey(): string {
    return this.#slow.genKey();
  }

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

  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    for await (const entry of this.#slow) {
      yield this.entry(entry.key);
    }
  }
}
