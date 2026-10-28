import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";

import { type LibsqlLike, TursoKvRepo } from "./turso.ts";

/**
 * `node:sqlite` 上の {@link LibsqlLike}。libSQL は SQLite 方言なので、
 * `@libsql/client` を依存に加えずに本物のエンジンで SQL を検証できる。
 */
const createSqliteClient = (): LibsqlLike & { close(): void } => {
  const db = new DatabaseSync(":memory:");
  return {
    execute(stmt) {
      const { sql, args } = typeof stmt === "string"
        ? { sql: stmt, args: [] }
        : stmt;
      const prepared = db.prepare(sql);
      if (/^\s*SELECT/i.test(sql)) {
        const rows = prepared.all(...args as never[]);
        return Promise.resolve({
          rows: rows as Record<string, unknown>[],
          rowsAffected: 0,
        });
      }
      const res = prepared.run(...args as never[]);
      return Promise.resolve({ rows: [], rowsAffected: Number(res.changes) });
    },
    close: () => db.close(),
  };
};

const withClient = async (fn: (client: LibsqlLike) => Promise<void>) => {
  const client = createSqliteClient();
  try {
    await fn(client);
  } finally {
    client.close();
  }
};

Deno.test("turso: 何も触っていない DB でテーブルを遅延作成して動く", async () => {
  await withClient(async (client) => {
    const repo = new TursoKvRepo<{ n: number }>(client, ["things"]);
    assertEquals(await repo.entry("a").get(), null);
    assertEquals(await repo.entry("a").update(() => ({ n: 1 })), {
      ok: true,
      val: { n: 1 },
    });
    assertEquals(await repo.entry("a").get(), { n: 1 });
  });
});

Deno.test("turso: 同時作成は一方だけが勝つ", async () => {
  await withClient(async (client) => {
    const repo = new TursoKvRepo<boolean>(client, ["consumed"]);
    const [r1, r2] = await Promise.all([
      repo.entry("jti").update((cur) => cur ?? true),
      repo.entry("jti").update((cur) => cur ?? true),
    ]);
    assertEquals([r1.ok, r2.ok].filter(Boolean).length, 1);
  });
});

Deno.test("turso: updater 実行中の他者の書き込みで ok: false", async () => {
  await withClient(async (client) => {
    const repo = new TursoKvRepo<number>(client, ["counter"]);
    await repo.entry("c").update(() => 1);
    const res = await repo.entry("c").update((cur) => {
      client.execute("UPDATE kv SET value = '5', version = version + 1");
      return (cur ?? 0) + 10;
    });
    assertEquals(res, { ok: false, val: 1 });
    assertEquals(await repo.entry("c").get(), 5);
  });
});

Deno.test("turso: null で削除、期限切れは null で走査にも出ない", async () => {
  await withClient(async (client) => {
    const repo = new TursoKvRepo<string>(client, ["ttl"]);
    await repo.entry("gone").update(() => "x", { expireIn: -1 });
    await repo.entry("stays").update(() => "y", { expireIn: 60_000 });
    await repo.entry("deleted").update(() => "z");
    assertEquals((await repo.entry("deleted").update(() => null)).ok, true);

    assertEquals(await repo.entry("gone").get(), null);
    assertEquals(await repo.entry("stays").get(), "y");
    const keys: unknown[] = [];
    for await (const e of repo) keys.push(e.key);
    assertEquals(keys, ["stays"]);
  });
});

Deno.test("turso: prefix 配下だけを走査し、キーの型を保つ", async () => {
  await withClient(async (client) => {
    const a = new TursoKvRepo<string>(client, ["ns", "a"]);
    const b = new TursoKvRepo<string>(client, ["ns", "b"]);
    await a.entry(1).update(() => "one");
    await a.entry("1").update(() => "str");
    await b.entry("x").update(() => "other");
    const keys: unknown[] = [];
    for await (const e of a) keys.push(e.key);
    assertEquals(keys.sort(), [1, "1"].sort());
  });
});
