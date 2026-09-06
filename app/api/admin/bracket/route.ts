// GET /api/admin/bracket (spec 7.2): same payload as the public route, cookie required, never cached.
import { getDb } from "@/lib/db/client";
import { findCurrentCompetition, getCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  requireAdmin(request);
  const db = await getDb();
  const id = new URL(request.url).searchParams.get("competition");
  const c = id ? await getCompetition(db, id) : await findCurrentCompetition(db);
  const snapshot = c ? await loadSnapshot(db, c) : null;
  return json(buildBracketPayload(snapshot), { headers: { "Cache-Control": "no-store" } });
});
