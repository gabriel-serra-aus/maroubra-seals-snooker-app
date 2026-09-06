// GET /api/admin/players/{id}/rating-history (spec 7.3).
import { getDb } from "@/lib/db/client";
import { getPlayer, ratingHistory } from "@/lib/db/players";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const db = await getDb();
  const player = await getPlayer(db, id);
  return json({ player, history: await ratingHistory(db, id) });
});
