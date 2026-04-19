import { memcache } from "./memcache.ts";
import type {
  KvEntryInterface,
  KvKey,
  KvKeyPart,
  KvOptions,
  KvRepo,
  KvUpdateResult,
} from "./types.ts";
import { monotonicUlid } from "@std/ulid";

export const kv = await Deno.openKv();

export class DenoKvRepo<TVal> implements KvRepo<TVal, KvKeyPart, KvOptions> {
  constructor(public prefix: KvKey = [], public options: KvOptions = {}) {
  }
  genKey(): string {
    return monotonicUlid();
  }
  entry<TEntryVal = TVal>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    const fullKey = [...this.prefix, key];
    return {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        return await memcache(this.fullKey).get(
          () => kv.get<TEntryVal>(fullKey).then((x) => x.value),
        );
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult> {
        const current = await kv.get<TEntryVal>(fullKey);
        const updated = updater(current.value);
        const atomic = kv.atomic().check(current);
        const cache = memcache(fullKey);
        if (updated === null) {
          cache.delete();
          const result = await atomic.delete(fullKey).commit();
          return { ok: result.ok };
        }
        cache.set(updated);
        const result = await atomic.set(fullKey, updated, opts).commit();
        return { ok: result.ok };
      },
    };
  }
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
