// Buy-backs and late arrivals (rules 3, 8.3, 9; spec 5.2), Close Buy-Backs (rules 11; spec 5.3).

import { badRequest, conflict } from "./errors";
import {
  buybackEntryOf,
  buybacksOpen,
  currentRound,
  drawEntryOf,
  entryById,
  openSlots,
  playerRating,
  positionOf,
  waitingEntries,
} from "./derive";
import { placeInSlot } from "./matches";
import { shuffle } from "./random";
import type { BuybackMode, Ctx, EntryRow, MatchRow, Snapshot } from "./types";

function nextBuybackSeq(s: Snapshot): number {
  let n = 0;
  for (const e of s.entries) if (e.buyback_seq !== null) n = Math.max(n, e.buyback_seq);
  return n + 1;
}

/**
 * Creates a buy-back entry for a player: a round-one loser re-entering (rebuyOf = their draw entry) or a
 * late arrival (rebuyOf null). Consumes one open slot (O-3). Placed now under Sequential Pairing, at close
 * under Random Draw (spec 5.2). Guards are the normal ones; the override passes `force`.
 */
export function createBuybackEntry(
  s: Snapshot,
  ctx: Ctx,
  playerId: string,
  rebuyOfEntryId: string | null,
  opts: { force?: boolean } = {},
): { entry: EntryRow; match: MatchRow | null } {
  if (!opts.force) {
    if (!buybacksOpen(s)) throw conflict("Buy-backs are closed");
    if (openSlots(s) <= 0) throw conflict("No open slots left");
  }
  if (buybackEntryOf(s, playerId)) throw conflict("That player has already bought back tonight");
  const entry: EntryRow = {
    id: ctx.newId(),
    competition_id: s.competition.id,
    player_id: playerId,
    source: "buyback",
    slot: null,
    buyback_seq: nextBuybackSeq(s),
    rebuy_of_entry_id: rebuyOfEntryId,
    buyback_decision: null,
    rating_at_entry: playerRating(s, playerId),
    joined_round: 1,
    entered_at: ctx.now,
  };
  s.entries.push(entry);
  let match: MatchRow | null = null;
  // Random Draw holds the entry unplaced until close; but once the window is closed (override add after
  // close) there is no close to come, so place at once.
  if (s.competition.buyback_mode === "sequential" || s.competition.buybacks_closed_at !== null) {
    match = placeInSlot(s, ctx, entry, "sequential");
  }
  return { entry, match };
}

/** "Add buy-back / late arrival" on 3.4: a player from the club list joins round one as a buy-back. */
export function addLateArrival(s: Snapshot, ctx: Ctx, playerId: string): { entry: EntryRow; match: MatchRow | null } {
  if (!buybacksOpen(s)) throw conflict("Buy-backs are closed");
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw badRequest("Unknown player");
  if (!player.active) throw conflict("Inactive players cannot be entered");
  const draw = drawEntryOf(s, playerId);
  if (draw && positionOf(s, draw.id).status !== "out") throw conflict("That player is already in tonight's competition");
  const result = createBuybackEntry(s, ctx, playerId, draw?.id ?? null);
  if (draw) draw.buyback_decision = "bought_back";
  return result;
}

/** Switch mode (rules 9): Random → Sequential places the waiting buy-backs now, in re-entry order. */
export function switchBuybackMode(s: Snapshot, ctx: Ctx, mode: BuybackMode): MatchRow[] {
  const c = s.competition;
  if (c.status === "setup") {
    c.buyback_mode = mode;
    return [];
  }
  if (!buybacksOpen(s)) throw conflict("The buy-back mode can only be switched in round one while buy-backs are open");
  const created: MatchRow[] = [];
  if (mode === "sequential" && c.buyback_mode !== "sequential") {
    for (const e of unplacedInSeqOrder(s)) {
      const m = placeInSlot(s, ctx, e, "sequential");
      if (m) created.push(m);
    }
  }
  c.buyback_mode = mode;
  return created;
}

function unplacedInSeqOrder(s: Snapshot): EntryRow[] {
  return waitingEntries(s, 1)
    .filter((e) => e.slot === null)
    .sort((a, b) => (a.buyback_seq ?? 0) - (b.buyback_seq ?? 0));
}

/**
 * The auto-close condition (rules 11, spec 5.3): no first-draw player is in an unfinished round-one match.
 * (Every loser's decision is recorded at Complete, so the second half of the condition always holds.)
 */
export function autoCloseDue(s: Snapshot): boolean {
  if (!buybacksOpen(s)) return false;
  return !s.matches.some(
    (m) =>
      m.round === 1 &&
      m.state !== "finished" &&
      (entryById(s, m.player_a_id).source === "draw" || entryById(s, m.player_b_id).source === "draw"),
  );
}

export interface CloseResult {
  placed: number;
  matchesCreated: MatchRow[];
  freePasses: string[];
}

/**
 * Close Buy-Backs (rules 11, spec 5.3): lock the list, place every unplaced waiting player into the
 * free-slot order (shuffled under Random Draw, in re-entry order under Sequential), then give a free pass
 * to EVERY player still without an opponent — there may be several (O-4).
 */
export function closeBuybacks(s: Snapshot, ctx: Ctx): CloseResult {
  const c = s.competition;
  if (c.status !== "in_progress" || currentRound(s) !== 1) throw conflict("Buy-backs can only be closed in round one");
  if (c.buybacks_closed_at !== null) throw conflict("Buy-backs are already closed");
  c.buybacks_closed_at = ctx.now;
  const unplaced = unplacedInSeqOrder(s);
  const order = c.buyback_mode === "random_draw" ? shuffle(unplaced, ctx.rng) : unplaced;
  const matchesCreated: MatchRow[] = [];
  for (const e of order) {
    const m = placeInSlot(s, ctx, e, "close");
    if (m) matchesCreated.push(m);
  }
  const freePasses: string[] = [];
  for (const e of waitingEntries(s, 1)) {
    s.freePasses.push({
      id: ctx.newId(),
      competition_id: c.id,
      entry_id: e.id,
      from_round: 1,
      granted_at: ctx.now,
    });
    freePasses.push(e.id);
  }
  return { placed: order.length, matchesCreated, freePasses };
}
