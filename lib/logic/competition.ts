// Setup, Start Competition (rules 8, spec 5.1), End night here (O-16) and Abandon (O-7), both spec 5.11.

import { badRequest, conflict } from "./errors";
import { entryById, matchLabel, matchNumberForSlot, playerRating, positionOf } from "./derive";
import { createMatch } from "./matches";
import { shuffle } from "./random";
import type { Ctx, EntryRow, Snapshot } from "./types";

/** Setup only: tick a player into tonight's entry list. */
export function addDrawEntry(s: Snapshot, ctx: Ctx, playerId: string): EntryRow {
  if (s.competition.status !== "setup") throw conflict("Players can only be entered before the competition starts");
  if (s.entries.some((e) => e.player_id === playerId)) throw conflict("That player is already entered");
  if (s.entries.length >= s.competition.bracket_size) {
    throw conflict(`The ${s.competition.bracket_size} bracket is full — choose the 32 bracket`);
  }
  const player = s.players.find((p) => p.id === playerId);
  if (!player) throw badRequest("Unknown player");
  if (!player.active) throw conflict("Inactive players cannot be entered");
  const entry: EntryRow = {
    id: ctx.newId(),
    competition_id: s.competition.id,
    player_id: playerId,
    source: "draw",
    slot: null,
    buyback_seq: null,
    rebuy_of_entry_id: null,
    buyback_decision: null,
    rating_at_entry: player.rating,
    joined_round: 1,
    entered_at: ctx.now,
  };
  s.entries.push(entry);
  return entry;
}

/** Setup only: untick a player. */
export function removeDrawEntry(s: Snapshot, entryId: string): void {
  if (s.competition.status !== "setup") throw conflict("Players can only be removed before the competition starts");
  const i = s.entries.findIndex((e) => e.id === entryId);
  if (i < 0) throw badRequest("Unknown entry");
  s.entries.splice(i, 1);
}

/**
 * Start Competition (rules 8.2, spec 5.1): shuffle the entered players, fill slots 1..N top to bottom,
 * create a match wherever both slots of a pair are filled. An odd player out waits in their slot.
 */
export function startCompetition(s: Snapshot, ctx: Ctx): void {
  const c = s.competition;
  if (c.status !== "setup") throw conflict("The competition has already started");
  const n = s.entries.length;
  if (n < 2) throw conflict("At least 2 players are needed");
  if (n > c.bracket_size) throw conflict(`${n} players do not fit a ${c.bracket_size} bracket — choose the 32 bracket`);
  const order = shuffle(s.entries, ctx.rng);
  order.forEach((entry, i) => {
    entry.slot = i + 1;
    entry.rating_at_entry = playerRating(s, entry.player_id);
  });
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    const a = order[2 * k - 2];
    const b = order[2 * k - 1];
    createMatch(s, ctx, a.id, b.id, 1, matchNumberForSlot(a.slot!), "draw");
  }
  c.status = "in_progress";
  c.started_at = ctx.now;
}

/** Abandon (O-7, spec 5.11): the night is closed, everything is kept, a new one can start at once. */
export function abandonCompetition(s: Snapshot, ctx: Ctx): void {
  const c = s.competition;
  if (c.status !== "setup" && c.status !== "in_progress") {
    throw conflict("Only a competition that is running can be abandoned");
  }
  c.status = "abandoned";
  c.abandoned_at = ctx.now;
  ctx.log.push({ action: "abandon", details: { competition: c.name, matches: s.matches.length } });
}

/**
 * "End night here" (spec 5.11): the club runs out of time far more often than the bracket runs out of
 * matches, so the night is closed where it stands. It counts: the night is `complete`, it keeps every
 * result, it appears in history and it opens the rating review, which reads the round each player
 * reached (spec 5.9) and so does not need a champion. There is no winner — nobody won the final — so
 * `winner_entry_id` stays null and the night reads "completed (unfinished)" everywhere.
 * Any match still in play has its clock thrown away like a Cancel start (O-5): the frame was not played
 * out, and a running countdown on a finished night would be a lie. Unlike Abandon (O-7), which is for a
 * night that should not count at all, this one is the ordinary way most nights end.
 */
export function endCompetitionEarly(s: Snapshot, ctx: Ctx): { unplayed: number; cancelled: number; standing: string[] } {
  const c = s.competition;
  if (c.status !== "in_progress") throw conflict("Only a competition that is running can be ended");
  const cancelled: string[] = [];
  for (const m of s.matches) {
    if (m.state !== "in_play") continue;
    m.started_at = null;
    m.time_limit_minutes = null;
    m.table_number = null;
    m.state = "not_started";
    cancelled.push(matchLabel(s, m));
  }
  const unplayed = s.matches.filter((m) => m.state !== "finished").length;
  const standing = playersStillIn(s);
  c.status = "complete";
  c.completed_at = ctx.now;
  c.winner_entry_id = null;
  ctx.log.push({
    action: "end_early",
    details: { competition: c.name, unplayed, clocks_cancelled: cancelled, still_in: standing },
  });
  return { unplayed, cancelled: cancelled.length, standing };
}

/** Names of the players who had not been knocked out when the night was called (spec 5.11). */
export function playersStillIn(s: Snapshot): string[] {
  const names: string[] = [];
  for (const e of s.entries) {
    if (positionOf(s, e.id).status === "out") continue;
    const p = s.players.find((x) => x.id === e.player_id);
    if (p) names.push(p.name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** The pool of entries that will contest round r+1 is worked out elsewhere; this names the entry for logs. */
export function describeEntry(s: Snapshot, entryId: string): string {
  const e = entryById(s, entryId);
  const name = s.players.find((p) => p.id === e.player_id)?.name ?? "?";
  return e.source === "buyback" ? `${name} (buy-back)` : name;
}
