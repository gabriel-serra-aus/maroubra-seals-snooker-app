// Creating matches and placing round-one entries into slots (spec 5.1, 5.2, 5.6).

import { conflict } from "./errors";
import { handicapStart } from "./handicap";
import {
  entryAtSlot,
  entryById,
  freeSlotOrder,
  isWaitingIn,
  mateSlot,
  matchNumberForSlot,
  playerRating,
} from "./derive";
import type { Ctx, EntryRow, MatchOrigin, MatchRow, Snapshot } from "./types";

/** Round two onwards continue from bracket_size / 2 + 1 in creation order (spec 5.4). */
export function nextMatchNumber(s: Snapshot): number {
  let n = s.competition.bracket_size / 2;
  for (const m of s.matches) n = Math.max(n, m.number);
  return n + 1;
}

/** Builds a match between two entries, snapshotting both ratings and the start (spec 5.6). */
export function createMatch(
  s: Snapshot,
  ctx: Ctx,
  aId: string,
  bId: string,
  round: number,
  number: number,
  origin: MatchOrigin,
): MatchRow {
  if (aId === bId) throw conflict("A match needs two different players");
  const a = entryById(s, aId);
  const b = entryById(s, bId);
  const ratingA = playerRating(s, a.player_id);
  const ratingB = playerRating(s, b.player_id);
  const start = handicapStart(ratingA, ratingB);
  const m: MatchRow = {
    id: ctx.newId(),
    competition_id: s.competition.id,
    round,
    number,
    player_a_id: aId,
    player_b_id: bId,
    rating_a: ratingA,
    rating_b: ratingB,
    start_points: start.points,
    start_entry_id: start.to === "a" ? aId : start.to === "b" ? bId : null,
    state: "not_started",
    origin,
    time_limit_minutes: null,
    started_at: null,
    finished_at: null,
    winner_id: null,
    corrected_at: null,
    created_at: ctx.now,
  };
  s.matches.push(m);
  return m;
}

/** Recomputes the rating snapshots and start after a player swap (spec 5.10 replace). */
export function refreshStart(s: Snapshot, m: MatchRow): void {
  const a = entryById(s, m.player_a_id);
  const b = entryById(s, m.player_b_id);
  m.rating_a = playerRating(s, a.player_id);
  m.rating_b = playerRating(s, b.player_id);
  const start = handicapStart(m.rating_a, m.rating_b);
  m.start_points = start.points;
  m.start_entry_id = start.to === "a" ? m.player_a_id : start.to === "b" ? m.player_b_id : null;
}

/**
 * Puts a round-one entry into a slot, and creates the match if that fills its pair.
 * `slot` may be forced (Force Pair); otherwise the first slot in the free-slot order is used.
 */
export function placeInSlot(
  s: Snapshot,
  ctx: Ctx,
  entry: EntryRow,
  origin: MatchOrigin,
  slot?: number,
): MatchRow | null {
  const target = slot ?? freeSlotOrder(s)[0];
  if (target === undefined) throw conflict("No free slot in the bracket");
  if (entryAtSlot(s, target)) throw conflict(`Slot ${target} is taken`);
  entry.slot = target;
  const mate = entryAtSlot(s, mateSlot(target));
  if (mate && isWaitingIn(s, mate.id, 1)) {
    // Lower slot is player A so the display order is stable.
    const [a, b] = mate.slot! < target ? [mate, entry] : [entry, mate];
    return createMatch(s, ctx, a.id, b.id, 1, matchNumberForSlot(target), origin);
  }
  return null;
}

/** Pairs two waiting round-one entries into one slot pair, per the three cases in spec 5.5. */
export function pairInRoundOne(s: Snapshot, ctx: Ctx, aId: string, bId: string, origin: MatchOrigin): MatchRow {
  const a = entryById(s, aId);
  const b = entryById(s, bId);
  if (a.slot !== null && b.slot !== null && mateSlot(a.slot) === b.slot) {
    // Already share a pair (a deleted match left both in place): just recreate the match.
    const [lo, hi] = a.slot < b.slot ? [a, b] : [b, a];
    return createMatch(s, ctx, lo.id, hi.id, 1, matchNumberForSlot(lo.slot!), origin);
  }
  if (a.slot !== null && b.slot !== null) {
    // Both placed in different half-full pairs: keep the lower-numbered pair, release the other slot.
    const [keep, move] = a.slot < b.slot ? [a, b] : [b, a];
    move.slot = null;
    const m = placeInSlot(s, ctx, move, origin, mateSlot(keep.slot!));
    if (!m) throw new Error("pairInRoundOne: expected a match");
    return m;
  }
  if (a.slot !== null || b.slot !== null) {
    const [placed, other] = a.slot !== null ? [a, b] : [b, a];
    const m = placeInSlot(s, ctx, other, origin, mateSlot(placed.slot!));
    if (!m) throw new Error("pairInRoundOne: expected a match");
    return m;
  }
  // Neither placed: the lowest-numbered empty pair.
  const B = s.competition.bracket_size;
  for (let k = 1; k <= B / 2; k++) {
    if (!entryAtSlot(s, 2 * k - 1) && !entryAtSlot(s, 2 * k)) {
      a.slot = 2 * k - 1;
      const m = placeInSlot(s, ctx, b, origin, 2 * k);
      if (!m) throw new Error("pairInRoundOne: expected a match");
      return m;
    }
  }
  throw conflict("No empty match to pair into — grow the bracket first");
}
