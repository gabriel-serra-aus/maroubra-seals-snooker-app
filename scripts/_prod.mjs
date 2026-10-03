// Builds the production session-pooler URL (port 5432) from .env so the password is never typed on the
// command line or URL-encoded by hand. Shared by the *:prod scripts. See CLAUDE.md > Deployment.
import fs from "node:fs";

export function prodUrl() {
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
  if (!ref || !password) throw new Error("SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD must be set in .env");
  // Port 5432 is the session pooler: scripts need it. 6543 (transaction mode) is the app's DATABASE_URL.
  const host = "aws-0-ap-southeast-2.pooler.supabase.com";
  return {
    url: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`,
    label: `postgres.${ref}@${host}:5432 (session pooler)`,
  };
}
