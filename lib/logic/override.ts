// Master override (O-5, spec 3.9, 5.10): the normal functions with their guards off, each logged.

import { badRequest, conflict, notFound } from "./errors";
import { createBuybackEntry } from "./buybacks";
import {
  currentRound,
  drawEntryOf,
  buybackEntryOf,
  entryById,
  isWaitingIn,
  matchById,
  matchLabel,
  matchesOf,
  openSlots,
  positionOf,
  playerName,
  removeMatch,
} from "./derive";
import { createMatch, nextMatchNumber, pairInRoundOne, placeInSlot, refreshStart } from "./matches";
import { maybeDrawNextRound, resetMatchInternal, unwindAdvance } from "./rounds";
import type { Ctx, EntryRow, FreePassRow, MatchRow, Snapshot } from "./types";

function getMatch(s: Snapshot, id: string): MatchRow {
  const m = matchById(s, id);
  if (!m) throw notFound("Match not found");
  return m;
}

/** Grow bracket 16 → 32 (spec 3.9): only adds open slots. */
export function growBracket(s: Snapshot, ctx: Ctx): void {
  if (s.competition.bracket_size !== 16) throw conflict("The bracket is already 32");
  s.competition.bracket_size = 32;
  ctx.log.push({ action: "grow_bracket", details: { from: 16, to: 32 } });
}

/** Add a player at any point, ignoring open slots, the closed window and the one-buy-back rule. */
export function overrideAddPlayer(s: Snapshot, ctx: Ctx, playerId: string): EntryRow {
  if (s.competition.status !== "in_progress") throw conflict("The competition is not running");
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw badRequest("Unknown player");
  const existing = s.entries.filter((e) => e.player_id === playerId);
  if (existing.some((e) => positionOf(s, e.id).status !== "out")) throw conflict(`${player.name} is already in the competition`);
  const draw = drawEntryOf(s, playerId);
  const buyback = buybackEntryOf(s, playerId);
  if (draw && buyback) throw conflict(`${player.name} already has two entries tonight`);
  const r = currentRound(s);
  let entry: EntryRow;
  if (r === 1) {
    if (openSlots(s) <= 0) {
      if (s.competition.bracket_size === 32) throw conflict("The 32 bracket is full");
      growBracket(s, ctx);
    }
    if (buyback && !draw) {
      // Their buy-back entry is spent; the only row the schema allows is a draw-source one.
      entry = blankEntry(s, ctx, playerId, 1);
      s.entries.push(entry);
      placeInSlot(s, ctx, entry, "override");
    } else {
      entry = createBuybackEntry(s, ctx, playerId, draw?.id ?? null, { force: true }).entry;
      if (draw) draw.buyback_decision = "bought_back";
    }
  } else {
    entry = { ...blankEntry(s, ctx, playerId, r), source: buyback && !draw ? "draw" : "buyback" };
    if (entry.source === "buyback") {
      entry.buyback_seq = Math.max(0, ...s.entries.map((e) => e.buyback_seq ?? 0)) + 1;
      entry.rebuy_of_entry_id = draw?.id ?? null;
    }
    s.entries.push(entry);
  }
  ctx.log.push({ action: "add_player", details: { player: player.name, round: r, entry: entry.id } });
  maybeDrawNextRound(s, ctx);
  return entry;
}

function blankEntry(s: Snapshot, ctx: Ctx, playerId: string, joinedRound: number): EntryRow {
  const player = s.players.find((p) => p.id === playerId)!;
  return {
    id: ctx.newId(),
    competition_id: s.competition.id,
    player_id: playerId,
    source: "draw",
    slot: null,
    buyback_seq: null,
    rebuy_of_entry_id: null,
    buyback_decision: null,
    rating_at_entry: player.rating,
    joined_round: joinedRound,
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
      if (m.state === "in_play") throw conflict(`${matchLabel(m)} is in play — reset it first`);
      if (m.state === "finished" && m.winner_id !== e.id) continue;
      if (m.state === "finished") {
        const { deletedNumbers } = unwindAdvance(s, ctx, e.id, m.round, { force: false });
        for (const n of deletedNumbers) changes.push(`M${n} deleted`);
        changes.push(`${matchLabel(m)} voided`);
      } else {
        changes.push(`${matchLabel(m)} deleted`);
      }
      removeMatch(s, m);
    }
    const passes = s.freePasses.filter((fp) => fp.entry_id === e.id);
    if (passes.length) {
      // A free pass into a round they have already played in cannot be revoked quietly.
      for (const fp of passes) {
        const later = matchesOf(s, e.id).find((m) => m.round > fp.from_round && m.state !== "not_started");
        if (later) throw conflict(`${matchLabel(later)} has started`);
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
  maybeDrawNextRound(s, ctx);
  return changes;
}

/** Swap one player of a not-started or in-play match for a waiting player; start recalculated (5.6). */
export function overrideReplacePlayer(s: Snapshot, ctx: Ctx, matchId: string, side: "a" | "b", newEntryId: string): MatchRow {
  const m = getMatch(s, matchId);
  if (m.state === "finished") throw conflict(`${matchLabel(m)} is finished — reset it first`);
  const newEntry = entryById(s, newEntryId);
  if (!isWaitingIn(s, newEntryId, m.round)) throw conflict(`${playerName(s, newEntryId)} is not waiting in round ${m.round}`);
  const oldId = side === "a" ? m.player_a_id : m.player_b_id;
  const oldEntry = entryById(s, oldId);
  if (m.round === 1) [oldEntry.slot, newEntry.slot] = [newEntry.slot, oldEntry.slot];
  if (side === "a") m.player_a_id = newEntryId;
  else m.player_b_id = newEntryId;
  refreshStart(s, m);
  ctx.log.push({
    action: "replace_player",
    details: { match: matchLabel(m), out: playerName(s, oldId), in: playerName(s, newEntryId) },
  });
  return m;
}

/** Reset: any state → not_started, unwinding later rounds even if they have started. */
export function overrideResetMatch(s: Snapshot, ctx: Ctx, matchId: string): MatchRow {
  const m = getMatch(s, matchId);
  const before = m.state;
  resetMatchInternal(s, ctx, m, { force: true });
  ctx.log.push({ action: "reset_match", details: { match: matchLabel(m), from: before } });
  return m;
}

/** Delete: the match goes, both players return to waiting (round-one slots are kept). */
export function overrideDeleteMatch(s: Snapshot, ctx: Ctx, matchId: string): void {
  const m = getMatch(s, matchId);
  resetMatchInternal(s, ctx, m, { force: true });
  removeMatch(s, m);
  ctx.log.push({ action: "delete_match", details: { match: matchLabel(m), a: playerName(s, m.player_a_id), b: playerName(s, m.player_b_id) } });
}

/** Pair two chosen waiting players in the current round, no randomness, any round. */
export function overridePair(s: Snapshot, ctx: Ctx, aId: string, bId: string): MatchRow {
  if (aId === bId) throw badRequest("Choose two different players");
  const pa = positionOf(s, aId);
  const pb = positionOf(s, bId);
  if (pa.status !== "waiting") throw conflict(`${playerName(s, aId)} is not waiting`);
  if (pb.status !== "waiting") throw conflict(`${playerName(s, bId)} is not waiting`);
  if (pa.round !== pb.round) throw conflict(`${playerName(s, aId)} and ${playerName(s, bId)} are in different rounds`);
  const r = pa.round;
  const m = r === 1 ? pairInRoundOne(s, ctx, aId, bId, "override") : createMatch(s, ctx, aId, bId, r, nextMatchNumber(s), "override");
  ctx.log.push({ action: "pair", details: { match: matchLabel(m), a: playerName(s, aId), b: playerName(s, bId), round: r } });
  return m;
}

export function overrideGrantFreePass(s: Snapshot, ctx: Ctx, entryId: string, fromRound: number): FreePassRow {
  if (!isWaitingIn(s, entryId, fromRound)) throw conflict(`${playerName(s, entryId)} is not waiting in round ${fromRound}`);
  const fp: FreePassRow = { id: ctx.newId(), competition_id: s.competition.id, entry_id: entryId, from_round: fromRound, granted_at: ctx.now };
  s.freePasses.push(fp);
  ctx.log.push({ action: "grant_free_pass", details: { player: playerName(s, entryId), from_round: fromRound } });
  maybeDrawNextRound(s, ctx);
  return fp;
}

export function overrideRevokeFreePass(s: Snapshot, ctx: Ctx, freePassId: string): void {
  const fp = s.freePasses.find((x) => x.id === freePassId);
  if (!fp) throw notFound("Free pass not found");
  const later = matchesOf(s, fp.entry_id).find((m) => m.round > fp.from_round);
  if (later) throw conflict(`${playerName(s, fp.entry_id)} is already in ${matchLabel(later)}`);
  s.freePasses.splice(s.freePasses.indexOf(fp), 1);
  ctx.log.push({ action: "revoke_free_pass", details: { player: playerName(s, fp.entry_id), from_round: fp.from_round } });
}

/** Reopen buy-backs: the one place "no more entries for the night" can be undone. */
export function overrideReopenBuybacks(s: Snapshot, ctx: Ctx): void {
  if (s.competition.status !== "in_progress" || currentRound(s) !== 1) throw conflict("Buy-backs can only be reopened in round one");
  if (s.competition.buybacks_closed_at === null) throw conflict("Buy-backs are already open");
  s.competition.buybacks_closed_at = null;
  ctx.log.push({ action: "reopen_buybacks", details: {} });
}
