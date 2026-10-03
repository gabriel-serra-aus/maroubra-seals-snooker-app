// Applies supabase/migrations/*.sql to the production Supabase database (session pooler, from .env).
// Usage: npm run db:migrate:prod
// Prints "skip" for every migration already recorded in schema_migrations, so it
// doubles as the "is production up to date?" check. See CLAUDE.md > Deployment.
import { spawnSync } from "node:child_process";
import { prodUrl } from "./_prod.mjs";

const { url, label } = prodUrl();
console.log(`Target: ${label}`);
const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
