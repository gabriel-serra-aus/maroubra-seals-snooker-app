// Applies supabase/migrations/*.sql to DATABASE_URL (or the local PGlite database when unset).
// Usage: DATABASE_URL=postgres://... npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import { openDb } from "./_db.mjs";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const { query, transaction, close, label } = await openDb();

await query(
  "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
);
const applied = new Set((await query("select name from schema_migrations")).map((r) => r.name));
for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip    ${file}`);
    continue;
  }
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  await transaction(async (q) => {
    await q(text);
    await q("insert into schema_migrations (name) values ($1)", [file]);
  });
  console.log(`applied ${file}`);
}
await close();
console.log(`Migrated ${label}`);
