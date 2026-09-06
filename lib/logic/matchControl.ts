// Match state machine (rules 12, spec 4.1): Start, time limit, Cancel start (O-5), Complete, Correct (O-6).

import { badRequest, conflict, notFound } from "./errors";
import { autoCloseDue, closeBuybacks, createBuybackEntry, type CloseResult } from "./buybacks";
import {
  buybackEntryOf,
  buybacksOpen,
  currentRound,
  entryById,
  matchById,
  matchLabel,
  matchesOf,
  opponentOf,
  removeMatch,
} from "./derive";
import { advanceWinner, maybeDrawNextRound, unwindAdvance, type RoundDrawResult } from "./rounds";
import type { BuybackDecision, Ctx, EntryRow, MatchRow, Snapshot } from "./types";

export type LoserDecision = Extract<BuybackDecision, "bought_back" | "declined">;

function getMatch(s: Snapshot, matchId: string): MatchRow {
  const m = matchById(s, matchId);
  if (!m) throw notFound("Match not found");
  return m;
}

/** Start (rules 12): green, clock running from the frozen limit. */
export function startMatch(s: Snapshot, ctx: Ctx, matchId: string, timeLimitMinutes?: number): MatchRow {
  const m = getMatch(s, matchId);
  if (m.state !== "not_started") throw conflict(`${matchLabel(m)} has already started`);
  m.time_limit_minutes = timeLimitMinutes ?? m.time_limit_minutes ?? s.competition.default_time_limit_minutes;
  m.started_at = ctx.now;
  m.state = "in_play";
  return m;
}

/** Per-match limit override, only before start (rules 12). null reverts to the competition default. */
export function setMatchTimeLimit(s: Snapshot, matchId: string, minutes: number | null): MatchRow {
  const m = getMatch(s, matchId);
  if (m.state !== "not_started") throw conflict("The time limit can only be changed before a match starts");
  m.time_limit_minutes = minutes;
  return m;
}

/** Cancel start (O-5, spec 5.8): back to not started, clock thrown away, pairing untouched. */
export function cancelStart(s: Snapshot, ctx: Ctx, matchId: string): MatchRow {
  const m = getMatch(s, matchId);
  if (m.state !== "in_play") throw conflict("Only a match in play can have its start cancelled");
  m.started_at = null;
  m.time_limit_minutes = null;
  m.state = "not_started";
  ctx.log.push({ action: "cancel_start", details: { match: matchLabel(m), round: m.round } });
  return m;
}

/** Whether a round-one loser is offered the buy-back choice (rules 3, spec 3.5). */
export function loserEligibleForBuyback(s: Snapshot, m: MatchRow, loser: EntryRow): boolean {
  return m.round === 1 && loser.source === "draw" && buybacksOpen(s) && !buybackEntryOf(s, loser.player_id);
}

export interface DecisionOutcome {
  decision: BuybackDecision | null;
  buybackEntryId: string | null;
  buybackMatch: MatchRow | null;
}

/** Input check only, so a bad request leaves the snapshot untouched. */
function validateDecision(s: Snapshot, m: MatchRow, loser: EntryRow, decision: LoserDecision | undefined): void {
  if (loserEligibleForBuyback(s, m, loser)) {
    if (decision === undefined) throw badRequest("loser_decision is required: bought_back or declined");
  } else if (decision !== undefined) {
    throw badRequest("No buy-back decision applies to this loser");
  }
}

/** Records the loser's decision; `no_slots` when they wanted to buy back but the bracket was full (O-3). */
function applyLoserDecision(s: Snapshot, ctx: Ctx, m: MatchRow, loser: EntryRow, decision: LoserDecision | undefined): DecisionOutcome {
  if (!loserEligibleForBuyback(s, m, loser)) {
    if (decision !== undefined) throw badRequest("No buy-back decision applies to this loser");
    return { decision: null, buybackEntryId: null, buybackMatch: null };
  }
  if (decision === undefined) throw badRequest("loser_decision is required: bought_back or declined");
  if (decision === "declined") {
    loser.buyback_decision = "declined";
    return { decision: "declined", buybackEntryId: null, buybackMatch: null };
  }
  if (s.competition.bracket_size - s.entries.length <= 0) {
    loser.buyback_decision = "no_slots";
    return { decision: "no_slots", buybackEntryId: null, buybackMatch: null };
  }
  const { entry, match } = createBuybackEntry(s, ctx, loser.player_id, loser.id);
  loser.buyback_decision = "bought_back";
  return { decision: "bought_back", buybackEntryId: entry.id, buybackMatch: match };
}

/** Automatic transitions that follow a result (spec 7.4): auto-close (5.3) then the round draw (5.4). */
export function runAutomatics(s: Snapshot, ctx: Ctx, opts: { checkAutoClose: boolean }): { autoClose: CloseResult | null; draw: RoundDrawResult | null } {
  let autoClose: CloseResult | null = null;
  if (opts.checkAutoClose && autoCloseDue(s)) autoClose = closeBuybacks(s, ctx);
  const draw = maybeDrawNextRound(s, ctx);
  return { autoClose, draw };
}

export interface CompleteResult {
  match: MatchRow;
  loser: DecisionOutcome;
  autoClose: CloseResult | null;
  draw: RoundDrawResult | null;
}

/** Complete (rules 12, spec 3.5): winner recorded, clock stopped, winner advanced, loser's decision applied. */
export function completeMatch(s: Snapshot, ctx: Ctx, matchId: string, winnerId: string, decision?: LoserDecision): CompleteResult {
  const m = getMatch(s, matchId);
  if (m.state === "not_started") throw conflict("A result cannot be entered on a match that has not started");
  if (m.state === "finished") throw conflict(`${matchLabel(m)} is already finished — use Correct result`);
  if (winnerId !== m.player_a_id && winnerId !== m.player_b_id) throw badRequest("The winner must be a player of the match");
  const loser = entryById(s, opponentOf(m, winnerId));
  validateDecision(s, m, loser, decision);
  m.state = "finished";
  m.finished_at = ctx.now;
  m.winner_id = winnerId;
  const loserOutcome = applyLoserDecision(s, ctx, m, loser, decision);
  advanceWinner(s, ctx, winnerId, m.round);
  const auto = runAutomatics(s, ctx, { checkAutoClose: true });
  return { match: m, loser: loserOutcome, ...auto };
}

/** Why Correct result is unavailable, or null when it is allowed (spec 5.7, O-6). */
export function correctionBlockedReason(s: Snapshot, m: MatchRow): string | null {
  if (m.state !== "finished" || !m.winner_id) return "Only a finished match can be corrected";
  const started = matchesOf(s, m.winner_id).find((x) => x.round > m.round && x.state !== "not_started");
  if (started) return `Result locked: ${matchLabel(started)} has started`;
  const loser = entryById(s, opponentOf(m, m.winner_id));
  const buyback = m.round === 1 ? s.entries.find((e) => e.rebuy_of_entry_id === loser.id) : undefined;
  if (buyback) {
    const bbStarted = matchesOf(s, buyback.id).find((x) => x.state !== "not_started");
    if (bbStarted) return `Loser's buy-back match ${matchLabel(bbStarted)} already started`;
  }
  return null;
}

/** Removes a loser's buy-back entry when their loss is being corrected away (spec 5.7 step 3). */
function releaseBuyback(s: Snapshot, ctx: Ctx, loser: EntryRow): void {
  const bb = s.entries.find((e) => e.rebuy_of_entry_id === loser.id);
  if (!bb) return;
  for (const x of matchesOf(s, bb.id)) {
    if (x.state !== "not_started") throw conflict(`Loser's buy-back match ${matchLabel(x)} already started`);
    removeMatch(s, x);
  }
  s.freePasses = s.freePasses.filter((fp) => fp.entry_id !== bb.id);
  s.entries.splice(s.entries.indexOf(bb), 1);
  loser.buyback_decision = null;
}

/**
 * Correct result (rules 12, spec 5.7): pull the previous winner back, advance the new one into the same
 * place, undo the previous loser's buy-back if it has not started (O-6), take the new loser's decision.
 */
export function correctMatch(s: Snapshot, ctx: Ctx, matchId: string, winnerId: string, decision?: LoserDecision): CompleteResult {
  const m = getMatch(s, matchId);
  if (m.state !== "finished" || !m.winner_id) throw conflict("Only a finished match can be corrected");
  if (winnerId !== m.player_a_id && winnerId !== m.player_b_id) throw badRequest("The winner must be a player of the match");
  const blocked = correctionBlockedReason(s, m);
  if (blocked) throw conflict(blocked);
  const prevWinner = m.winner_id;
  const prevLoser = entryById(s, opponentOf(m, prevWinner));
  if (winnerId !== prevWinner) validateDecision(s, m, entryById(s, prevWinner), decision);
  const nextRoundDrawn = currentRound(s) > m.round;
  let loserOutcome: DecisionOutcome = { decision: prevLoser.buyback_decision, buybackEntryId: null, buybackMatch: null };

  if (winnerId === prevWinner) {
    // Same winner: only the loser's decision can change.
    const wants = decision;
    const had = prevLoser.buyback_decision;
    if (wants === "declined" && had === "bought_back") {
      releaseBuyback(s, ctx, prevLoser);
      prevLoser.buyback_decision = "declined";
      loserOutcome = { decision: "declined", buybackEntryId: null, buybackMatch: null };
    } else if (wants === "bought_back" && had !== "bought_back") {
      prevLoser.buyback_decision = null;
      loserOutcome = applyLoserDecision(s, ctx, m, prevLoser, "bought_back");
    }
  } else {
    const { deletedNumbers, freePassRounds } = unwindAdvance(s, ctx, prevWinner, m.round, { force: false });
    if (m.round === 1) releaseBuyback(s, ctx, prevLoser);
    prevLoser.buyback_decision = null;
    m.winner_id = winnerId;
    const newLoser = entryById(s, prevWinner);
    loserOutcome = applyLoserDecision(s, ctx, m, newLoser, decision);
    advanceWinner(s, ctx, winnerId, m.round, {
      reuseNumber: deletedNumbers[0],
      nextRoundDrawn,
      inheritFreePass: freePassRounds.includes(m.round + 1),
    });
  }
  m.corrected_at = ctx.now;
  const auto = runAutomatics(s, ctx, { checkAutoClose: true });
  return { match: m, loser: loserOutcome, ...auto };
}
