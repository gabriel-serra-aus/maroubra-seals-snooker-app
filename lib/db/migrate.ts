import fs from "node:fs";
import path from "node:path";
import type { Db } from "./client";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Applies every supabase/migrations/*.sql not yet recorded in schema_migrations, in filename order. */
export async function runMigrations(db: Db): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.query(sqlText);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    done.push(file);
  }
  return done;
}
