import { assertEquals, assertNotEquals } from "@std/assert";
import { MemoryKvRepo } from "./memory.ts";

Deno.test("entry: set と get で値を保存・取得できる", async () => {
  const repo = new MemoryKvRepo<string>(["test"]);
  const entry = repo.entry("key1");
  await entry.update(() => "hello");
  const value = await entry.get();
  assertEquals(value, "hello");
});

Deno.test("entry: get は存在しないキーに null を返す", async () => {
  const repo = new MemoryKvRepo<string>(["test"]);
  const value = await repo.entry("missing").get();
  assertEquals(value, null);
});

Deno.test("entry: update で値を更新できる", async () => {
  const repo = new MemoryKvRepo<number>(["test"]);
  const entry = repo.entry("counter");
  await entry.update(() => 1);
  const result = await entry.update((n) => (n ?? 0) + 1);
  assertEquals(result.ok, true);
  assertEquals(await entry.get(), 2);
});

Deno.test("entry: update で null を返すと削除される", async () => {
  const repo = new MemoryKvRepo<string>(["test"]);
  const entry = repo.entry("remove");
  await entry.update(() => "value");
  assertEquals(await entry.get(), "value");
  await entry.update(() => null);
  assertEquals(await entry.get(), null);
});

Deno.test("entry: expireIn 経過後は null を返す", async () => {
  const repo = new MemoryKvRepo<string>(["test"]);
  const entry = repo.entry("expiring");
  await entry.update(() => "temp", { expireIn: 1 }); // 1ms
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(await entry.get(), null);
});

Deno.test("list: create で新規エントリを作成しイテレートできる", async () => {
  const repo = new MemoryKvRepo<string>(["list-test"]);
  const key = repo.genKey();
  await repo.entry(key).update(() => "item1");
  assertNotEquals(key, null);

  const items: string[] = [];
  for await (const e of repo) {
    const v = await e.get();
    if (v) items.push(v);
  }
  assertEquals(items, ["item1"]);
});

Deno.test("list: get で既存エントリを取得できる", async () => {
  const repo = new MemoryKvRepo<string>(["list-test2"]);
  const key = repo.genKey();
  await repo.entry(key).update(() => "hello");
  assertNotEquals(key, null);

  const entry = repo.entry(key);
  assertEquals(await entry.get(), "hello");
});

Deno.test("prefix が異なるリポジトリ間で分離される", async () => {
  const repoA = new MemoryKvRepo<string>(["a"]);
  const repoB = new MemoryKvRepo<string>(["b"]);
  await repoA.entry("x").update(() => "from-a");
  assertEquals(await repoB.entry("x").get(), null);
});
