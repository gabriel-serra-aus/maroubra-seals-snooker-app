// GET /api/public/bracket (spec 7.2). Read-only; CDN-cached for 5 s, which is the cost control in spec 9.
import { getDb } from "@/lib/db/client";
import { findCurrentCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { handle } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = await getDb();
  const c = await findCurrentCompetition(db);
  const snapshot = c ? await loadSnapshot(db, c) : null;
  return Response.json(buildBracketPayload(snapshot), {
    headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" },
  });
});
