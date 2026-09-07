// Master override (O-5, spec 3.9, 5.10): the normal functions with their guards off, each logged.

import { badRequest, conflict, notFound } from "./errors";
import { createBuybackEntry } from "./buybacks";
import {
  boxOf,
  boxOfMatch,
  firstEntryOf,
  buybackEntryOf,
  entryAtSlot,
  entryById,
  isWaitingIn,
  matchById,
  matchLabel,
  matchNumberFor,
  matchesOf,
  openSlots,
  pickFreeSlot,
  positionOf,
  playerName,
  removeMatch,
} from "./derive";
import { createMatch, pairInRoundOne, placeInSlot, refreshStart } from "./matches";
import { advanceAll, resetMatchInternal, unwindAdvance } from "./rounds";
import type { Ctx, EntryRow, FreePassRow, MatchRow, Snapshot } from "./types";

function getMatch(s: Snapshot, id: string): MatchRow {
  const m = matchById(s, id);
  if (!m) throw notFound("Match not found");
  return m;
}

/**
 * Grow bracket 16 → 32 (spec 3.9): adds open slots. The old tree becomes the top half of the new one, so
 * round-one numbers are unchanged and every later match is renumbered by its position (spec 5.4).
 */
export function growBracket(s: Snapshot, ctx: Ctx): void {
  if (s.competition.bracket_size !== 16) throw conflict("The bracket is already 32");
  for (const m of s.matches) if (m.round >= 2) m.number = matchNumberFor(32, m.round, boxOfMatch(16, m));
  s.competition.bracket_size = 32;
  ctx.log.push({ action: "grow_bracket", details: { from: 16, to: 32 } });
}

/**
 * Empty round-one slots a new player can still take (spec 5.10): not under a box already decided — by a
 * free pass through it, or by a match created in it.
 */
export function openPlaces(s: Snapshot): number[] {
  const B = s.competition.bracket_size;
  const blocked = (slot: number) => {
    for (const fp of s.freePasses) {
      const holder = entryById(s, fp.entry_id);
      if (holder.slot !== null && boxOf(holder.slot, fp.from_round) === boxOf(slot, fp.from_round)) return true;
    }
    return s.matches.some((m) => m.round >= 2 && boxOfMatch(B, m) === boxOf(slot, m.round));
  };
  const out: number[] = [];
  for (let slot = 1; slot <= B; slot++) if (!entryAtSlot(s, slot) && !blocked(slot)) out.push(slot);
  return out;
}

/** Add a player at any point, ignoring open slots, the closed window and the one-buy-back rule. */
export function overrideAddPlayer(s: Snapshot, ctx: Ctx, playerId: string): EntryRow {
  if (s.competition.status !== "in_progress") throw conflict("The competition is not running");
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw badRequest("Unknown player");
  const existing = s.entries.filter((e) => e.player_id === playerId);
  if (existing.some((e) => positionOf(s, e.id).status !== "out")) throw conflict(`${player.name} is already in the competition`);
  const first = firstEntryOf(s, playerId);
  const buyback = buybackEntryOf(s, playerId);
  if (first && buyback) throw conflict(`${player.name} already has two entries tonight`);
  let places = openSlots(s) > 0 ? openPlaces(s) : [];
  if (places.length === 0) {
    if (s.competition.bracket_size === 32) throw conflict("No open place in the 32 bracket for another player");
    growBracket(s, ctx);
    places = openPlaces(s);
  }
  // The same placement rule as a buy-back (spec 5.2, O-13): an empty match first, then a seat beside a
  // lone waiting player — restricted to the open places; failing both, the lowest open place.
  const preferred = pickFreeSlot(s, ctx.rng);
  const slot = preferred !== undefined && places.includes(preferred) ? preferred : places[0];
  let entry: EntryRow;
  if (first) {
    // Their first-life entry is out: this is their buy-back, the same as choosing "Buys back" (rules 3).
    entry = createBuybackEntry(s, ctx, playerId, first.id, { force: true, slot }).entry;
    first.buyback_decision = "bought_back";
  } else {
    // Not in the draw (or their first-life row was removed): they join as a late arrival (rules 3, 8.3).
    entry = lateEntry(s, ctx, playerId);
    s.entries.push(entry);
    placeInSlot(s, ctx, entry, "override", slot);
  }
  ctx.log.push({ action: "add_player", details: { player: player.name, slot, entry: entry.id, source: entry.source } });
  advanceAll(s, ctx);
  return entry;
}

function lateEntry(s: Snapshot, ctx: Ctx, playerId: string): EntryRow {
  const player = s.players.find((p) => p.id === playerId)!;
  return {
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
}

/**
 * Remove a player from the night: not-started matches deleted, finished matches they won voided (with the
 * winner's later place unwound), free passes revoked. A finished match they lost stays as history and so
 * does that entry row. Refuses, naming the match, if an affected later match has started or one of theirs
 * is in play.
 */
export function overrideRemovePlayer(s: Snapshot, ctx: Ctx, playerId: string): string[] {
  // Buy-back entry first: it references the draw entry, so it must go before the draw entry can.
  const entries = s.entries
    .filter((e) => e.player_id === playerId)
    .sort((a, b) => (a.source === "buyback" ? 0 : 1) - (b.source === "buyback" ? 0 : 1));
  if (entries.length === 0) throw notFound("That player is not in the competition");
  const changes: string[] = [];
  const name = s.players.find((p) => p.id === playerId)?.name ?? "?";
  for (const e of entries) {
    for (const m of matchesOf(s, e.id)) {
      if (!s.matches.includes(m)) continue; // already unwound by an earlier step
      if (m.state === "in_play") throw conflict(`${matchLabel(s, m)} is in play — reset it first`);
      if (m.state === "finished" && m.winner_id !== e.id) continue;
      if (m.state === "finished") {
        const { deleted } = unwindAdvance(s, ctx, e.id, m.round, { force: false });
        for (const d of deleted) changes.push(`${matchLabel(s, d)} deleted`);
        changes.push(`${matchLabel(s, m)} voided`);
      } else {
        changes.push(`${matchLabel(s, m)} deleted`);
      }
      removeMatch(s, m);
    }
    const passes = s.freePasses.filter((fp) => fp.entry_id === e.id);
    if (passes.length) {
      // A free pass into a round they have already played in cannot be revoked quietly.
      for (const fp of passes) {
        const later = matchesOf(s, e.id).find((m) => m.round > fp.from_round && m.state !== "not_started");
        if (later) throw conflict(`${matchLabel(s, later)} has started`);
      }
      s.freePasses = s.freePasses.filter((fp) => fp.entry_id !== e.id);
      changes.push(`free pass revoked`);
    }
    if (matchesOf(s, e.id).length === 0) {
      s.entries.splice(s.entries.indexOf(e), 1);
      for (const other of s.entries) if (other.rebuy_of_entry_id === e.id) other.rebuy_of_entry_id = null;
      changes.push(`${e.source === "buyback" ? "buy-back entry" : "entry"} removed`);
    }
  }
  if (s.competition.winner_entry_id && !s.entries.some((e) => e.id === s.competition.winner_entry_id)) {
    s.competition.winner_entry_id = null;
    s.competition.status = "in_progress";
    s.competition.completed_at = null;
  }
  ctx.log.push({ action: "remove_player", details: { player: name, changes } });
  advanceAll(s, ctx);
  return changes;
}

/**
 * Swap one player of a not-started or in-play match for a waiting player; start recalculated (5.6).
 * From round two the newcomer must be waiting in the same box of the tree, which is the only place the
 * match can be (spec 5.4).
 */
export function overrideReplacePlayer(s: Snapshot, ctx: Ctx, matchId: string, side: "a" | "b", newEntryId: string): MatchRow {
  const m = getMatch(s, matchId);
  if (m.state === "finished") throw conflict(`${matchLabel(s, m)} is finished — reset it first`);
  const newEntry = entryById(s, newEntryId);
  if (!isWaitingIn(s, newEntryId, m.round)) throw conflict(`${playerName(s, newEntryId)} is not waiting in round ${m.round}`);
  const oldId = side === "a" ? m.player_a_id : m.player_b_id;
  const oldEntry = entryById(s, oldId);
  if (m.round === 1) {
    [oldEntry.slot, newEntry.slot] = [newEntry.slot, oldEntry.slot];
  } else if (newEntry.slot === null || boxOf(newEntry.slot, m.round) !== boxOfMatch(s.competition.bracket_size, m)) {
    throw conflict(`${playerName(s, newEntryId)} is in a different part of the bracket from ${matchLabel(s, m)}`);
  }
  if (side === "a") m.player_a_id = newEntryId;
  else m.player_b_id = newEntryId;
  refreshStart(s, m);
  ctx.log.push({
    action: "replace_player",
    details: { match: matchLabel(s, m), out: playerName(s, oldId), in: playerName(s, newEntryId) },
  });
  return m;
}

/** Reset: any state → not_started, unwinding later rounds even if they have started. */
export function overrideResetMatch(s: Snapshot, ctx: Ctx, matchId: string): MatchRow {
  const m = getMatch(s, matchId);
  const before = m.state;
  resetMatchInternal(s, ctx, m, { force: true });
  ctx.log.push({ action: "reset_match", details: { match: matchLabel(s, m), from: before } });
  advanceAll(s, ctx);
  return m;
}

/**
 * Delete: the match goes and both players return to waiting in round one, keeping their slots. Only round
 * one: from round two the tree has exactly one place for those two players, so the automatic step would
 * put the match straight back — Reset or Replace a player are the tools there (spec 5.10).
 */
export function overrideDeleteMatch(s: Snapshot, ctx: Ctx, matchId: string): void {
  const m = getMatch(s, matchId);
  if (m.round !== 1) throw conflict(`${matchLabel(s, m)} is in round ${m.round} — use Reset or Replace a player; only a round-one match can be deleted`);
  resetMatchInternal(s, ctx, m, { force: true });
  removeMatch(s, m);
  ctx.log.push({ action: "delete_match", details: { match: matchLabel(s, m), a: playerName(s, m.player_a_id), b: playerName(s, m.player_b_id) } });
}

/** Pair two chosen waiting players in the same round, no randomness. From round two they must share a box. */
export function overridePair(s: Snapshot, ctx: Ctx, aId: string, bId: string): MatchRow {
  if (aId === bId) throw badRequest("Choose two different players");
  const pa = positionOf(s, aId);
  const pb = positionOf(s, bId);
  if (pa.status !== "waiting") throw conflict(`${playerName(s, aId)} is not waiting`);
  if (pb.status !== "waiting") throw conflict(`${playerName(s, bId)} is not waiting`);
  if (pa.round !== pb.round) throw conflict(`${playerName(s, aId)} and ${playerName(s, bId)} are in different rounds`);
  const r = pa.round;
  let m: MatchRow;
  if (r === 1) {
    m = pairInRoundOne(s, ctx, aId, bId, "override");
  } else {
    const a = entryById(s, aId);
    const b = entryById(s, bId);
    if (a.slot === null || b.slot === null || boxOf(a.slot, r) !== boxOf(b.slot, r)) {
      throw conflict(`${playerName(s, aId)} and ${playerName(s, bId)} are in different parts of the bracket`);
    }
    const k = boxOf(a.slot, r);
    const [lo, hi] = a.slot < b.slot ? [a, b] : [b, a];
    m = createMatch(s, ctx, lo.id, hi.id, r, matchNumberFor(s.competition.bracket_size, r, k), "override");
  }
  ctx.log.push({ action: "pair", details: { match: matchLabel(s, m), a: playerName(s, aId), b: playerName(s, bId), round: r } });
  return m;
}

export function overrideGrantFreePass(s: Snapshot, ctx: Ctx, entryId: string, fromRound: number): FreePassRow {
  if (!isWaitingIn(s, entryId, fromRound)) throw conflict(`${playerName(s, entryId)} is not waiting in round ${fromRound}`);
  const fp: FreePassRow = { id: ctx.newId(), competition_id: s.competition.id, entry_id: entryId, from_round: fromRound, granted_at: ctx.now };
  s.freePasses.push(fp);
  ctx.log.push({ action: "grant_free_pass", details: { player: playerName(s, entryId), from_round: fromRound } });
  advanceAll(s, ctx);
  return fp;
}

export function overrideRevokeFreePass(s: Snapshot, ctx: Ctx, freePassId: string): void {
  const fp = s.freePasses.find((x) => x.id === freePassId);
  if (!fp) throw notFound("Free pass not found");
  const later = matchesOf(s, fp.entry_id).find((m) => m.round > fp.from_round);
  if (later) throw conflict(`${playerName(s, fp.entry_id)} is already in ${matchLabel(s, later)}`);
  s.freePasses.splice(s.freePasses.indexOf(fp), 1);
  ctx.log.push({ action: "revoke_free_pass", details: { player: playerName(s, fp.entry_id), from_round: fp.from_round } });
}

/**
 * Reopen buy-backs: the one place "no more entries for the night" can be undone. Everything the close
 * caused is taken back — every free pass, and the not-started matches its holders reached through them.
 * Refuses, naming the match, if one of those matches has started.
 */
export function overrideReopenBuybacks(s: Snapshot, ctx: Ctx): void {
  if (s.competition.status !== "in_progress") throw conflict("The competition is not running");
  if (s.competition.buybacks_closed_at === null) throw conflict("Buy-backs are already open");
  const passes = s.freePasses.slice().sort((a, b) => a.from_round - b.from_round);
  for (const fp of passes) {
    if (!s.freePasses.includes(fp)) continue; // removed by an earlier unwind
    unwindAdvance(s, ctx, fp.entry_id, fp.from_round, { force: false });
    s.freePasses = s.freePasses.filter((x) => x !== fp);
  }
  s.competition.buybacks_closed_at = null;
  ctx.log.push({ action: "reopen_buybacks", details: { free_passes_revoked: passes.length } });
}
