// Advancing winners up the fixed bracket (rules 4, 11; spec 5.4, O-14) and pulling a winner back out of
// later rounds (spec 5.7 step 1, 5.10 reset).

import { conflict } from "./errors";
import {
  entryAtSlot,
  matchAtBox,
  matchLabel,
  matchNumberFor,
  matchesOf,
  mateSlot,
  boxOf,
  positionOf,
  removeMatch,
  roundsFor,
  siblingHalf,
} from "./derive";
import { createMatch } from "./matches";
import type { Ctx, EntryRow, FreePassRow, MatchRow, Snapshot } from "./types";

export interface AdvanceResult {
  matches: MatchRow[];
  freePasses: FreePassRow[];
  completed: boolean;
}

function grantPass(s: Snapshot, ctx: Ctx, e: EntryRow, fromRound: number): FreePassRow {
  const fp: FreePassRow = { id: ctx.newId(), competition_id: s.competition.id, entry_id: e.id, from_round: fromRound, granted_at: ctx.now };
  s.freePasses.push(fp);
  return fp;
}

/**
 * The one automatic step of the night (spec 5.4). Every waiting player is pushed as far up the tree as
 * their position allows, until nothing moves:
 *
 *  - Round r >= 2, box k = boxOf(slot, r). If someone is waiting in round r in the other half of the box,
 *    the match (r, k) is created. Else, once buy-backs are closed, if nobody in that half can still reach
 *    round r (the half is empty, or everyone there is out), the player receives a free pass from round r
 *    and moves on. While buy-backs are open an empty half may still fill, so the player waits.
 *  - Round 1, after close: a lone player whose seat-mate is missing or out goes through (O-4). Two
 *    waiting seat-mates (a deleted match) are left for the organiser to re-pair.
 *  - Beyond the final round: the competition is complete and this player is the winner.
 */
export function advanceAll(s: Snapshot, ctx: Ctx): AdvanceResult {
  const out: AdvanceResult = { matches: [], freePasses: [], completed: false };
  const c = s.competition;
  if (c.status !== "in_progress") return out;
  const B = c.bracket_size;
  const R = roundsFor(B);
  const closed = c.buybacks_closed_at !== null;
  const inHalf = (slot: number | null, half: [number, number]) => slot !== null && slot >= half[0] && slot <= half[1];

  let changed = true;
  while (changed) {
    changed = false;
    for (const e of s.entries) {
      const p = positionOf(s, e.id);
      if (p.status !== "waiting" || e.slot === null) continue;
      const r = p.round;
      if (r > R) {
        completeCompetition(s, ctx, e.id);
        out.completed = true;
        return out;
      }
      if (r === 1) {
        if (!closed) continue;
        const mate = entryAtSlot(s, mateSlot(e.slot));
        if (mate && positionOf(s, mate.id).status === "waiting") continue;
        out.freePasses.push(grantPass(s, ctx, e, 1));
        changed = true;
        continue;
      }
      const k = boxOf(e.slot, r);
      if (matchAtBox(s, r, k)) continue;
      const half = siblingHalf(e.slot, r);
      const opponent = s.entries.find((x) => x.id !== e.id && inHalf(x.slot, half) && positionOf(s, x.id).status === "waiting" && positionOf(s, x.id).round === r);
      if (opponent) {
        const [a, b] = e.slot < opponent.slot! ? [e, opponent] : [opponent, e];
        out.matches.push(createMatch(s, ctx, a.id, b.id, r, matchNumberFor(B, r, k), "advance"));
        changed = true;
        continue;
      }
      if (!closed) continue;
      const alive = s.entries.some((x) => {
        if (x.id === e.id || !inHalf(x.slot, half)) return false;
        const q = positionOf(s, x.id);
        return (q.status === "waiting" || q.status === "in_match") && q.round <= r;
      });
      if (alive) continue;
      out.freePasses.push(grantPass(s, ctx, e, r));
      changed = true;
    }
  }
  return out;
}

/**
 * Removes an entry from every round after `fromRound`: deletes its not-started later matches (the opponent
 * returns to waiting) and its later free passes. A later match that has started blocks with 409 unless
 * `force` (master override), which resets that match first and unwinds beyond it.
 */
export function unwindAdvance(
  s: Snapshot,
  ctx: Ctx,
  entryId: string,
  fromRound: number,
  opts: { force: boolean },
): { deleted: MatchRow[]; unwound: string[] } {
  const deleted: MatchRow[] = [];
  const unwound: string[] = [];
  const later = matchesOf(s, entryId)
    .filter((m) => m.round > fromRound)
    .sort((a, b) => b.round - a.round);
  for (const m of later) {
    if (m.state !== "not_started") {
      if (!opts.force) throw conflict(`Result locked: ${matchLabel(s, m)} has started`);
      resetMatchInternal(s, ctx, m, opts);
      unwound.push(matchLabel(s, m));
    }
    removeMatch(s, m);
    deleted.push(m);
  }
  s.freePasses = s.freePasses.filter((fp) => !(fp.entry_id === entryId && fp.from_round > fromRound));
  if (s.competition.status === "complete" && s.competition.winner_entry_id === entryId) {
    s.competition.status = "in_progress";
    s.competition.winner_entry_id = null;
    s.competition.completed_at = null;
  }
  return { deleted, unwound };
}

/** Any state → not_started, pulling the winner back out of later rounds (spec 5.10 reset). */
export function resetMatchInternal(s: Snapshot, ctx: Ctx, m: MatchRow, opts: { force: boolean }): void {
  if (m.state === "finished" && m.winner_id) unwindAdvance(s, ctx, m.winner_id, m.round, opts);
  m.state = "not_started";
  m.winner_id = null;
  m.finished_at = null;
  m.started_at = null;
  m.time_limit_minutes = null;
}

export function completeCompetition(s: Snapshot, ctx: Ctx, winnerId: string): void {
  s.competition.status = "complete";
  s.competition.completed_at = ctx.now;
  s.competition.winner_entry_id = winnerId;
}

/** Where an entry stands after the automatics ran: the text for confirmations (spec 3.5). */
export type Advancement =
  | { kind: "match"; round: number; number: number }
  | { kind: "awaiting"; round: number }
  | { kind: "free_pass"; round: number }
  | { kind: "winner" }
  | { kind: "out" };

export function advancementOf(s: Snapshot, entryId: string, fromRound: number): Advancement {
  const p = positionOf(s, entryId);
  if (p.status === "winner") return { kind: "winner" };
  if (p.status === "out") return { kind: "out" };
  if (p.status === "in_match") {
    const m = s.matches.find((x) => x.id === p.matchId)!;
    return { kind: "match", round: m.round, number: m.number };
  }
  if (p.round > fromRound + 1) return { kind: "free_pass", round: p.round };
  return { kind: "awaiting", round: p.round };
}
