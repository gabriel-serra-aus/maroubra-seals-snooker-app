// Derived, never stored (spec 6.3 "Derived per-entry status"): where each entry is in the night,
// who is waiting, the current round, open slots and the free-slot order.

import type { EntryRow, MatchRow, Snapshot } from "./types";

export type Position =
  | { status: "waiting"; round: number }
  | { status: "in_match"; round: number; matchId: string }
  | { status: "out"; round: number }
  | { status: "winner"; round: number };

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

/** Highest round anything exists in; 1 before the first match. */
export function currentRound(s: Snapshot): number {
  let r = 1;
  for (const m of s.matches) r = Math.max(r, m.round);
  for (const fp of s.freePasses) r = Math.max(r, fp.from_round);
  return r;
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

/** bracket_size − entries: the whole of the O-3 cap. */
export function openSlots(s: Snapshot): number {
  return s.competition.bracket_size - s.entries.length;
}

export function entryAtSlot(s: Snapshot, slot: number): EntryRow | undefined {
  return s.entries.find((e) => e.slot === slot);
}

export const mateSlot = (slot: number) => (slot % 2 === 1 ? slot + 1 : slot - 1);
export const matchNumberForSlot = (slot: number) => Math.ceil(slot / 2);

/**
 * The free-slot order (spec 5.2): free slots whose pair holds no first-draw player first, then the rest,
 * each ascending by slot number. A slot beside a player who is not waiting (a free-pass holder after
 * close) is not free — filling it would pair someone who has already advanced.
 */
export function freeSlotOrder(s: Snapshot): number[] {
  const B = s.competition.bracket_size;
  const first: number[] = [];
  const second: number[] = [];
  for (let slot = 1; slot <= B; slot++) {
    if (entryAtSlot(s, slot)) continue;
    const mate = entryAtSlot(s, mateSlot(slot));
    if (!mate) first.push(slot);
    else if (!isWaitingIn(s, mate.id, 1)) continue;
    else if (mate.source === "draw") second.push(slot);
    else first.push(slot);
  }
  return [...first, ...second];
}

/** Round-one slot pairs holding exactly one player: the "awaiting opponent" rows. */
export function halfFullPairs(s: Snapshot): Array<{ number: number; slot: number; entry: EntryRow }> {
  const out: Array<{ number: number; slot: number; entry: EntryRow }> = [];
  const B = s.competition.bracket_size;
  for (let k = 1; k <= B / 2; k++) {
    const a = entryAtSlot(s, 2 * k - 1);
    const b = entryAtSlot(s, 2 * k);
    const one = a && !b ? a : b && !a ? b : undefined;
    if (one && isWaitingIn(s, one.id, 1)) out.push({ number: k, slot: one.slot!, entry: one });
  }
  return out;
}

/** True while entries are still accepted (spec 4.2). */
export function buybacksOpen(s: Snapshot): boolean {
  return s.competition.status === "in_progress" && currentRound(s) === 1 && s.competition.buybacks_closed_at === null;
}

export function buybackEntryOf(s: Snapshot, playerId: string): EntryRow | undefined {
  return s.entries.find((e) => e.player_id === playerId && e.source === "buyback");
}

export function drawEntryOf(s: Snapshot, playerId: string): EntryRow | undefined {
  return s.entries.find((e) => e.player_id === playerId && e.source === "draw");
}

export const matchLabel = (m: MatchRow) => `M${m.number}`;

/** Removes a match row if it is still present (never splice(indexOf) — a miss would drop the last row). */
export function removeMatch(s: Snapshot, m: MatchRow): void {
  const i = s.matches.indexOf(m);
  if (i >= 0) s.matches.splice(i, 1);
}
