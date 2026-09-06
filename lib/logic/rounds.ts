// Advancing winners and drawing rounds two onwards (rules 4, 11; spec 5.4), and pulling a winner back
// out of the next round (spec 5.7 step 1, 5.10 reset).

import { conflict } from "./errors";
import { currentRound, matchLabel, matchesOf, removeMatch, waitingEntries } from "./derive";
import { createMatch, nextMatchNumber } from "./matches";
import { shuffle } from "./random";
import type { Ctx, MatchRow, Snapshot } from "./types";

/**
 * After a match in `fromRound` is won: if the next round has already been drawn (only after a correction or
 * reset re-opened this match), the winner takes the vacated place beside whoever is waiting there.
 * Otherwise nothing to do — they join the pool when the round draw runs.
 */
export function advanceWinner(
  s: Snapshot,
  ctx: Ctx,
  winnerId: string,
  fromRound: number,
  opts: { reuseNumber?: number; nextRoundDrawn?: boolean; inheritFreePass?: boolean } = {},
): MatchRow | null {
  const next = fromRound + 1;
  // A deleted match can leave the next round empty; the caller then tells us it had been drawn.
  if (!(opts.nextRoundDrawn ?? currentRound(s) >= next)) return null;
  if (opts.inheritFreePass) {
    // The previous winner held the next round's free pass (spec 5.7 step 2): the new winner takes it.
    s.freePasses.push({ id: ctx.newId(), competition_id: s.competition.id, entry_id: winnerId, from_round: next, granted_at: ctx.now });
    return null;
  }
  const waiting = waitingEntries(s, next).filter((e) => e.id !== winnerId);
  if (waiting.length === 0) return null;
  return createMatch(s, ctx, waiting[0].id, winnerId, next, opts.reuseNumber ?? nextMatchNumber(s), "correction");
}

/**
 * Removes an entry from every round after `fromRound`: deletes its not-started later matches (the opponent
 * returns to waiting) and its later free passes. A later match that has started blocks with 409 unless
 * `force` (master override), which resets that match first and unwinds beyond it.
 * Returns the match numbers deleted so a correction can reuse the vacated place.
 */
export function unwindAdvance(
  s: Snapshot,
  ctx: Ctx,
  entryId: string,
  fromRound: number,
  opts: { force: boolean },
): { deletedNumbers: number[]; unwound: string[]; freePassRounds: number[] } {
  const deletedNumbers: number[] = [];
  const unwound: string[] = [];
  const freePassRounds = s.freePasses.filter((fp) => fp.entry_id === entryId && fp.from_round > fromRound).map((fp) => fp.from_round);
  const later = matchesOf(s, entryId)
    .filter((m) => m.round > fromRound)
    .sort((a, b) => b.round - a.round);
  for (const m of later) {
    if (m.state !== "not_started") {
      if (!opts.force) throw conflict(`Result locked: ${matchLabel(m)} has started`);
      resetMatchInternal(s, ctx, m, opts);
      unwound.push(matchLabel(m));
    }
    removeMatch(s, m);
    deletedNumbers.push(m.number);
  }
  s.freePasses = s.freePasses.filter((fp) => !(fp.entry_id === entryId && fp.from_round > fromRound));
  if (s.competition.status === "complete" && s.competition.winner_entry_id === entryId) {
    s.competition.status = "in_progress";
    s.competition.winner_entry_id = null;
    s.competition.completed_at = null;
  }
  return { deletedNumbers, unwound, freePassRounds };
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

export interface RoundDrawResult {
  round: number;
  matches: MatchRow[];
  freePass: string | null;
  completed: boolean;
}

/**
 * Round draw (spec 5.4). Runs after every write. When every match of the current round is finished, nobody
 * is left waiting in it (and, in round one, buy-backs are closed), the pool of winners plus free-pass
 * holders is shuffled and paired. An odd pool leaves one random free pass; a pool of one is the winner of
 * the night. In round one, anyone left without an opponent after the close (a correction or an override
 * can do that) goes through, per rules 11 / O-4. From round two a player an override left waiting blocks
 * the draw until they are paired or given a free pass on the override screen.
 */
export function maybeDrawNextRound(s: Snapshot, ctx: Ctx): RoundDrawResult | null {
  const c = s.competition;
  if (c.status !== "in_progress") return null;
  const r = currentRound(s);
  const roundMatches = s.matches.filter((m) => m.round === r);
  if (roundMatches.some((m) => m.state !== "finished")) return null;
  if (r === 1 && c.buybacks_closed_at === null) return null;
  const waiting = waitingEntries(s, r);
  if (r === 1) {
    for (const e of waiting) {
      s.freePasses.push({ id: ctx.newId(), competition_id: c.id, entry_id: e.id, from_round: 1, granted_at: ctx.now });
    }
  } else if (waiting.length > 0) {
    return null;
  }
  const pool = new Set<string>();
  for (const m of roundMatches) if (m.winner_id) pool.add(m.winner_id);
  for (const fp of s.freePasses) if (fp.from_round === r) pool.add(fp.entry_id);
  if (pool.size === 0) return null;
  if (pool.size === 1) {
    const [winner] = pool;
    completeCompetition(s, ctx, winner);
    return { round: r, matches: [], freePass: null, completed: true };
  }
  const order = shuffle([...pool], ctx.rng);
  const next = r + 1;
  const matches: MatchRow[] = [];
  let number = nextMatchNumber(s);
  for (let i = 0; i + 1 < order.length; i += 2) {
    matches.push(createMatch(s, ctx, order[i], order[i + 1], next, number++, "round_draw"));
  }
  let freePass: string | null = null;
  if (order.length % 2 === 1) {
    freePass = order[order.length - 1];
    s.freePasses.push({ id: ctx.newId(), competition_id: c.id, entry_id: freePass, from_round: next, granted_at: ctx.now });
  }
  return { round: next, matches, freePass, completed: false };
}
