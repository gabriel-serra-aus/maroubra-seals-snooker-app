// End-of-night rating adjustment (rules 13, O-1, spec 5.9): finishing order, top/bottom groups, clamping.

import type { Snapshot } from "./types";

/** Stored rating range (spec 6.3). Negatives are real: strong players go below zero. */
export const RATING_MIN = -100;
export const RATING_MAX = 200;

export interface ReviewRow {
  player_id: string;
  name: string;
  reached_round: number;
  won_final: boolean;
  /** How the night ended for them, for display: "won", "final", "R3", "R1", ... */
  finish: string;
  current_rating: number;
  proposed_rating: number;
  delta: number;
  group: "top" | "bottom" | "none";
}

export function clampRating(r: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, r));
}

/** The highest round an entry had a match in or advanced into (joined round for an unplayed override add). */
function reachOfEntry(s: Snapshot, entryId: string, joined: number): number {
  let reach = joined;
  for (const m of s.matches) {
    if (m.player_a_id === entryId || m.player_b_id === entryId) reach = Math.max(reach, m.round);
  }
  for (const fp of s.freePasses) if (fp.entry_id === entryId) reach = Math.max(reach, fp.from_round + 1);
  return reach;
}

/** Every player who took part, best first, with the proposed new rating (spec 5.9). */
export function ratingReview(s: Snapshot): ReviewRow[] {
  const c = s.competition;
  const finalRound = Math.max(1, ...s.matches.map((m) => m.round));
  const byPlayer = new Map<string, { reached: number; won: boolean }>();
  for (const e of s.entries) {
    const reach = reachOfEntry(s, e.id, e.joined_round);
    const won = c.status === "complete" && c.winner_entry_id === e.id;
    const cur = byPlayer.get(e.player_id);
    byPlayer.set(e.player_id, { reached: Math.max(cur?.reached ?? 0, reach), won: (cur?.won ?? false) || won });
  }
  const rows: ReviewRow[] = [];
  for (const [player_id, { reached, won }] of byPlayer) {
    const p = s.players.find((x) => x.id === player_id);
    if (!p) continue;
    const finish = won ? "won" : reached === finalRound && finalRound > 1 ? "final" : `R${reached}`;
    rows.push({
      player_id,
      name: p.name,
      reached_round: reached,
      won_final: won,
      finish,
      current_rating: p.rating,
      proposed_rating: p.rating,
      delta: 0,
      group: "none",
    });
  }
  const best = rows.slice().sort(
    (a, b) =>
      b.reached_round - a.reached_round ||
      Number(b.won_final) - Number(a.won_final) ||
      a.current_rating - b.current_rating ||
      a.name.localeCompare(b.name),
  );
  const worst = best.slice().reverse();
  const top = new Set(best.slice(0, c.rating_top_count).map((r) => r.player_id));
  for (const r of best) {
    if (top.has(r.player_id)) {
      r.group = "top";
      r.delta = c.rating_top_delta;
    }
  }
  let taken = 0;
  for (const r of worst) {
    if (taken >= c.rating_bottom_count) break;
    if (top.has(r.player_id)) continue;
    r.group = "bottom";
    r.delta = c.rating_bottom_delta;
    taken++;
  }
  for (const r of best) {
    r.proposed_rating = clampRating(r.current_rating + r.delta);
    r.delta = r.proposed_rating - r.current_rating;
  }
  return best;
}
