// Loads a backup (scripts/backup.mjs) into a fresh local PGlite database and checks every row count.
// Proves a backup is good, and gives a copy of production to rehearse data scripts on.
// Usage: npm run db:restore -- backups/<file>.json [data dir, default .data/restore]
// Refuses a data dir that already exists, and never touches DATABASE_URL.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const [file, dataDir = ".data/restore"] = process.argv.slice(2);
if (!file) throw new Error("Usage: npm run db:restore -- <backup.json> [data dir]");
if (fs.existsSync(dataDir)) throw new Error(`${dataDir} already exists; pick a new data dir or delete it first`);
const dump = JSON.parse(fs.readFileSync(file, "utf8"));

const env = { ...process.env, PGLITE_DATA_DIR: dataDir };
delete env.DATABASE_URL;
const migrated = spawnSync(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit", env });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const applied = new Set(dump.tables.schema_migrations.map((r) => r.name));
const local = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
const newer = local.filter((f) => !applied.has(f));
if (newer.length) console.log(`Note: the backup predates ${newer.join(", ")}; restored onto the current schema.`);

delete process.env.DATABASE_URL;
process.env.PGLITE_DATA_DIR = dataDir;
const { openDb, TABLES } = await import("./_db.mjs");
const { query, transaction, close } = await openDb();

await transaction(async (q) => {
  for (const t of TABLES) {
    if (t === "schema_migrations") continue;
    // competitions.winner_entry_id points at entries, which come later: insert it empty, fill it after.
    const rows = t === "competitions" ? dump.tables[t].map((r) => ({ ...r, winner_entry_id: null })) : dump.tables[t];
    await q(`insert into ${t} overriding system value select * from json_populate_recordset(null::${t}, $1::json)`, [
      JSON.stringify(rows),
    ]);
  }
  for (const c of dump.tables.competitions.filter((r) => r.winner_entry_id)) {
    await q("update competitions set winner_entry_id = $1 where id = $2", [c.winner_entry_id, c.id]);
  }
  for (const t of ["rating_changes", "admin_actions"]) {
    await q(`select setval(pg_get_serial_sequence('${t}', 'id'), coalesce((select max(id) from ${t}), 0) + 1, false)`);
  }
});

let ok = true;
for (const t of TABLES.filter((t) => t !== "schema_migrations")) {
  const [{ n }] = await query(`select count(*)::int as n from ${t}`);
  const want = dump.tables[t].length;
  if (n !== want) ok = false;
  console.log(`${t.padEnd(18)} ${String(n).padStart(5)} / ${want}${n === want ? "" : "  MISMATCH"}`);
}
await close();
if (!ok) throw new Error("Row counts differ from the backup");
console.log(`Restored ${file} (taken ${dump.taken_at}) into ${dataDir}`);
