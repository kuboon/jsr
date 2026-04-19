import type { KvKey } from "./types.ts";

const memoryCache = new Map<KvKey, { data: unknown; expireAt: number }>();

function fetchOrNull(key: KvKey): unknown {
  if (memoryCache.has(key)) {
    const { data, expireAt } = memoryCache.get(key)!;
    if (Date.now() < expireAt) {
      return data;
    } else {
      memoryCache.delete(key);
    }
  }
  return undefined;
}

async function fetchOrStore<T>(
  key: KvKey,
  getter: () => Promise<T>,
  expireIn: number,
): Promise<T | null> {
  const cache = fetchOrNull(key);
  if (cache !== undefined) {
    return cache as T;
  }
  const now = Date.now();
  const data = await getter();
  memoryCache.set(key, { data, expireAt: now + expireIn });
  return data;
}
export function memcache(key: KvKey, expireIn: number = 5 * 1000) {
  return {
    get<T>(getter: () => Promise<T | null>) {
      return fetchOrStore(key, getter, expireIn);
    },
    set(data: unknown) {
      const now = Date.now();
      memoryCache.set(key, { data, expireAt: now + expireIn });
    },
    delete() {
      memoryCache.delete(key);
    },
  };
}
