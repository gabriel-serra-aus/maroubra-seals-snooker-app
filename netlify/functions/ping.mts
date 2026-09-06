// Daily scheduled function (netlify.toml) that calls the app's own /api/cron/ping so the
// free-tier Supabase project is never idle for 7 days (spec 7.7, 8.1, 9.2).
export default async () => {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("ping: URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron/ping`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(`ping: ${res.status}`);
};
