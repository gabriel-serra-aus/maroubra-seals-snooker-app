// GET/POST /api/admin/competitions/{id}/rating-review (rules 13, O-24, spec 5.9, 7.3).
import { getDb } from "@/lib/db/client";
import { insertRatingChange } from "@/lib/db/players";
import { loadReview } from "@/lib/db/review";
import { getCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { requiredRating, requiredUuid } from "@/lib/api/validate";
import { AppError, badRequest, conflict, notFound } from "@/lib/logic/errors";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const db = await getDb();
  const c = await getCompetition(db, id);
  if (!c) throw notFound("Competition not found");
  if (c.status !== "complete") throw conflict("The rating review opens once the competition is complete");
  return json(await loadReview(db, c));
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
    // Saved once (O-27): this claims the review, so a second save — another tab, a double tap — is refused.
    const claimed = await tx.query(
      "update competitions set rating_review_saved_at = now(), rating_review_saved_by = $2 where id = $1 and rating_review_saved_at is null returning id",
      [c.id, session.name],
    );
    if (!claimed.length) {
      const by = c.rating_review_saved_by ? ` by ${c.rating_review_saved_by}` : "";
      throw new AppError(409, `The rating review for ${c.name} was already saved${by}. Change a handicap on the Players screen now.`, { code: "review_saved" });
    }
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
