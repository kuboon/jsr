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

type CloudflareKvListResult = {
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
};

export type CloudflareKvNamespace = {
  get(key: string, type: "json"): Promise<unknown | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(
    options: { prefix: string; cursor?: string },
  ): Promise<CloudflareKvListResult>;
};

const expireIn = 40 * 60 * 1000; // 40分
const locks = new Map<string, Promise<void>>();

function serializePart(part: unknown): string {
  if (typeof part === "string") return `s:${encodeURIComponent(part)}`;
  if (typeof part === "number") return `n:${part}`;
  if (typeof part === "bigint") return `i:${part}`;
  if (typeof part === "boolean") return `b:${part ? "1" : "0"}`;
  throw new Error(`Unsupported key part type: ${typeof part}`);
}

function deserializePart(encoded: string): KvKeyPart {
  if (encoded.startsWith("s:")) return decodeURIComponent(encoded.slice(2));
  if (encoded.startsWith("n:")) return Number(encoded.slice(2));
  if (encoded.startsWith("i:")) return BigInt(encoded.slice(2));
  if (encoded.startsWith("b:")) return encoded.slice(2) === "1";
  throw new Error(`Unsupported key part encoding: ${encoded}`);
}

function keyToString(key: KvKey): string {
  return key.map(serializePart).join("/");
}

function stringToKey(serialized: string): KvKey {
  if (serialized.length === 0) return [];
  return serialized.split("/").map(deserializePart);
}

async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === queued) {
      locks.delete(key);
    }
  }
}

export class CloudflareKvRepo<TVal>
  implements KvRepo<TVal, KvKeyPart, KvOptions> {
  constructor(
    private namespace: CloudflareKvNamespace,
    public prefix: KvKey = [],
    public options: KvOptions = {},
  ) {
  }

  genKey(): string {
    return monotonicUlid();
  }

  entry<TEntryVal = TVal>(
    key: KvKeyPart,
  ): KvEntryInterface<TEntryVal, KvKeyPart, KvOptions> {
    const fullKey = [...this.prefix, key];
    const strKey = keyToString(fullKey);
    const namespace = this.namespace;
    const repoOptions = this.options;
    return {
      key,
      fullKey,
      async get(): Promise<TEntryVal | null> {
        return await memcache(fullKey).get(() =>
          namespace.get(strKey, "json") as Promise<TEntryVal | null>
        );
      },
      async update(
        updater: (current: TEntryVal | null) => TEntryVal | null,
        opts: KvOptions = {},
      ): Promise<KvUpdateResult> {
        return await withKeyLock(strKey, async () => {
          const current = await namespace.get(strKey, "json") as
            | TEntryVal
            | null;
          const updated = updater(current);
          const cache = memcache(fullKey);
          if (updated === null) {
            cache.delete();
            await namespace.delete(strKey);
            return { ok: true };
          }
          cache.set(updated);
          const expireInMs = opts.expireIn ?? repoOptions.expireIn ?? expireIn;
          await namespace.put(strKey, JSON.stringify(updated), {
            expirationTtl: Math.max(1, Math.ceil(expireInMs / 1000)),
          });
          return { ok: true };
        });
      },
    };
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    KvEntryInterface<TVal, KvKeyPart, KvOptions>
  > {
    const serializedPrefix = keyToString(this.prefix);
    const prefixString = serializedPrefix.length === 0
      ? ""
      : `${serializedPrefix}/`;

    let cursor: string | undefined;
    do {
      const result = await this.namespace.list({
        prefix: prefixString,
        cursor,
      });
      for (const item of result.keys) {
        const fullKey = stringToKey(item.name);
        const key = fullKey.slice(this.prefix.length)[0];
        if (key !== undefined) {
          yield this.entry<TVal>(key);
        }
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  }
}
export const test = { stringToKey, keyToString };
