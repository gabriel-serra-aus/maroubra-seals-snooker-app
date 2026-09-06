// GET /api/cron/ping — keeps the free-tier database awake (spec 7.7). Bearer CRON_SECRET, not the cookie.
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { handle, json } from "@/lib/api/respond";

export const GET = handle(async (request) => {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return json({ error: "Not authorised" }, { status: 401 });
  const db = await getDb();
  await db.query("select 1 as one", []);
  return json({ ok: true, at: new Date().toISOString() });
});
