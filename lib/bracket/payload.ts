// The bracket JSON (spec 7.2) built from a Snapshot. Public and admin routes and the pages all use it.

import {
  boxLabel,
  boxOf,
  boxOfMatch,
  buybacksOpen,
  currentRound,
  lastRound,
  loneWaiters,
  matchLabel,
  matchNumberFor,
  numberLabel,
  opponentOf,
  openSlots,
  positionOf,
  roundsFor,
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
  /** True when this player already has a buy-back entry tonight (so a draw-entry loser cannot buy back again). */
  has_buyback_entry: boolean;
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

/** One position of the fixed tree (spec 5.4): a match, a lone player, a free-pass holder passing through, or nothing yet. */
export interface BoxView {
  k: number;
  number: number;
  /** Display name: R1M1 … or "Final" (spec 3.4). */
  label: string;
  match: MatchView | null;
  /** The lone player waiting here, or the player who passed through this box on a free pass. */
  entry: EntryView | null;
  free_pass: boolean;
}

export interface RoundView {
  round: number;
  matches: MatchView[];
  /** Slot pairs (round one) or boxes (later rounds) with one player: "awaiting opponent". */
  awaiting: Array<{ number: number; label: string; slot: number; entry: EntryView }>;
  waiting: EntryView[];
  free_passes: Array<{ id: string; entry: EntryView }>;
  /** Every box of the round in order, for the tree view. */
  boxes: BoxView[];
}

export interface BracketPayload {
  server_now: string;
  competition: null | {
    id: string;
    name: string;
    status: string;
    bracket_size: number;
    rounds_total: number;
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
    /** Complete with no champion: the night was ended early on time (spec 5.11). */
    ended_early: boolean;
  };
  rounds: RoundView[];
  /** Every entry tonight with where it stands (the override screen lists these). */
  entries: EntryView[];
  /** Everyone with an entry tonight, by player, with their current rating. */
  players: Array<{ id: string; name: string; rating: number }>;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function buildBracketPayload(s: Snapshot | null, now = new Date()): BracketPayload {
  if (!s || s.competition.status === "abandoned") return { server_now: now.toISOString(), competition: null, rounds: [], entries: [], players: [] };
  const c = s.competition;
  const B = c.bracket_size;
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
      has_buyback_entry: s.entries.some((x) => x.player_id === e.player_id && x.source === "buyback"),
      position: positionOf(s, e.id),
    };
  };
  const matchView = (m: Snapshot["matches"][number]): MatchView => ({
    id: m.id,
    round: m.round,
    number: m.number,
    label: matchLabel(s, m),
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
  });
  const inProgress = c.status === "in_progress";
  const R = roundsFor(B);
  const shown = c.status === "setup" ? 1 : lastRound(s);
  const rounds: RoundView[] = [];
  for (let r = 1; r <= shown; r++) {
    const matches = s.matches
      .filter((m) => m.round === r)
      .sort((x, y) => x.number - y.number)
      .map(matchView);
    const passes = s.freePasses.filter((fp) => fp.from_round === r);
    const lone = inProgress ? loneWaiters(s, r) : [];
    const boxes: BoxView[] = [];
    for (let k = 1; k <= B / 2 ** r; k++) {
      const m = matches.find((x) => boxOfMatch(B, { number: x.number, round: r } as Snapshot["matches"][number]) === k) ?? null;
      const pass = passes.find((fp) => {
        const slot = s.entries.find((e) => e.id === fp.entry_id)?.slot;
        return slot != null && boxOf(slot, r) === k;
      });
      const waiter = lone.find((w) => boxOf(w.slot, r) === k);
      boxes.push({
        k,
        number: matchNumberFor(B, r, k),
        label: boxLabel(B, r, k),
        match: m,
        entry: m ? null : pass ? view(pass.entry_id) : waiter ? view(waiter.entry.id) : null,
        free_pass: !m && !!pass,
      });
    }
    rounds.push({
      round: r,
      matches,
      awaiting: lone.map((h) => ({ number: h.number, label: numberLabel(B, h.number), slot: h.slot, entry: view(h.entry.id) })),
      waiting: inProgress ? waitingEntries(s, r).map((e) => view(e.id)) : [],
      free_passes: passes.map((fp) => ({ id: fp.id, entry: view(fp.entry_id) })),
      boxes,
    });
  }
  return {
    server_now: now.toISOString(),
    competition: {
      id: c.id,
      name: c.name,
      status: c.status,
      bracket_size: B,
      rounds_total: R,
      default_time_limit_minutes: c.default_time_limit_minutes,
      rating_top_count: c.rating_top_count,
      rating_top_delta: c.rating_top_delta,
      rating_bottom_count: c.rating_bottom_count,
      rating_bottom_delta: c.rating_bottom_delta,
      started_at: iso(c.started_at),
      buybacks_closed_at: iso(c.buybacks_closed_at),
      completed_at: iso(c.completed_at),
      current_round: currentRound(s),
      buybacks_open: buybacksOpen(s),
      open_slots: openSlots(s),
      winner: c.winner_entry_id ? view(c.winner_entry_id) : null,
      ended_early: c.status === "complete" && c.winner_entry_id === null,
    },
    rounds,
    entries: s.entries.map((e) => view(e.id)).sort((x, y) => x.name.localeCompare(y.name) || (x.buyback_seq ?? 0) - (y.buyback_seq ?? 0)),
    players: s.players
      .filter((p) => s.entries.some((e) => e.player_id === p.id))
      .map((p) => ({ id: p.id, name: p.name, rating: p.rating }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
