// Calls the route handlers directly (no HTTP server) against the in-memory PGlite database.
import * as login from "@/app/api/admin/login/route";
import * as logout from "@/app/api/admin/logout/route";
import * as adminBracket from "@/app/api/admin/bracket/route";
import * as publicBracket from "@/app/api/public/bracket/route";
import * as publicPlayers from "@/app/api/public/players/route";
import * as players from "@/app/api/admin/players/route";
import * as playerById from "@/app/api/admin/players/[id]/route";
import * as ratingHistory from "@/app/api/admin/players/[id]/rating-history/route";
import * as competitions from "@/app/api/admin/competitions/route";
import * as competitionById from "@/app/api/admin/competitions/[id]/route";
import * as entries from "@/app/api/admin/competitions/[id]/entries/route";
import * as entryById from "@/app/api/admin/competitions/[id]/entries/[entryId]/route";
import * as start from "@/app/api/admin/competitions/[id]/start/route";
import * as forcePair from "@/app/api/admin/competitions/[id]/force-pair/route";
import * as closeBuybacks from "@/app/api/admin/competitions/[id]/close-buybacks/route";
import * as abandon from "@/app/api/admin/competitions/[id]/abandon/route";
import * as ratingReview from "@/app/api/admin/competitions/[id]/rating-review/route";
import * as adminActions from "@/app/api/admin/competitions/[id]/admin-actions/route";
import * as ovEntries from "@/app/api/admin/competitions/[id]/override/entries/route";
import * as ovEntryById from "@/app/api/admin/competitions/[id]/override/entries/[entryId]/route";
import * as ovPair from "@/app/api/admin/competitions/[id]/override/pair/route";
import * as ovFreePass from "@/app/api/admin/competitions/[id]/override/free-pass/route";
import * as ovFreePassById from "@/app/api/admin/competitions/[id]/override/free-pass/[fpId]/route";
import * as ovReopen from "@/app/api/admin/competitions/[id]/override/reopen-buybacks/route";
import * as ovGrow from "@/app/api/admin/competitions/[id]/override/grow-bracket/route";
import * as matchById from "@/app/api/admin/matches/[id]/route";
import * as matchStart from "@/app/api/admin/matches/[id]/start/route";
import * as matchCancel from "@/app/api/admin/matches/[id]/cancel-start/route";
import * as matchComplete from "@/app/api/admin/matches/[id]/complete/route";
import * as matchCorrect from "@/app/api/admin/matches/[id]/correct/route";
import * as ovMatch from "@/app/api/admin/matches/[id]/override/route";
import * as ovReset from "@/app/api/admin/matches/[id]/override/reset/route";
import * as ovReplace from "@/app/api/admin/matches/[id]/override/replace-player/route";
import * as ping from "@/app/api/cron/ping/route";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export type Reply<T = Record<string, unknown>> = { status: number; body: T; headers: Headers };

let cookie = "";

export async function call<T = Record<string, unknown>>(
  handler: Handler,
  method: string,
  path: string,
  opts: { body?: unknown; params?: Record<string, string>; auth?: boolean } = {},
): Promise<Reply<T>> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false && cookie) headers.cookie = cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://test.local${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, headers: res.headers };
}

export function setCookie(value: string) {
  cookie = value;
}

export async function loginAs(code: string): Promise<Reply> {
  const r = await call(login.POST, "POST", "/api/admin/login", { body: { code }, auth: false });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return r;
}

export const api = {
  logout: () => call(logout.POST, "POST", "/api/admin/logout"),
  ping: (secret: string) =>
    ping.GET(new Request("http://test.local/api/cron/ping", { headers: { authorization: `Bearer ${secret}` } }), { params: Promise.resolve({}) }),
  bracket: (competition?: string) =>
    call<BracketPayload>(adminBracket.GET, "GET", `/api/admin/bracket${competition ? `?competition=${competition}` : ""}`),
  publicBracket: () => call<BracketPayload>(publicBracket.GET, "GET", "/api/public/bracket", { auth: false }),
  publicPlayers: () => call<{ players: Array<{ id: string; name: string; rating: number }> }>(publicPlayers.GET, "GET", "/api/public/players", { auth: false }),
  players: (includeInactive = false) =>
    call<{ players: Array<{ id: string; name: string; rating: number; active: boolean }> }>(players.GET, "GET", `/api/admin/players${includeInactive ? "?include_inactive=1" : ""}`),
  createPlayer: (name: string, rating: number) => call<{ player: { id: string; name: string; rating: number } }>(players.POST, "POST", "/api/admin/players", { body: { name, rating } }),
  patchPlayer: (id: string, body: unknown) => call<{ player: { id: string; rating: number; active: boolean } }>(playerById.PATCH, "PATCH", `/api/admin/players/${id}`, { body, params: { id } }),
  ratingHistory: (id: string) => call<{ history: Array<{ old_rating: number | null; new_rating: number; changed_by: string }> }>(ratingHistory.GET, "GET", `/api/admin/players/${id}/rating-history`, { params: { id } }),
  competitions: () => call<{ competitions: Array<{ id: string; status: string; rating_top_count: number }> }>(competitions.GET, "GET", "/api/admin/competitions"),
  createCompetition: (body: unknown = {}) =>
    call<{ competition: { id: string; name: string; bracket_size: number; rating_top_count: number; rating_bottom_delta: number } }>(competitions.POST, "POST", "/api/admin/competitions", { body }),
  getCompetition: (id: string) => call<BracketPayload>(competitionById.GET, "GET", `/api/admin/competitions/${id}`, { params: { id } }),
  patchCompetition: (id: string, body: unknown) => call<{ bracket: BracketPayload }>(competitionById.PATCH, "PATCH", `/api/admin/competitions/${id}`, { body, params: { id } }),
  addEntry: (id: string, body: unknown) => call<{ entry_id: string; match_number: number | null; awaiting_in: number | null; bracket: BracketPayload }>(entries.POST, "POST", `/api/admin/competitions/${id}/entries`, { body, params: { id } }),
  removeEntry: (id: string, entryId: string) => call(entryById.DELETE, "DELETE", `/api/admin/competitions/${id}/entries/${entryId}`, { params: { id, entryId } }),
  start: (id: string) => call<{ bracket: BracketPayload }>(start.POST, "POST", `/api/admin/competitions/${id}/start`, { params: { id } }),
  forcePair: (id: string) => call<{ match_number: number; bracket: BracketPayload }>(forcePair.POST, "POST", `/api/admin/competitions/${id}/force-pair`, { params: { id } }),
  closeBuybacks: (id: string) => call<{ free_passes: number; free_pass_names: string[]; matches_created: number[]; completed: boolean; bracket: BracketPayload }>(closeBuybacks.POST, "POST", `/api/admin/competitions/${id}/close-buybacks`, { params: { id } }),
  abandon: (id: string) => call(abandon.POST, "POST", `/api/admin/competitions/${id}/abandon`, { params: { id } }),
  ratingReview: (id: string) => call<{ rows: Array<{ player_id: string; name: string; current_rating: number; proposed_rating: number; delta: number; group: string; finish: string }> }>(ratingReview.GET, "GET", `/api/admin/competitions/${id}/rating-review`, { params: { id } }),
  saveRatingReview: (id: string, changes: Array<{ player_id: string; new_rating: number }>) => call<{ written: number }>(ratingReview.POST, "POST", `/api/admin/competitions/${id}/rating-review`, { body: { changes }, params: { id } }),
  adminActions: (id: string) => call<{ actions: Array<{ actor: string; action: string; details: Record<string, unknown> }> }>(adminActions.GET, "GET", `/api/admin/competitions/${id}/admin-actions`, { params: { id } }),
  patchMatch: (id: string, body: unknown) => call<{ bracket: BracketPayload }>(matchById.PATCH, "PATCH", `/api/admin/matches/${id}`, { body, params: { id } }),
  startMatch: (id: string, body: unknown = {}) => call<{ started_at: string; time_limit_minutes: number; bracket: BracketPayload }>(matchStart.POST, "POST", `/api/admin/matches/${id}/start`, { body, params: { id } }),
  cancelStart: (id: string) => call<{ bracket: BracketPayload }>(matchCancel.POST, "POST", `/api/admin/matches/${id}/cancel-start`, { params: { id } }),
  complete: (id: string, winner_entry_id: string, loser_decision?: string) =>
    call<CompleteReply>(matchComplete.POST, "POST", `/api/admin/matches/${id}/complete`, { body: { winner_entry_id, loser_decision }, params: { id } }),
  correct: (id: string, winner_entry_id: string, loser_decision?: string) =>
    call<CompleteReply>(matchCorrect.POST, "POST", `/api/admin/matches/${id}/correct`, { body: { winner_entry_id, loser_decision }, params: { id } }),
  ov: {
    addPlayer: (id: string, body: unknown) => call<OverrideReply>(ovEntries.POST, "POST", `/api/admin/competitions/${id}/override/entries`, { body, params: { id } }),
    removeEntry: (id: string, entryId: string, body: unknown = {}) => call<OverrideReply>(ovEntryById.DELETE, "DELETE", `/api/admin/competitions/${id}/override/entries/${entryId}`, { body, params: { id, entryId } }),
    pair: (id: string, body: unknown) => call<OverrideReply>(ovPair.POST, "POST", `/api/admin/competitions/${id}/override/pair`, { body, params: { id } }),
    freePass: (id: string, body: unknown) => call<OverrideReply>(ovFreePass.POST, "POST", `/api/admin/competitions/${id}/override/free-pass`, { body, params: { id } }),
    revokeFreePass: (id: string, fpId: string, body: unknown = {}) => call<OverrideReply>(ovFreePassById.DELETE, "DELETE", `/api/admin/competitions/${id}/override/free-pass/${fpId}`, { body, params: { id, fpId } }),
    reopen: (id: string, body: unknown = {}) => call<OverrideReply>(ovReopen.POST, "POST", `/api/admin/competitions/${id}/override/reopen-buybacks`, { body, params: { id } }),
    grow: (id: string, body: unknown = {}) => call<OverrideReply>(ovGrow.POST, "POST", `/api/admin/competitions/${id}/override/grow-bracket`, { body, params: { id } }),
    deleteMatch: (id: string, body: unknown = {}) => call<OverrideReply>(ovMatch.DELETE, "DELETE", `/api/admin/matches/${id}/override`, { body, params: { id } }),
    reset: (id: string, body: unknown = {}) => call<OverrideReply>(ovReset.POST, "POST", `/api/admin/matches/${id}/override/reset`, { body, params: { id } }),
    replace: (id: string, body: unknown) => call<OverrideReply>(ovReplace.POST, "POST", `/api/admin/matches/${id}/override/replace-player`, { body, params: { id } }),
  },
};

export interface CompleteReply {
  ok?: boolean;
  error?: string;
  loser_decision: string | null;
  no_slots: boolean;
  buyback_match_number: number | null;
  auto_closed: boolean;
  free_passes: number;
  winner_to: { kind: string; round: number | null; match_number: number | null };
  completed: boolean;
  bracket: BracketPayload;
}

export interface OverrideReply {
  ok?: boolean;
  dry_run?: boolean;
  error?: string;
  changes: string[];
  result: unknown;
  bracket: BracketPayload;
}

/** Convenience lookups on a payload. */
export const find = {
  match: (b: BracketPayload, number: number): MatchView => {
    for (const r of b.rounds) for (const m of r.matches) if (m.number === number) return m;
    throw new Error(`no M${number}`);
  },
  round: (b: BracketPayload, round: number) => b.rounds.find((r) => r.round === round)!,
  matchesInRound: (b: BracketPayload, round: number) => b.rounds.find((r) => r.round === round)?.matches ?? [],
};

/** Starts and completes a match, player A winning unless told otherwise. */
export async function playMatch(m: MatchView, winner: "a" | "b" = "a", decision?: string) {
  if (m.state === "not_started") {
    const s = await api.startMatch(m.id);
    if (s.status !== 200) throw new Error(`start ${m.label}: ${JSON.stringify(s.body)}`);
  }
  const r = await api.complete(m.id, winner === "a" ? m.a.entry_id : m.b.entry_id, decision);
  if (r.status !== 200) throw new Error(`complete ${m.label}: ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Plays every unfinished match of the current round. Round-one first-draw losers decline by default. */
export async function playCurrentRound(competitionId: string, pick: (m: MatchView) => "a" | "b" = () => "a", decide: (m: MatchView) => string | undefined = () => "declined") {
  let b = (await api.bracket(competitionId)).body;
  const round = b.competition!.current_round;
  for (const m of find.matchesInRound(b, round)) {
    if (m.state === "finished") continue;
    const w = pick(m);
    const loser = w === "a" ? m.b : m.a;
    const eligible = round === 1 && loser.source === "draw" && b.competition!.buybacks_open;
    await playMatch(m, w, eligible ? decide(m) : undefined);
    b = (await api.bracket(competitionId)).body;
    if (b.competition!.status !== "in_progress") break;
  }
  return b;
}
