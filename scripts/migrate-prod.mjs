// Applies supabase/migrations/*.sql to the production Supabase database.
// Builds the session-pooler URL (port 5432) from .env so the password is never typed
// on the command line or URL-encoded by hand. Usage: npm run db:migrate:prod
// Prints "skip" for every migration already recorded in schema_migrations, so it
// doubles as the "is production up to date?" check. See CLAUDE.md > Deployment.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const ref = env.SUPABASE_PROJECT_REF;
const password = env.SUPABASE_DB_PASSWORD;
if (!ref || !password) {
  console.error("SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD must be set in .env");
  process.exit(1);
}

// Port 5432 is the session pooler: migrations need it. 6543 (transaction mode) is the app's DATABASE_URL.
const host = "aws-0-ap-southeast-2.pooler.supabase.com";
const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;

console.log(`Target: postgres.${ref}@${host}:5432 (session pooler)`);
const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
