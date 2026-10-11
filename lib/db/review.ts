// The end-of-night rating review as the page and its API route both show it (spec 3.7, 5.9).

import type { Queryable } from "./client";
import { tonightRatingChanges } from "./players";
import { loadSnapshot } from "./snapshot";
import { ratingReview, type ReviewRow } from "@/lib/logic/ratings";
import type { CompetitionRow } from "@/lib/logic/types";

export interface ReviewCompetition {
  id: string;
  name: string;
  completed_at: string | null;
  rating_scheme: CompetitionRow["rating_scheme"];
  rating_top_count: number;
  rating_top_delta: number;
  rating_bottom_count: number;
  rating_bottom_delta: number;
  rating_final_delta: number;
  rating_semi_delta: number;
  rating_buyback_lost_delta: number;
  rating_other_delta: number;
  /** Set once the review is saved (O-27): the page then shows what was saved, read-only. */
  rating_review_saved_at: string | null;
  rating_review_saved_by: string | null;
}

export async function loadReview(q: Queryable, c: CompetitionRow): Promise<{ competition: ReviewCompetition; rows: ReviewRow[] }> {
  const rows = ratingReview(await loadSnapshot(q, c));
  const tonight = await tonightRatingChanges(q, c.id, c.completed_at);
  const saved = c.rating_review_saved_at ? await tonightRatingChanges(q, c.id, c.completed_at, "after") : new Map<string, { from: number; to: number }>();
  for (const r of rows) {
    r.tonight_change = tonight.get(r.player_id) ?? null;
    r.saved_change = saved.get(r.player_id) ?? null;
  }
  return {
    competition: {
      id: c.id,
      name: c.name,
      completed_at: c.completed_at ? new Date(c.completed_at).toISOString() : null,
      rating_scheme: c.rating_scheme,
      rating_top_count: c.rating_top_count,
      rating_top_delta: c.rating_top_delta,
      rating_bottom_count: c.rating_bottom_count,
      rating_bottom_delta: c.rating_bottom_delta,
      rating_final_delta: c.rating_final_delta,
      rating_semi_delta: c.rating_semi_delta,
      rating_buyback_lost_delta: c.rating_buyback_lost_delta,
      rating_other_delta: c.rating_other_delta,
      rating_review_saved_at: c.rating_review_saved_at ? new Date(c.rating_review_saved_at).toISOString() : null,
      rating_review_saved_by: c.rating_review_saved_by ?? null,
    },
    rows,
  };
}
