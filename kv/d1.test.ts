import { assert, assertEquals } from "@std/assert";

import {
  applyD1Schema,
  D1KvRepo,
  type D1Like,
  decodeKey,
  encodeKey,
  lazyD1,
  sweepExpired,
} from "./d1.ts";
import { createSqliteD1 } from "./d1Sqlite.ts";

const withDb = async (
  fn: (db: ReturnType<typeof createSqliteD1>) => Promise<void>,
  options?: Parameters<typeof createSqliteD1>[0],
) => {
  const db = createSqliteD1(options);
  try {
    await fn(db);
  } finally {
    db.close();
  }
};

Deno.test("lazyD1: 何も触っていない DB でも初回から使える", async () => {
  // プレビューや新規 DB、`cf dev` のローカル DB が始まる状態。
  await withDb(async (raw) => {
    const repo = new D1KvRepo<{ n: number }>(lazyD1(() => raw), ["things"]);
    assertEquals(await repo.entry("a").get(), null);
    assert((await repo.entry("a").update(() => ({ n: 1 }))).ok);
    assertEquals(await repo.entry("a").get(), { n: 1 });
    assertEquals((await repo.entry("b").update(() => ({ n: 2 }))).ok, true);
    const keys: unknown[] = [];
    for await (const e of repo) keys.push(e.key);
    assertEquals(keys, ["a", "b"]);
  }, { schema: false });
});

Deno.test("lazyD1: ステートメント実行まで binding に触らない", async () => {
  // Workers のモジュールスコープでは binding が未接続なので、リポジトリを
  // 組み立てるだけでは参照してはいけない。
  await withDb(async (raw) => {
    let lookups = 0;
    const db = lazyD1(() => {
      lookups++;
      return raw;
    });
    const repo = new D1KvRepo<number>(db, ["x"]);
    repo.entry("a");
    db.prepare("SELECT 1").bind(1, 2);
    assertEquals(lookups, 0);
    await repo.entry("a").get();
    assert(lookups > 0);
  }, { schema: false });
});

Deno.test("lazyD1: スキーマ適用の失敗は記憶せず再試行する", async () => {
  await withDb(async (raw) => {
    let fail = true;
    const flaky: D1Like = {
      prepare: (sql) => {
        if (fail) throw new Error("transient");
        return raw.prepare(sql);
      },
    };
    const repo = new D1KvRepo<number>(lazyD1(() => flaky), ["x"]);
    await repo.entry("a").get().then(
      () => assert(false, "expected the first call to fail"),
      () => {},
    );
    fail = false;
    // 一度の失敗で isolate 内の全リクエストが失敗し続けてはいけない。
    assertEquals(await repo.entry("a").get(), null);
  }, { schema: false });
});

Deno.test("applyD1Schema: 既存テーブルに適用しても何も変わらない", async () => {
  await withDb(async (raw) => {
    const repo = new D1KvRepo<number>(raw, ["x"]);
    await repo.entry("a").update(() => 7);
    await applyD1Schema(raw);
    await applyD1Schema(raw);
    assertEquals(await repo.entry("a").get(), 7);
  });
});

Deno.test("entry: set と get で値を保存・取得できる", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<{ n: number }>(db, ["things"]);
    assertEquals(await repo.entry("a").get(), null);
    const res = await repo.entry("a").update(() => ({ n: 1 }));
    assertEquals(res, { ok: true, val: { n: 1 } });
    assertEquals(await repo.entry("a").get(), { n: 1 });
  });
});

Deno.test("entry: 同時作成は一方だけが勝つ（単回使用）", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<boolean>(db, ["oauth", "consumed"]);
    // 同じ認可コードを replay する二つのリクエストのように、両方が書く前に
    // 「存在しない」と読む。
    const a = repo.entry("jti-1");
    const b = repo.entry("jti-1");
    const [r1, r2] = await Promise.all([
      a.update((cur) => (cur ? cur : true)),
      b.update((cur) => (cur ? cur : true)),
    ]);
    assertEquals([r1.ok, r2.ok].filter(Boolean).length, 1);
  });
});

Deno.test("entry: update は再読込するので並行書き込みを上書きしない", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<number>(db, ["counter"]);
    await repo.entry("c").update(() => 1);

    const stale = repo.entry("c");
    assertEquals(await stale.get(), 1);
    await repo.entry("c").update(() => 2);

    // update() 内で読み直すので 2 を見て 12 で成功する。CAS が守るのは
    // コミット済みの行であって、先に読んだ値ではない。
    const res = await stale.update((cur) => (cur ?? 0) + 10);
    assertEquals(res, { ok: true, val: 12 });
    assertEquals(await repo.entry("c").get(), 12);
  });
});

Deno.test("entry: updater 実行中に他者が書くと ok: false と現在値が返る", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<number>(db, ["counter"]);
    await repo.entry("c").update(() => 1);

    const res = await repo.entry("c").update((cur) => {
      // 読んだ後・書く前に割り込む。
      db.prepare("UPDATE kv SET value = '5', version = version + 1").run();
      return (cur ?? 0) + 10;
    });
    assertEquals(res.ok, false);
    assertEquals(res.val, 1);
    assertEquals(await repo.entry("c").get(), 5);
  });
});

Deno.test("entry: update で null を返すと削除される", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<string>(db, ["things"]);
    await repo.entry("a").update(() => "x");
    assertEquals(await repo.entry("a").update(() => null), {
      ok: true,
      val: null,
    });
    assertEquals(await repo.entry("a").get(), null);
    // 無いキーの削除は no-op で成功。
    assertEquals((await repo.entry("a").update(() => null)).ok, true);
  });
});

Deno.test("entry: 期限切れは null として読まれ、走査にも現れない", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<string>(db, ["ttl"]);
    await repo.entry("gone").update(() => "x", { expireIn: -1 });
    await repo.entry("stays").update(() => "y", { expireIn: 60_000 });

    assertEquals(await repo.entry("gone").get(), null);
    assertEquals(await repo.entry("stays").get(), "y");

    const keys: unknown[] = [];
    for await (const e of repo) keys.push(e.key);
    assertEquals(keys, ["stays"]);

    assertEquals(await sweepExpired(db), 1);
  });
});

Deno.test("entry: 掃除前の期限切れ行にも上書き・削除できる", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<string>(db, ["ttl"]);
    await repo.entry("k").update(() => "old", { expireIn: -1 });

    // updater には null が渡り、INSERT の衝突にならず書ける。
    const seen: (string | null)[] = [];
    const res = await repo.entry("k").update((cur) => {
      seen.push(cur);
      return "new";
    });
    assertEquals(seen, [null]);
    assertEquals(res, { ok: true, val: "new" });
    assertEquals(await repo.entry("k").get(), "new");

    await repo.entry("k").update(() => "old2", { expireIn: -1 });
    assertEquals((await repo.entry("k").update(() => null)).ok, true);
    assertEquals(await sweepExpired(db), 0);
  });
});

Deno.test("entry: リポジトリ既定の expireIn が効く", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<string>(db, ["ttl"], { expireIn: -1 });
    await repo.entry("a").update(() => "x");
    assertEquals(await repo.entry("a").get(), null);
    await repo.entry("b").update(() => "y", { expireIn: 60_000 });
    assertEquals(await repo.entry("b").get(), "y");
  });
});

Deno.test("list: prefix 配下のみを走査し、prefix 自身のキーは含めない", async () => {
  await withDb(async (db) => {
    const push = new D1KvRepo<string>(db, ["push", "subscription"]);
    const other = new D1KvRepo<string>(db, ["push", "ratelimit"]);
    await push.entry("s1").update(() => "a");
    await push.entry("s2").update(() => "b");
    await other.entry("r1").update(() => "c");
    // prefix と同じキーに置かれた値は、その prefix の走査に現れてはいけない。
    await new D1KvRepo<string>(db, ["push"]).entry("subscription").update(
      () => "self",
    );

    const keys: unknown[] = [];
    for await (const e of push) keys.push(e.key);
    assertEquals(keys, ["s1", "s2"]);
  });
});

Deno.test("list: 深いキーは祖先 prefix の走査に現れる", async () => {
  await withDb(async (db) => {
    // ["user_credentials", userId, credentialId] を [.., userId] で走査する。
    const index = new D1KvRepo<string>(db, ["user_credentials", "alice"]);
    await index.entry("cred-1").update(() => "x");
    const deep = new D1KvRepo<string>(db, ["user_credentials"]);
    const keys: unknown[] = [];
    for await (const e of deep) keys.push(e.key);
    assertEquals(keys, ["alice"]);
  });
});

Deno.test("list: genKey (ULID) の順に並ぶ", async () => {
  await withDb(async (db) => {
    const repo = new D1KvRepo<number>(db, ["log"]);
    const k1 = repo.genKey();
    const k2 = repo.genKey();
    await repo.entry(k2).update(() => 2);
    await repo.entry(k1).update(() => 1);
    const values: number[] = [];
    for await (const e of repo) values.push((await e.get())!);
    assertEquals(values, [1, 2]);
  });
});

Deno.test("encodeKey/decodeKey: パートの型を保って往復する", () => {
  const key = ["s", 42, true, 7n];
  assertEquals(decodeKey(encodeKey(key)), key);
  // 数値と同じ桁の文字列は衝突してはいけない。
  assert(encodeKey([1]) !== encodeKey(["1"]));
});

Deno.test("encodeKey/decodeKey: 区切り文字とバックスラッシュが生き残る", () => {
  for (
    const part of [
      "a\u0000b",
      "a\u0001b",
      "a\\0b",
      "a\\1b",
      "back\\slash",
      "\\",
      "\\\\0",
      "plain",
    ]
  ) {
    assertEquals(decodeKey(encodeKey([part])), [part]);
  }
});

Deno.test("encodeKey: エスケープされた区切り文字でキー境界を偽装できない", async () => {
  await withDb(async (db) => {
    // 生の区切り文字を含む 1 パート "a\u0001b" が 2 パート ["a","b"] と
    // 衝突してはいけない。
    const one = new D1KvRepo<string>(db, ["ns"]);
    await one.entry("a\u0001b").update(() => "single");
    const two = new D1KvRepo<string>(db, ["ns", "a"]);
    await two.entry("b").update(() => "nested");

    assertEquals(await one.entry("a\u0001b").get(), "single");
    assertEquals(await two.entry("b").get(), "nested");
  });
});
