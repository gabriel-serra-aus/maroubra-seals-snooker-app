import { addDrawEntry, startCompetition } from "@/lib/logic/competition";
import { currentRound, matchLabel } from "@/lib/logic/derive";
import { completeMatch, startMatch, type LoserDecision } from "@/lib/logic/matchControl";
import { seededRng } from "@/lib/logic/random";
import type { BracketSize, BuybackMode, Ctx, EntryRow, MatchRow, PlayerRow, Snapshot } from "@/lib/logic/types";

export const NOW = new Date("2026-09-11T09:00:00Z");

export function makeCtx(seed = 1): Ctx {
  let n = 0;
  return { now: NOW, rng: seededRng(seed), actor: "Gabriel", newId: () => `id${++n}`, log: [] };
}

export interface NightOpts {
  bracket: BracketSize;
  ratings: number[];
  mode?: BuybackMode;
  topCount?: number;
  topDelta?: number;
  bottomCount?: number;
  bottomDelta?: number;
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
      buyback_mode: opts.mode ?? "random_draw",
      default_time_limit_minutes: 25,
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
  if (!m) throw new Error(`no M${number}: have ${s.matches.map(matchLabel).join(",")}`);
  return m;
};

export const slotEntry = (s: Snapshot, slot: number): EntryRow => {
  const e = s.entries.find((x) => x.slot === slot);
  if (!e) throw new Error(`no entry in slot ${slot}`);
  return e;
};

export const entryOf = (s: Snapshot, playerId: string, source: "draw" | "buyback" = "draw"): EntryRow => {
  const e = s.entries.find((x) => x.player_id === playerId && x.source === source);
  if (!e) throw new Error(`no ${source} entry for ${playerId}`);
  return e;
};

export const nameOf = (s: Snapshot, entryId: string) => {
  const e = s.entries.find((x) => x.id === entryId)!;
  return s.players.find((p) => p.id === e.player_id)!.name;
};

/** Start then complete a match. `winner` = "a" | "b" | entry id. */
export function play(s: Snapshot, ctx: Ctx, number: number, winner: "a" | "b" | string, decision?: LoserDecision) {
  const m = match(s, number);
  if (m.state === "not_started") startMatch(s, ctx, m.id);
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
}

export const freePassRounds = (s: Snapshot) => s.freePasses.map((fp) => fp.from_round);
