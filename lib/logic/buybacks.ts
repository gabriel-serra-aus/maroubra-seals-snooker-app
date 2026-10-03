// Buy-backs and late arrivals (rules 3, 8.3, 9; spec 5.2, O-13), Close Buy-Backs (rules 11; spec 5.3, O-15).
// A buy-back is a round-one loser re-entering; a late arrival is a first-life entry that arrived after the draw.

import { badRequest, conflict } from "./errors";
import {
  boxOf,
  buybackEntryOf,
  buybacksOpen,
  firstEntryOf,
  openSlots,
  pickFreeSlot,
  playerRating,
  positionOf,
} from "./derive";
import { placeInSlot } from "./matches";
import { advanceAll } from "./rounds";
import type { Ctx, EntryRow, FreePassRow, MatchRow, Snapshot } from "./types";

function nextBuybackSeq(s: Snapshot): number {
  let n = 0;
  for (const e of s.entries) if (e.buyback_seq !== null) n = Math.max(n, e.buyback_seq);
  return n + 1;
}

/**
 * The seat a buy-back takes (spec 5.2, O-20): the placement rule, but never a seat that would put them in
 * line to meet their round-one opponent again in round two — by winning or by a free pass. Those seats
 * share the round-two box of the slot they lost from. Only when nothing else is open does a rematch seat
 * come into play, and then only once the organiser has allowed it: until then this throws a 409 with
 * `code: "rematch"` naming the opponent, which the screen turns into a question. Undefined means "let
 * placeInSlot pick", which then can only land on a rematch seat.
 */
function buybackSlot(s: Snapshot, ctx: Ctx, playerId: string, firstLife: EntryRow | undefined, allowRematch: boolean): number | undefined {
  if (firstLife?.slot == null) return undefined;
  const box = boxOf(firstLife.slot, 2);
  const slot = pickFreeSlot(s, ctx.rng, (x) => boxOf(x, 2) === box);
  if (slot !== undefined || allowRematch || pickFreeSlot(s, ctx.rng) === undefined) return slot;
  const lost = s.matches.find((m) => m.round === 1 && m.winner_id !== null && (m.player_a_id === firstLife.id || m.player_b_id === firstLife.id));
  const winner = lost && s.entries.find((e) => e.id === lost.winner_id);
  const name = (id: string | undefined) => s.players.find((p) => p.id === id)?.name ?? "?";
  const player = name(playerId);
  const opponent = name(winner?.player_id);
  throw conflict(`The only open seats put ${player} in line to meet ${opponent} again in round 2`, { code: "rematch", player, opponent });
}

/**
 * Creates a buy-back entry for a player: a round-one loser re-entering (rebuyOf = their first-life entry,
 * draw or late; null only from the override). Consumes one open slot (O-3) and is placed into the bracket at once, per
 * the placement rule of spec 5.2 (a random empty match first, then beside a random lone player), away from
 * their round-one opponent's half unless the organiser allowed it (O-20). Guards are the normal ones; the
 * override passes `force` and its own `slot`, and is not checked for a rematch.
 */
export function createBuybackEntry(
  s: Snapshot,
  ctx: Ctx,
  playerId: string,
  rebuyOfEntryId: string | null,
  opts: { force?: boolean; slot?: number; allowRematch?: boolean } = {},
): { entry: EntryRow; match: MatchRow | null } {
  if (!opts.force) {
    if (!buybacksOpen(s)) throw conflict("Buy-backs are closed");
    if (openSlots(s) <= 0) throw conflict("No open slots left");
  }
  if (buybackEntryOf(s, playerId)) throw conflict("That player has already bought back tonight");
  const firstLife = s.entries.find((e) => e.id === rebuyOfEntryId);
  const slot = opts.force ? opts.slot : buybackSlot(s, ctx, playerId, firstLife, opts.allowRematch ?? false);
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
  const match = placeInSlot(s, ctx, entry, opts.force ? "override" : "placement", slot);
  return { entry, match };
}

/**
 * "Add late arrival" on 3.4 (rules 3, 8.3): a player who was not in the draw joins round one as a `late`
 * entry. They take one open slot (O-3) and are placed like a buy-back (spec 5.2, O-13), but they are not
 * one: a late arrival who loses in round one may still buy back once, like a first-draw player. Allowed
 * at any time until the organiser closes the window, even after every round-one match is played (O-15).
 * A player already in tonight's competition is refused — a round-one loser buys back through Review
 * result on their match, not through this button.
 */
export function addLateArrival(s: Snapshot, ctx: Ctx, playerId: string): { entry: EntryRow; match: MatchRow | null } {
  if (!buybacksOpen(s)) throw conflict("Buy-backs are closed");
  if (openSlots(s) <= 0) throw conflict("No open slots left");
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw badRequest("Unknown player");
  if (!player.active) throw conflict("Inactive players cannot be entered");
  const first = firstEntryOf(s, playerId);
  if (first) {
    if (positionOf(s, first.id).status !== "out") throw conflict(`${player.name} is already in tonight's competition`);
    throw conflict(`${player.name} lost in round one. To buy them back, open Review result on their match`);
  }
  const entry: EntryRow = {
    id: ctx.newId(),
    competition_id: s.competition.id,
    player_id: playerId,
    source: "late",
    slot: null,
    buyback_seq: null,
    rebuy_of_entry_id: null,
    buyback_decision: null,
    rating_at_entry: player.rating,
    joined_round: 1,
    entered_at: ctx.now,
  };
  s.entries.push(entry);
  const match = placeInSlot(s, ctx, entry, "placement");
  return { entry, match };
}

export interface CloseResult {
  /** Round-one free passes granted by this close: every player still without an opponent (O-4). */
  freePasses: string[];
  /** Matches the close cascaded into (free-pass holders meeting a waiting winner). */
  matchesCreated: MatchRow[];
  /** Every free pass the cascade granted, round one and beyond. */
  allPasses: FreePassRow[];
}

/**
 * Close Buy-Backs — the "No More Buy-Backs / Late Entries" button (rules 11, spec 5.3): lock the list,
 * then run the advancement step — every lone round-one player receives a free pass to round two (there
 * may be several, O-4), and the tree moves on from there. This tap is the only thing that closes the
 * window; nothing closes it automatically, however far round one has got (O-15).
 */
export function closeBuybacks(s: Snapshot, ctx: Ctx): CloseResult {
  const c = s.competition;
  if (c.status !== "in_progress") throw conflict("The competition is not running");
  if (c.buybacks_closed_at !== null) throw conflict("Buy-backs are already closed");
  c.buybacks_closed_at = ctx.now;
  const adv = advanceAll(s, ctx);
  return {
    freePasses: adv.freePasses.filter((fp) => fp.from_round === 1).map((fp) => fp.entry_id),
    matchesCreated: adv.matches,
    allPasses: adv.freePasses,
  };
}
