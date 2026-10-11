// End-of-night rating adjustment (rules 13, spec 5.9): a change per finishing position (O-24), or the O-1
// top/bottom groups for nights reviewed under them; finishing order, the story of each night, clamping.

import { buybackEntryOf, matchLabel, matchesOf, opponentOf, playerName, roundsFor } from "./derive";
import type { EntryRow, Snapshot } from "./types";

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
  /** O-24 (`finish` scheme): final, semi, buyback_lost, other. O-1 (`groups`): top, bottom, none. */
  group: ReviewGroup;
  /** How the night went, for the review page (spec 3.7): "Lost R1M2 to Dee Park → bought back → lost R1M7 to Gus Ray". */
  story: string;
  bought_back: boolean;
  /** A rating changed during the night (O-26), filled in by lib/db/review.ts: the end-of-night change comes on top. */
  tonight_change: { from: number; to: number } | null;
  /** What the saved review wrote for them (O-27), filled in by lib/db/review.ts; null before saving or when unchanged. */
  saved_change: { from: number; to: number } | null;
}

export type ReviewGroup = "final" | "semi" | "buyback_lost" | "other" | "top" | "bottom" | "none";

/** The O-24 groups in the order the review shows them (spec 3.7). */
export const FINISH_GROUPS = ["final", "semi", "buyback_lost", "other"] as const;

export function clampRating(r: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, r));
}

/**
 * The highest round an entry had a match in or advanced into (joined round for an unplayed override add).
 * A win counts as reaching the next round even before the opponent there is known: a night ended early
 * leaves winners waiting alone (spec 5.9, O-24).
 */
function reachOfEntry(s: Snapshot, entryId: string, joined: number): number {
  const top = roundsFor(s.competition.bracket_size);
  let reach = joined;
  for (const m of s.matches) {
    if (m.player_a_id === entryId || m.player_b_id === entryId) reach = Math.max(reach, m.round);
    if (m.state === "finished" && m.winner_id === entryId) reach = Math.max(reach, Math.min(top, m.round + 1));
  }
  for (const fp of s.freePasses) if (fp.entry_id === entryId) reach = Math.max(reach, fp.from_round + 1);
  return reach;
}

/** Every player who took part, best first, with the proposed new rating (spec 5.9). */
export function ratingReview(s: Snapshot): ReviewRow[] {
  const c = s.competition;
  const finalRound = Math.max(1, ...s.matches.map((m) => m.round));
  // A night ended early (spec 5.11) has no champion and never played a final, so the furthest round it
  // reached is not "the final" — everyone is labelled by the round they got to.
  const endedEarly = c.status === "complete" && c.winner_entry_id === null;
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
    const finish = won ? "won" : !endedEarly && reached === finalRound && finalRound > 1 ? "final" : `R${reached}`;
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
      story: nightStory(s, player_id),
      bought_back: buybackEntryOf(s, player_id) !== undefined,
      tonight_change: null,
      saved_change: null,
    });
  }
  if (c.rating_scheme === "finish") return byFinish(s, rows);
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

/**
 * True when the player lost round one, bought back, and lost again in round one (O-24). A buy-back who wins
 * there and loses later, or who goes up on a free pass and loses in round two, is one of everyone else.
 */
function lostBuyback(s: Snapshot, playerId: string): boolean {
  const e = buybackEntryOf(s, playerId);
  if (!e) return false;
  return matchesOf(s, e.id).some((m) => m.round === 1 && m.state === "finished" && m.winner_id !== e.id);
}

/**
 * O-24 (spec 5.9): reached the final, lost (or sat in) the semi-final, bought back and lost again, everyone
 * else. Both finalists get the same change: the final is usually not played, and when it is, it does not
 * count. A night ended early labels by the round reached, like any other.
 */
function byFinish(s: Snapshot, rows: ReviewRow[]): ReviewRow[] {
  const c = s.competition;
  const finalRound = roundsFor(c.bracket_size);
  for (const r of rows) {
    r.group = r.reached_round >= finalRound ? "final" : r.reached_round === finalRound - 1 ? "semi" : lostBuyback(s, r.player_id) ? "buyback_lost" : "other";
    r.delta = {
      final: c.rating_final_delta,
      semi: c.rating_semi_delta,
      buyback_lost: c.rating_buyback_lost_delta,
      other: c.rating_other_delta,
    }[r.group as (typeof FINISH_GROUPS)[number]];
    r.proposed_rating = clampRating(r.current_rating + r.delta);
    r.delta = r.proposed_rating - r.current_rating;
  }
  // Group order, then furthest first, then by name (spec 3.7).
  return rows.sort(
    (a, b) =>
      FINISH_GROUPS.indexOf(a.group as (typeof FINISH_GROUPS)[number]) - FINISH_GROUPS.indexOf(b.group as (typeof FINISH_GROUPS)[number]) ||
      b.reached_round - a.reached_round ||
      a.name.localeCompare(b.name),
  );
}

/** One entry's run, in words: where it lost, or where it stood when the night closed. */
function entryStory(s: Snapshot, e: EntryRow): string {
  const ended = s.competition.status === "complete";
  const finalRound = roundsFor(s.competition.bracket_size);
  const ms = matchesOf(s, e.id);
  const last = ms[ms.length - 1];
  const reach = reachOfEntry(s, e.id, e.joined_round);
  // Moved up by a win or a free pass, and no opponent there yet.
  if (!last || (reach > last.round && last.winner_id === e.id)) {
    if (reach >= finalRound) return "Reached the Final";
    return ended ? `Through to R${reach} when the night ended` : `Waiting in R${reach}`;
  }
  const opp = playerName(s, opponentOf(last, e.id));
  const label = matchLabel(s, last);
  if (last.state === "finished") {
    if (last.winner_id !== e.id) return `Lost ${label} to ${opp}`;
    if (last.round === finalRound) return `Won the Final v ${opp}`;
    return `Won ${label} v ${opp}`;
  }
  if (last.round === finalRound) return `Reached the Final v ${opp}`;
  return ended ? `In ${label} v ${opp} when the night ended` : `In ${label} v ${opp}`;
}

/** The player's night in words for the review (spec 3.7): each entry's run, joined by the buy-back. */
export function nightStory(s: Snapshot, playerId: string): string {
  const entries = s.entries
    .filter((e) => e.player_id === playerId)
    .sort((a, b) => Number(a.source === "buyback") - Number(b.source === "buyback"));
  return entries.map((e) => entryStory(s, e)).join(" → bought back → ");
}
