// Dumps every table to backups/<timestamp>-<target>.json (gitignored: it holds members' names and photos).
// Run it before any data change. `npm run db:restore -- <file>` loads a dump into a scratch PGlite database,
// which is how a backup is proved good.
// Usage: npm run db:backup        (DATABASE_URL, or the local PGlite database when unset)
//        npm run db:backup:prod   (production, session pooler from .env)
import fs from "node:fs";
import path from "node:path";
import { openDb, TABLES } from "./_db.mjs";
import { prodUrl } from "./_prod.mjs";

const prod = process.argv.includes("--prod");
if (prod) {
  const { url, label } = prodUrl();
  process.env.DATABASE_URL = url;
  console.log(`Target: ${label}`);
}
const { query, close, label } = await openDb();

// A table the list doesn't know would be silently left out of the backup: refuse instead.
const present = (await query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).map(
  (r) => r.table_name,
);
const unknown = present.filter((t) => !TABLES.includes(t));
if (unknown.length) throw new Error(`Tables missing from TABLES in scripts/_db.mjs: ${unknown.join(", ")}`);

const dump = { taken_at: new Date().toISOString(), source: prod ? "production" : label, tables: {} };
for (const t of TABLES) {
  // json_agg keeps every value in its text form (bytea as \x hex), which json_populate_recordset reads back.
  const [{ rows }] = await query(`select coalesce(json_agg(t), '[]'::json) as rows from ${t} t`);
  dump.tables[t] = typeof rows === "string" ? JSON.parse(rows) : rows;
  console.log(`${t.padEnd(18)} ${dump.tables[t].length}`);
}
await close();

fs.mkdirSync("backups", { recursive: true });
const file = path.join("backups", `${dump.taken_at.replace(/[:.]/g, "-")}-${prod ? "prod" : "local"}.json`);
fs.writeFileSync(file, JSON.stringify(dump));
console.log(`Wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
