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

export const kv: Deno.Kv = await Deno.openKv();

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
