import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, type Db } from "@/lib/db/client";

let db: Db;

beforeAll(async () => {
  await resetDbForTests();
  db = await getDb();
});
afterAll(() => resetDbForTests());

describe("schema (spec 6)", () => {
  it("applies the migration on an in-memory PGlite database", async () => {
    const rows = await db.query<{ name: string }>("select name from schema_migrations order by name");
    expect(rows.map((r) => r.name)).toEqual(["0001_init.sql", "0002_fixed_bracket.sql", "0003_late_arrivals.sql"]);
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      "admin_actions",
      "competitions",
      "entries",
      "free_passes",
      "matches",
      "players",
      "rating_changes",
      "schema_migrations",
    ]);
  });

  it("allows negative ratings and rejects out-of-range ones (5.6)", async () => {
    const [p] = await db.query<{ id: string; rating: number }>(
      "insert into players (name, rating) values ($1, $2) returning id, rating",
      ["Neg Player", -5],
    );
    expect(p.rating).toBe(-5);
    await expect(db.query("insert into players (name, rating) values ($1, $2)", ["Too Low", -101])).rejects.toThrow();
    await expect(db.query("insert into players (name, rating) values ($1, $2)", ["neg player", 10])).rejects.toThrow();
  });

  it("allows only one competition in setup or in_progress at a time (6.3, 5.11)", async () => {
    await db.query("insert into competitions (name, bracket_size) values ($1, 16)", ["Night A"]);
    await expect(
      db.query("insert into competitions (name, bracket_size) values ($1, 16)", ["Night B"]),
    ).rejects.toThrow();
    await db.query(
      "update competitions set status = 'abandoned', abandoned_at = now() where name = $1",
      ["Night A"],
    );
    await db.query("insert into competitions (name, bracket_size) values ($1, 32)", ["Night B"]);
    const rows = await db.query<{ status: string }>("select status from competitions order by created_at");
    expect(rows.map((r) => r.status)).toEqual(["abandoned", "setup"]);
  });

  it("rolls back a failed transaction", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("insert into players (name, rating) values ($1, $2)", ["Rollback Me", 10]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await db.query("select 1 from players where name = $1", ["Rollback Me"]);
    expect(rows).toHaveLength(0);
  });

  it("returns jsonb as objects and timestamps as Dates", async () => {
    await db.query("insert into admin_actions (actor, action, details) values ($1, $2, $3::jsonb)", [
      "Gabriel",
      "test",
      JSON.stringify({ a: 1 }),
    ]);
    const [row] = await db.query<{ details: { a: number }; created_at: Date }>(
      "select details, created_at from admin_actions where action = 'test'",
    );
    expect(row.details).toEqual({ a: 1 });
    expect(row.created_at).toBeInstanceOf(Date);
  });
});
