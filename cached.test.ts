import { assertEquals } from "@std/assert";
import { CachedKvRepo } from "./cached.ts";
import { MemoryKvRepo } from "./memory.ts";

const makeRepo = <T>() => {
  const fast = new MemoryKvRepo<T>(["fast"]);
  const slow = new MemoryKvRepo<T>(["slow"]);
  const cached = new CachedKvRepo<T>(["cached"], { fast, slow });
  return { fast, slow, cached };
};

Deno.test("get: fast にあれば fast の値を返し slow を見ない", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  await fast.entry("k").update(() => "from-fast");
  await slow.entry("k").update(() => "from-slow");

  assertEquals(await cached.entry("k").get(), "from-fast");
});

Deno.test("get: fast に無ければ slow から取って fast に書き込む", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  await slow.entry("k").update(() => "from-slow");

  assertEquals(await fast.entry("k").get(), null);
  assertEquals(await cached.entry("k").get(), "from-slow");
  assertEquals(await fast.entry("k").get(), "from-slow");
});

Deno.test("get: fast にも slow にも無ければ null", async () => {
  const { cached } = makeRepo<string>();
  assertEquals(await cached.entry("missing").get(), null);
});

Deno.test("update: fast と slow の両方に書き込まれる", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  const result = await cached.entry("k").update(() => "hello");

  assertEquals(result.ok, true);
  assertEquals(result.val, "hello");
  assertEquals(await fast.entry("k").get(), "hello");
  assertEquals(await slow.entry("k").get(), "hello");
});

Deno.test("update: null を返すと fast / slow の両方から削除される", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  await cached.entry("k").update(() => "value");
  assertEquals(await fast.entry("k").get(), "value");
  assertEquals(await slow.entry("k").get(), "value");

  await cached.entry("k").update(() => null);
  assertEquals(await fast.entry("k").get(), null);
  assertEquals(await slow.entry("k").get(), null);
});

Deno.test("update: updater には slow の現在値が渡される", async () => {
  const { fast, slow, cached } = makeRepo<number>();
  await slow.entry("counter").update(() => 10);
  await fast.entry("counter").update(() => 999); // fast は意図的にズレた値

  let received: number | null = null;
  await cached.entry("counter").update((current) => {
    received = current;
    return (current ?? 0) + 1;
  });

  assertEquals(received, 10);
  assertEquals(await slow.entry("counter").get(), 11);
  assertEquals(await fast.entry("counter").get(), 11);
});

Deno.test("update: 既存値を上書きすると fast にも反映される", async () => {
  const { fast, cached } = makeRepo<string>();
  await cached.entry("k").update(() => "v1");
  assertEquals(await fast.entry("k").get(), "v1");

  await cached.entry("k").update(() => "v2");
  assertEquals(await fast.entry("k").get(), "v2");
});

Deno.test("update: opts.expireIn が fast と slow の両方に伝播する", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  await cached.entry("k").update(() => "temp", { expireIn: 1 });
  await new Promise((r) => setTimeout(r, 10));

  assertEquals(await fast.entry("k").get(), null);
  assertEquals(await slow.entry("k").get(), null);
});

Deno.test("iteration: slow をベースに走査する", async () => {
  const { slow, cached } = makeRepo<string>();
  await slow.entry("a").update(() => "A");
  await slow.entry("b").update(() => "B");

  const collected: Array<[string, string | null]> = [];
  for await (const e of cached) {
    collected.push([String(e.key), await e.get()]);
  }
  collected.sort(([a], [b]) => a.localeCompare(b));
  assertEquals(collected, [
    ["a", "A"],
    ["b", "B"],
  ]);
});

Deno.test("iteration: fast にだけあるキーはイテレートに現れない", async () => {
  const { fast, slow, cached } = makeRepo<string>();
  await slow.entry("real").update(() => "in-slow");
  await fast.entry("ghost").update(() => "only-fast");

  const keys: string[] = [];
  for await (const e of cached) {
    keys.push(String(e.key));
  }
  assertEquals(keys, ["real"]);
});

Deno.test("entry.fullKey は cached の prefix + key", () => {
  const { cached } = makeRepo<string>();
  const entry = cached.entry("k");
  assertEquals(entry.fullKey, ["cached", "k"]);
  assertEquals(entry.key, "k");
});

Deno.test("genKey: slow に委譲して非空の文字列を返す", () => {
  const { cached } = makeRepo<string>();
  const id = cached.genKey();
  assertEquals(typeof id, "string");
  assertEquals(id.length > 0, true);
});
