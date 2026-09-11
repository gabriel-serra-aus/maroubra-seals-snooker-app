// Row shapes mirror supabase/migrations (spec 6). The logic works on a Snapshot of one competition and
// mutates a clone of it; lib/db/apply.ts diffs before/after and writes the changes.

import type { Rng } from "./random";

export type MatchState = "not_started" | "in_play" | "finished";
export type CompetitionStatus = "setup" | "in_progress" | "complete" | "abandoned";
/** draw = the first draw; late = joined after the draw (rules 3, 8.3), still entitled to one buy-back; buyback = a round-one loser re-entering. */
export type EntrySource = "draw" | "late" | "buyback";
export type BuybackDecision = "bought_back" | "declined" | "no_slots";
/** How a match came to exist: the draw, a buy-back placement, Force Pair, a close, advancement up the tree, a correction, an override. */
export type MatchOrigin = "draw" | "placement" | "force_pair" | "close" | "advance" | "correction" | "override";
export type BracketSize = 16 | 32;

export interface PlayerRow {
  id: string;
  name: string;
  rating: number;
  active: boolean;
}

export interface CompetitionRow {
  id: string;
  name: string;
  status: CompetitionStatus;
  bracket_size: BracketSize;
  default_time_limit_minutes: number;
  /** Snooker tables the club plays on tonight, numbered 1..table_count (spec 5.14). */
  table_count: number;
  rating_top_count: number;
  rating_top_delta: number;
  rating_bottom_count: number;
  rating_bottom_delta: number;
  started_at: Date | null;
  buybacks_closed_at: Date | null;
  completed_at: Date | null;
  abandoned_at: Date | null;
  winner_entry_id: string | null;
  created_at: Date;
  /** Bumped by every write to the night (lib/api/mutate.ts); the bracket JSON carries it as `version` (spec 7.2). */
  updated_at: Date;
}

export interface EntryRow {
  id: string;
  competition_id: string;
  player_id: string;
  source: EntrySource;
  /** Round-one slot 1..bracket_size. Fixes the player's place in the whole tree (spec 5.4, O-14). */
  slot: number | null;
  buyback_seq: number | null;
  rebuy_of_entry_id: string | null;
  buyback_decision: BuybackDecision | null;
  rating_at_entry: number;
  joined_round: number;
  entered_at: Date;
}

export interface MatchRow {
  id: string;
  competition_id: string;
  round: number;
  number: number;
  player_a_id: string;
  player_b_id: string;
  rating_a: number;
  rating_b: number;
  start_points: number;
  start_entry_id: string | null;
  state: MatchState;
  origin: MatchOrigin;
  time_limit_minutes: number | null;
  /** The table the match is (or was) played on; set at Start, cleared by Cancel start (spec 5.14). */
  table_number: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  winner_id: string | null;
  corrected_at: Date | null;
  created_at: Date;
}

export interface FreePassRow {
  id: string;
  competition_id: string;
  entry_id: string;
  from_round: number;
  granted_at: Date;
}

export interface Snapshot {
  competition: CompetitionRow;
  /** Every player with an entry tonight, plus any player about to be added. Current ratings. */
  players: PlayerRow[];
  entries: EntryRow[];
  matches: MatchRow[];
  freePasses: FreePassRow[];
}

export interface AdminAction {
  action: string;
  details: Record<string, unknown>;
}

/** Everything a logic function needs besides the snapshot. Injected so tests are deterministic. */
export interface Ctx {
  now: Date;
  rng: Rng;
  actor: string;
  newId: () => string;
  /** Audit rows the caller persists after the logic returns (O-5, O-8). */
  log: AdminAction[];
}

export function cloneSnapshot(s: Snapshot): Snapshot {
  return structuredClone(s);
}
