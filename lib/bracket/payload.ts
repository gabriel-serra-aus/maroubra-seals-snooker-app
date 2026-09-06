// The bracket JSON (spec 7.2) built from a Snapshot. Public and admin routes and the pages all use it.

import {
  buybacksOpen,
  currentRound,
  halfFullPairs,
  matchLabel,
  opponentOf,
  openSlots,
  positionOf,
  waitingEntries,
  type Position,
} from "@/lib/logic/derive";
import { correctionBlockedReason } from "@/lib/logic/matchControl";
import type { BuybackDecision, EntrySource, MatchOrigin, MatchState, Snapshot } from "@/lib/logic/types";

export interface EntryView {
  entry_id: string;
  player_id: string;
  name: string;
  rating: number;
  source: EntrySource;
  slot: number | null;
  buyback_seq: number | null;
  buyback_decision: BuybackDecision | null;
  position: Position;
}

export interface MatchView {
  id: string;
  round: number;
  number: number;
  label: string;
  state: MatchState;
  origin: MatchOrigin;
  a: EntryView;
  b: EntryView;
  rating_a: number;
  rating_b: number;
  start_points: number;
  start_entry_id: string | null;
  /** The limit that applies: frozen once started, else the per-match override, else the default. */
  time_limit_minutes: number;
  has_own_time_limit: boolean;
  started_at: string | null;
  finished_at: string | null;
  winner_id: string | null;
  loser_id: string | null;
  corrected_at: string | null;
  correction_blocked: string | null;
}

export interface RoundView {
  round: number;
  matches: MatchView[];
  /** Round-one slot pairs with one player: "awaiting opponent". */
  awaiting: Array<{ number: number; slot: number; entry: EntryView }>;
  waiting: EntryView[];
  free_passes: Array<{ id: string; entry: EntryView }>;
}

export interface BracketPayload {
  server_now: string;
  competition: null | {
    id: string;
    name: string;
    status: string;
    bracket_size: number;
    buyback_mode: string;
    default_time_limit_minutes: number;
    rating_top_count: number;
    rating_top_delta: number;
    rating_bottom_count: number;
    rating_bottom_delta: number;
    started_at: string | null;
    buybacks_closed_at: string | null;
    completed_at: string | null;
    current_round: number;
    buybacks_open: boolean;
    open_slots: number;
    winner: EntryView | null;
    /** Players left waiting in a finished round who block the next draw (override screen work). */
    draw_blocked_by: EntryView[];
  };
  rounds: RoundView[];
  /** Everyone with an entry tonight, by player, with their current rating. */
  players: Array<{ id: string; name: string; rating: number }>;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function buildBracketPayload(s: Snapshot | null, now = new Date()): BracketPayload {
  if (!s || s.competition.status === "abandoned") return { server_now: now.toISOString(), competition: null, rounds: [], players: [] };
  const c = s.competition;
  const view = (entryId: string): EntryView => {
    const e = s.entries.find((x) => x.id === entryId)!;
    const p = s.players.find((x) => x.id === e.player_id);
    return {
      entry_id: e.id,
      player_id: e.player_id,
      name: p?.name ?? "?",
      rating: p?.rating ?? e.rating_at_entry,
      source: e.source,
      slot: e.slot,
      buyback_seq: e.buyback_seq,
      buyback_decision: e.buyback_decision,
      position: positionOf(s, e.id),
    };
  };
  const round = currentRound(s);
  // Players can be waiting in a round beyond the last match (its only match was deleted): show that round too.
  let lastRound = round;
  for (const e of s.entries) {
    const p = positionOf(s, e.id);
    if (p.status === "waiting" && c.status === "in_progress") lastRound = Math.max(lastRound, p.round);
  }
  const rounds: RoundView[] = [];
  for (let r = 1; r <= lastRound; r++) {
    rounds.push({
      round: r,
      matches: s.matches
        .filter((m) => m.round === r)
        .sort((x, y) => x.number - y.number)
        .map((m) => ({
          id: m.id,
          round: m.round,
          number: m.number,
          label: matchLabel(m),
          state: m.state,
          origin: m.origin,
          a: view(m.player_a_id),
          b: view(m.player_b_id),
          rating_a: m.rating_a,
          rating_b: m.rating_b,
          start_points: m.start_points,
          start_entry_id: m.start_entry_id,
          time_limit_minutes: m.time_limit_minutes ?? c.default_time_limit_minutes,
          has_own_time_limit: m.time_limit_minutes !== null,
          started_at: iso(m.started_at),
          finished_at: iso(m.finished_at),
          winner_id: m.winner_id,
          loser_id: m.winner_id ? opponentOf(m, m.winner_id) : null,
          corrected_at: iso(m.corrected_at),
          correction_blocked: m.state === "finished" ? correctionBlockedReason(s, m) : null,
        })),
      awaiting: r === 1 && c.status === "in_progress" ? halfFullPairs(s).map((h) => ({ number: h.number, slot: h.slot, entry: view(h.entry.id) })) : [],
      waiting: c.status === "in_progress" ? waitingEntries(s, r).map((e) => view(e.id)) : [],
      free_passes: s.freePasses.filter((fp) => fp.from_round === r).map((fp) => ({ id: fp.id, entry: view(fp.entry_id) })),
    });
  }
  // From round two, waiting players in a finished round block the next draw until the override pairs them
  // or grants a free pass (round-one stragglers go through automatically at the draw, rules 11 / O-4).
  const last = rounds[lastRound - 1];
  const drawBlocked =
    c.status === "in_progress" && lastRound >= 2 && last.matches.every((m) => m.state === "finished") ? last.waiting : [];
  return {
    server_now: now.toISOString(),
    competition: {
      id: c.id,
      name: c.name,
      status: c.status,
      bracket_size: c.bracket_size,
      buyback_mode: c.buyback_mode,
      default_time_limit_minutes: c.default_time_limit_minutes,
      rating_top_count: c.rating_top_count,
      rating_top_delta: c.rating_top_delta,
      rating_bottom_count: c.rating_bottom_count,
      rating_bottom_delta: c.rating_bottom_delta,
      started_at: iso(c.started_at),
      buybacks_closed_at: iso(c.buybacks_closed_at),
      completed_at: iso(c.completed_at),
      current_round: round,
      buybacks_open: buybacksOpen(s),
      open_slots: openSlots(s),
      winner: c.winner_entry_id ? view(c.winner_entry_id) : null,
      draw_blocked_by: drawBlocked,
    },
    rounds,
    players: s.players
      .filter((p) => s.entries.some((e) => e.player_id === p.id))
      .map((p) => ({ id: p.id, name: p.name, rating: p.rating }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
