// Derived, never stored (spec 6.3 "Derived per-entry status"): where each entry is in the night, who is
// waiting, the current round, open slots, and the geometry of the fixed bracket (spec 5.4, O-14).

import { shuffle, type Rng } from "./random";
import type { EntryRow, MatchRow, Snapshot } from "./types";

export type Position =
  | { status: "waiting"; round: number }
  | { status: "in_match"; round: number; matchId: string }
  | { status: "out"; round: number }
  | { status: "winner"; round: number };

// ---- Bracket geometry (spec 5.4). Everything follows from the round-one slot. ----

/** Rounds in a bracket: 16 -> 4, 32 -> 5. The final is round roundsFor(B), box 1. */
export const roundsFor = (bracketSize: number) => Math.round(Math.log2(bracketSize));
/** The box (match position) a slot belongs to in round r: 1..B/2^r. */
export const boxOf = (slot: number, round: number) => Math.ceil(slot / 2 ** round);
/** Slots covered by box k of round r, inclusive. */
export const slotRangeOf = (round: number, k: number): [number, number] => [(k - 1) * 2 ** round + 1, k * 2 ** round];
/** Match number for box k of round r: round one is M1..M(B/2), each later round continues on. */
export const matchNumberFor = (bracketSize: number, round: number, k: number) => bracketSize - bracketSize / 2 ** (round - 1) + k;
/** Inverse of matchNumberFor for an existing match. */
export const boxOfMatch = (bracketSize: number, m: MatchRow) => m.number - (bracketSize - bracketSize / 2 ** (m.round - 1));
export const mateSlot = (slot: number) => (slot % 2 === 1 ? slot + 1 : slot - 1);
export const matchNumberForSlot = (slot: number) => boxOf(slot, 1);

/** The other half of the box `slot` sits in for `round`: the slots its opponent must come from. */
export function siblingHalf(slot: number, round: number): [number, number] {
  const [lo, hi] = slotRangeOf(round, boxOf(slot, round));
  const mid = lo + 2 ** (round - 1) - 1;
  return slot <= mid ? [mid + 1, hi] : [lo, mid];
}

// ---- Lookups ----

export function entryById(s: Snapshot, id: string): EntryRow {
  const e = s.entries.find((x) => x.id === id);
  if (!e) throw new Error(`entry ${id} not in snapshot`);
  return e;
}

export function matchById(s: Snapshot, id: string): MatchRow | undefined {
  return s.matches.find((m) => m.id === id);
}

export function playerName(s: Snapshot, entryId: string): string {
  const e = entryById(s, entryId);
  return s.players.find((p) => p.id === e.player_id)?.name ?? "?";
}

export function playerRating(s: Snapshot, playerId: string): number {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`player ${playerId} not in snapshot`);
  return p.rating;
}

export function matchesOf(s: Snapshot, entryId: string): MatchRow[] {
  return s.matches
    .filter((m) => m.player_a_id === entryId || m.player_b_id === entryId)
    .sort((a, b) => a.round - b.round || a.number - b.number);
}

export function opponentOf(m: MatchRow, entryId: string): string {
  return m.player_a_id === entryId ? m.player_b_id : m.player_a_id;
}

export function matchAtBox(s: Snapshot, round: number, k: number): MatchRow | undefined {
  const B = s.competition.bracket_size;
  return s.matches.find((m) => m.round === round && boxOfMatch(B, m) === k);
}

/** Where an entry is right now, worked out from its matches and free passes. */
export function positionOf(s: Snapshot, entryId: string): Position {
  const entry = entryById(s, entryId);
  let reach = entry.joined_round;
  for (const m of matchesOf(s, entryId)) {
    if (m.state === "finished") {
      if (m.winner_id === entryId) reach = Math.max(reach, m.round + 1);
      else return { status: "out", round: m.round };
    } else {
      return { status: "in_match", round: m.round, matchId: m.id };
    }
  }
  for (const fp of s.freePasses) {
    if (fp.entry_id === entryId) reach = Math.max(reach, fp.from_round + 1);
  }
  if (s.competition.status === "complete" && s.competition.winner_entry_id === entryId) {
    return { status: "winner", round: reach };
  }
  return { status: "waiting", round: reach };
}

/** Entries in `round` with no opponent yet (Part B definition of "waiting player"). */
export function waitingEntries(s: Snapshot, round: number): EntryRow[] {
  return s.entries.filter((e) => {
    const p = positionOf(s, e.id);
    return p.status === "waiting" && p.round === round;
  });
}

export function isWaitingIn(s: Snapshot, entryId: string, round: number): boolean {
  const p = positionOf(s, entryId);
  return p.status === "waiting" && p.round === round;
}

/**
 * The round the night is at: the lowest round with an unfinished match or a waiting player. Rounds overlap
 * under fixed advancement (M9 can be in play while M7 has not started), so this is the header's number,
 * not a gate. The final round once everything is done.
 */
export function currentRound(s: Snapshot): number {
  const R = roundsFor(s.competition.bracket_size);
  if (s.competition.status === "complete") return R;
  for (let r = 1; r <= R; r++) {
    if (s.matches.some((m) => m.round === r && m.state !== "finished")) return r;
    if (waitingEntries(s, r).length > 0) return r;
  }
  let r = 1;
  for (const m of s.matches) r = Math.max(r, m.round);
  for (const fp of s.freePasses) r = Math.max(r, fp.from_round);
  return Math.min(r, R);
}

/** Highest round anything exists in (a match, a free pass, a waiting player): the rounds to display. */
export function lastRound(s: Snapshot): number {
  const R = roundsFor(s.competition.bracket_size);
  if (s.competition.status === "complete") return R;
  let r = 1;
  for (const m of s.matches) r = Math.max(r, m.round);
  for (const fp of s.freePasses) r = Math.max(r, fp.from_round + 1);
  for (const e of s.entries) {
    const p = positionOf(s, e.id);
    if (p.status === "waiting") r = Math.max(r, p.round);
  }
  return Math.min(r, R);
}

/** bracket_size - entries: the whole of the O-3 cap. */
export function openSlots(s: Snapshot): number {
  return s.competition.bracket_size - s.entries.length;
}

export function entryAtSlot(s: Snapshot, slot: number): EntryRow | undefined {
  return s.entries.find((e) => e.slot === slot);
}

/**
 * Where the next buy-back or late arrival goes (spec 5.2, O-13): a random empty match while one exists,
 * otherwise a random free seat beside a lone round-one player, first-draw or buy-back alike.
 */
export function pickFreeSlot(s: Snapshot, rng: Rng): number | undefined {
  const B = s.competition.bracket_size;
  const emptyPairs: number[] = [];
  const loneSeats: number[] = [];
  for (let k = 1; k <= B / 2; k++) {
    const a = entryAtSlot(s, 2 * k - 1);
    const b = entryAtSlot(s, 2 * k);
    if (!a && !b) emptyPairs.push(2 * k - 1);
    else if (!a && b && isWaitingIn(s, b.id, 1)) loneSeats.push(2 * k - 1);
    else if (!b && a && isWaitingIn(s, a.id, 1)) loneSeats.push(2 * k);
  }
  if (emptyPairs.length) return shuffle(emptyPairs, rng)[0];
  if (loneSeats.length) return shuffle(loneSeats, rng)[0];
  return undefined;
}

/** Players waiting in `round` with no opponent yet, with the box they sit in (every round). */
export function loneWaiters(s: Snapshot, round: number): Array<{ number: number; slot: number; entry: EntryRow }> {
  const B = s.competition.bracket_size;
  return waitingEntries(s, round)
    .filter((e) => e.slot !== null)
    .map((e) => ({ number: matchNumberFor(B, round, boxOf(e.slot!, round)), slot: e.slot!, entry: e }))
    .sort((a, b) => a.slot - b.slot);
}

/** Round-one slot pairs holding exactly one player: the "awaiting opponent" rows. */
export const halfFullPairs = (s: Snapshot) => loneWaiters(s, 1);

/** True while entries are still accepted (spec 4.2). */
export function buybacksOpen(s: Snapshot): boolean {
  return s.competition.status === "in_progress" && s.competition.buybacks_closed_at === null;
}

export function buybackEntryOf(s: Snapshot, playerId: string): EntryRow | undefined {
  return s.entries.find((e) => e.player_id === playerId && e.source === "buyback");
}

/** The player's first-life entry tonight: from the draw or as a late arrival (rules 3). Not their buy-back. */
export function firstEntryOf(s: Snapshot, playerId: string): EntryRow | undefined {
  return s.entries.find((e) => e.player_id === playerId && e.source !== "buyback");
}

// ---- Display names (spec 3.4). The stored match number stays positional (M1..M15); the screens show
// the round and the match within it: R1M1 … R1M8, R2M1 … R2M4, R3M1, R3M2, and the last round as "Final".

export const boxLabel = (bracketSize: number, round: number, k: number) =>
  round === roundsFor(bracketSize) ? "Final" : `R${round}M${k}`;
export const matchLabel = (s: Snapshot, m: MatchRow) => boxLabel(s.competition.bracket_size, m.round, boxOfMatch(s.competition.bracket_size, m));
/** Round of a positional match number: 16 → 1..8 round one, 9..12 round two, 13..14, 15. */
export function roundOfNumber(bracketSize: number, number: number): number {
  let r = 1;
  while (number > bracketSize - bracketSize / 2 ** r) r++;
  return r;
}
/** Display name of a positional match number (the API replies carry numbers). */
export function numberLabel(bracketSize: number, number: number): string {
  const r = roundOfNumber(bracketSize, number);
  return boxLabel(bracketSize, r, number - (bracketSize - bracketSize / 2 ** (r - 1)));
}
/** The round r−1 box whose winner a player waiting in box k of round r (from `slot`) is waiting for. */
export function feederLabel(bracketSize: number, slot: number, round: number): string {
  const j = boxOf(slot, round - 1);
  return boxLabel(bracketSize, round - 1, j % 2 === 1 ? j + 1 : j - 1);
}

/** Removes a match row if it is still present (never splice(indexOf) — a miss would drop the last row). */
export function removeMatch(s: Snapshot, m: MatchRow): void {
  const i = s.matches.indexOf(m);
  if (i >= 0) s.matches.splice(i, 1);
}
