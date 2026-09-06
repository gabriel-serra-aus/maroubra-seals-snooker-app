// GET/POST /api/admin/competitions/{id}/rating-review (rules 13, O-1, spec 5.9, 7.3).
import { getDb } from "@/lib/db/client";
import { insertRatingChange } from "@/lib/db/players";
import { getCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { requiredRating, requiredUuid } from "@/lib/api/validate";
import { badRequest, conflict, notFound } from "@/lib/logic/errors";
import { ratingReview } from "@/lib/logic/ratings";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const db = await getDb();
  const c = await getCompetition(db, id);
  if (!c) throw notFound("Competition not found");
  if (c.status !== "complete") throw conflict("The rating review opens once the competition is complete");
  const s = await loadSnapshot(db, c);
  return json({
    competition: { id: c.id, name: c.name, completed_at: c.completed_at, rating_top_count: c.rating_top_count, rating_top_delta: c.rating_top_delta, rating_bottom_count: c.rating_bottom_count, rating_bottom_delta: c.rating_bottom_delta },
    rows: ratingReview(s),
  });
});

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  if (!Array.isArray(body.changes)) throw badRequest("changes must be a list");
  const changes = (body.changes as unknown[]).map((c) => {
    if (typeof c !== "object" || c === null) throw badRequest("each change must be an object");
    const b = c as Record<string, unknown>;
    return { player_id: requiredUuid(b, "player_id"), new_rating: requiredRating(b, "new_rating") };
  });
  const db = await getDb();
  const written = await db.transaction(async (tx) => {
    const c = await getCompetition(tx, id);
    if (!c) throw notFound("Competition not found");
    if (c.status !== "complete") throw conflict("The rating review opens once the competition is complete");
    const s = await loadSnapshot(tx, c);
    let n = 0;
    for (const ch of changes) {
      const player = s.players.find((p) => p.id === ch.player_id);
      if (!player || !s.entries.some((e) => e.player_id === ch.player_id)) throw badRequest("That player did not take part");
      if (player.rating === ch.new_rating) continue;
      await insertRatingChange(tx, {
        player_id: ch.player_id, competition_id: c.id, old_rating: player.rating, new_rating: ch.new_rating,
        changed_by: session.name, reason: `review: ${c.name}`,
      });
      await tx.query("update players set rating = $2, updated_at = now() where id = $1", [ch.player_id, ch.new_rating]);
      n++;
    }
    return n;
  });
  return json({ ok: true, written });
});
