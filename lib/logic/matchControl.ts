// Match state machine (rules 12, spec 4.1): Start, time limit, Cancel start (O-5), Complete, Review result (O-6).

import { badRequest, conflict, notFound } from "./errors";
import { createBuybackEntry } from "./buybacks";
import {
  buybackEntryOf,
  buybacksOpen,
  entryById,
  matchById,
  matchLabel,
  matchesOf,
  opponentOf,
  removeMatch,
} from "./derive";
import { advanceAll, advancementOf, unwindAdvance, type Advancement } from "./rounds";
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
  if (m.state !== "not_started") throw conflict(`${matchLabel(s, m)} has already started`);
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
  ctx.log.push({ action: "cancel_start", details: { match: matchLabel(s, m), round: m.round } });
  return m;
}

/** Whether a round-one loser is offered the buy-back choice (rules 3, spec 3.5): first-draw and late-arrival entries alike, once. */
export function loserEligibleForBuyback(s: Snapshot, m: MatchRow, loser: EntryRow): boolean {
  return m.round === 1 && loser.source !== "buyback" && buybacksOpen(s) && !buybackEntryOf(s, loser.player_id);
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

export interface CompleteResult {
  match: MatchRow;
  loser: DecisionOutcome;
  /** Where the winner went: their next match, awaiting an opponent, a free pass, or the night's winner. */
  winnerTo: Advancement;
  completed: boolean;
}

/** Complete (rules 12, spec 3.5): winner recorded, clock stopped, winner advanced, loser's decision applied. */
export function completeMatch(s: Snapshot, ctx: Ctx, matchId: string, winnerId: string, decision?: LoserDecision): CompleteResult {
  const m = getMatch(s, matchId);
  if (m.state === "not_started") throw conflict("A result cannot be entered on a match that has not started");
  if (m.state === "finished") throw conflict(`${matchLabel(s, m)} is already finished — use Review result`);
  if (winnerId !== m.player_a_id && winnerId !== m.player_b_id) throw badRequest("The winner must be a player of the match");
  const loser = entryById(s, opponentOf(m, winnerId));
  validateDecision(s, m, loser, decision);
  m.state = "finished";
  m.finished_at = ctx.now;
  m.winner_id = winnerId;
  const loserOutcome = applyLoserDecision(s, ctx, m, loser, decision);
  // The buy-back window is untouched by a result: only the organiser's tap closes it (O-15).
  advanceAll(s, ctx);
  return { match: m, loser: loserOutcome, winnerTo: advancementOf(s, winnerId, m.round), completed: s.competition.status === "complete" };
}

/** Why Review result is unavailable, or null when it is allowed (spec 5.7, O-6). */
export function correctionBlockedReason(s: Snapshot, m: MatchRow): string | null {
  if (m.state !== "finished" || !m.winner_id) return "Only a finished match can be corrected";
  const started = matchesOf(s, m.winner_id).find((x) => x.round > m.round && x.state !== "not_started");
  if (started) return `Result locked: ${matchLabel(s, started)} has started`;
  const loser = entryById(s, opponentOf(m, m.winner_id));
  const buyback = m.round === 1 ? s.entries.find((e) => e.rebuy_of_entry_id === loser.id) : undefined;
  if (buyback) {
    const bbStarted = matchesOf(s, buyback.id).find((x) => x.state !== "not_started");
    if (bbStarted) return `Loser's buy-back match ${matchLabel(s, bbStarted)} already started`;
  }
  return null;
}

/** Removes a loser's buy-back entry when their loss is being corrected away (spec 5.7 step 3). */
function releaseBuyback(s: Snapshot, ctx: Ctx, loser: EntryRow): void {
  const bb = s.entries.find((e) => e.rebuy_of_entry_id === loser.id);
  if (!bb) return;
  for (const x of matchesOf(s, bb.id)) {
    if (x.state !== "not_started") throw conflict(`Loser's buy-back match ${matchLabel(s, x)} already started`);
    removeMatch(s, x);
  }
  s.freePasses = s.freePasses.filter((fp) => fp.entry_id !== bb.id);
  s.entries.splice(s.entries.indexOf(bb), 1);
  loser.buyback_decision = null;
}

/**
 * Correct result (rules 12, spec 5.7): pull the previous winner back out of the tree, record the new
 * winner, undo the previous loser's buy-back if it has not started (O-6), take the new loser's decision,
 * then let the advancement step move the new winner into the same place.
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
    unwindAdvance(s, ctx, prevWinner, m.round, { force: false });
    if (m.round === 1) releaseBuyback(s, ctx, prevLoser);
    prevLoser.buyback_decision = null;
    m.winner_id = winnerId;
    const newLoser = entryById(s, prevWinner);
    loserOutcome = applyLoserDecision(s, ctx, m, newLoser, decision);
  }
  m.corrected_at = ctx.now;
  advanceAll(s, ctx);
  return { match: m, loser: loserOutcome, winnerTo: advancementOf(s, winnerId, m.round), completed: s.competition.status === "complete" };
}
