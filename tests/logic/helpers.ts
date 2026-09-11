import { closeBuybacks } from "@/lib/logic/buybacks";
import { addDrawEntry, startCompetition } from "@/lib/logic/competition";
import { currentRound, matchLabel } from "@/lib/logic/derive";
import { completeMatch, startMatch, type LoserDecision } from "@/lib/logic/matchControl";
import { freeTables } from "@/lib/logic/tables";
import { seededRng } from "@/lib/logic/random";
import type { BracketSize, Ctx, EntryRow, MatchRow, PlayerRow, Snapshot } from "@/lib/logic/types";

export const NOW = new Date("2026-09-11T09:00:00Z");

export function makeCtx(seed = 1): Ctx {
  let n = 0;
  return { now: NOW, rng: seededRng(seed), actor: "Gabriel", newId: () => `id${++n}`, log: [] };
}

export interface NightOpts {
  bracket: BracketSize;
  ratings: number[];
  topCount?: number;
  topDelta?: number;
  bottomCount?: number;
  bottomDelta?: number;
  tables?: number;
}

/** A competition in `setup` with players P1..Pn (ratings as given) ticked in. */
export function setupNight(opts: NightOpts, ctx = makeCtx()): { s: Snapshot; ctx: Ctx } {
  const players: PlayerRow[] = opts.ratings.map((rating, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, rating, active: true }));
  const s: Snapshot = {
    competition: {
      id: "comp1",
      name: "Friday",
      status: "setup",
      bracket_size: opts.bracket,
      default_time_limit_minutes: 25,
      table_count: opts.tables ?? 4,
      rating_top_count: opts.topCount ?? 3,
      rating_top_delta: opts.topDelta ?? -1,
      rating_bottom_count: opts.bottomCount ?? 3,
      rating_bottom_delta: opts.bottomDelta ?? 2,
      started_at: null,
      buybacks_closed_at: null,
      completed_at: null,
      abandoned_at: null,
      winner_entry_id: null,
      created_at: NOW,
      updated_at: NOW,
    },
    players,
    entries: [],
    matches: [],
    freePasses: [],
  };
  for (const p of players) addDrawEntry(s, ctx, p.id);
  return { s, ctx };
}

/** Started night. Entries are shuffled, so use slotEntry()/playerAt() rather than P-numbers. */
export function startNight(opts: NightOpts, ctx = makeCtx()): { s: Snapshot; ctx: Ctx } {
  const r = setupNight(opts, ctx);
  startCompetition(r.s, r.ctx);
  return r;
}

export const match = (s: Snapshot, number: number): MatchRow => {
  const m = s.matches.find((x) => x.number === number);
  if (!m) throw new Error(`no M${number}: have ${s.matches.map((m) => matchLabel(s, m)).join(",")}`);
  return m;
};

export const hasMatch = (s: Snapshot, number: number) => s.matches.some((x) => x.number === number);

export const slotEntry = (s: Snapshot, slot: number): EntryRow => {
  const e = s.entries.find((x) => x.slot === slot);
  if (!e) throw new Error(`no entry in slot ${slot}`);
  return e;
};

export const entryOf = (s: Snapshot, playerId: string, source: "draw" | "late" | "buyback" = "draw"): EntryRow => {
  const e = s.entries.find((x) => x.player_id === playerId && x.source === source);
  if (!e) throw new Error(`no ${source} entry for ${playerId}`);
  return e;
};

export const nameOf = (s: Snapshot, entryId: string) => {
  const e = s.entries.find((x) => x.id === entryId)!;
  return s.players.find((p) => p.id === e.player_id)!.name;
};

export const entry = (s: Snapshot, id: string): EntryRow => s.entries.find((e) => e.id === id)!;

/** Start a match on the lowest free table, the way the organiser taps it (spec 5.14). */
export function startOn(s: Snapshot, ctx: Ctx, matchId: string): MatchRow {
  return startMatch(s, ctx, matchId, undefined, freeTables(s)[0]);
}

/** Start then complete a match. `winner` = "a" | "b" | entry id. */
export function play(s: Snapshot, ctx: Ctx, number: number, winner: "a" | "b" | string, decision?: LoserDecision) {
  const m = match(s, number);
  if (m.state === "not_started") startOn(s, ctx, m.id);
  const winnerId = winner === "a" ? m.player_a_id : winner === "b" ? m.player_b_id : winner;
  return completeMatch(s, ctx, m.id, winnerId, decision);
}

/** Plays every unfinished match of the current round; player A wins unless `pick` says otherwise. */
export function playRound(
  s: Snapshot,
  ctx: Ctx,
  pick: (m: MatchRow) => "a" | "b" = () => "a",
  decide: (m: MatchRow, loser: EntryRow) => LoserDecision | undefined = () => "declined",
) {
  const r = currentRound(s);
  for (const m of s.matches.filter((x) => x.round === r && x.state !== "finished").sort((a, b) => a.number - b.number)) {
    const w = pick(m);
    const loserId = w === "a" ? m.player_b_id : m.player_a_id;
    const loser = s.entries.find((e) => e.id === loserId)!;
    const eligible = m.round === 1 && loser.source === "draw" && s.competition.buybacks_closed_at === null;
    play(s, ctx, m.number, w, eligible ? decide(m, loser) : undefined);
    if (s.competition.status !== "in_progress") return;
  }
  // The window never closes by itself (O-15): once round one is played out, do what the organiser does
  // and tap No More Buy-Backs / Late Entries, so lone players get their pass and the tree moves on.
  if (r === 1 && s.competition.buybacks_closed_at === null && !s.matches.some((m) => m.round === 1 && m.state !== "finished")) closeBuybacks(s, ctx);
}

/** Plays the whole night out, round by round, until there is a winner. */
export function playToEnd(s: Snapshot, ctx: Ctx, limit = 40) {
  let guard = 0;
  while (s.competition.status === "in_progress" && guard++ < limit) playRound(s, ctx);
  if (s.competition.status === "in_progress") throw new Error("playToEnd: the night did not finish");
}

export const freePassRounds = (s: Snapshot) => s.freePasses.map((fp) => fp.from_round);
