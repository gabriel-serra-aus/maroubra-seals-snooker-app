// Shared pieces for the admin route handlers.

import { getDb } from "@/lib/db/client";
import { createPlayer } from "@/lib/db/players";
import type { Session } from "@/lib/auth/session";
import { notFound } from "@/lib/logic/errors";
import type { CompleteResult } from "@/lib/logic/matchControl";
import type { Ctx, Snapshot } from "@/lib/logic/types";
import { json, readJson } from "./respond";
import { mutateCompetition, type MutateOptions } from "./mutate";
import { optionalBool, requiredRating, requiredString, requiredUuid } from "./validate";

export async function competitionIdOfMatch(matchId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.query<{ competition_id: string }>("select competition_id from matches where id = $1", [matchId]);
  if (!rows[0]) throw notFound("Match not found");
  return rows[0].competition_id;
}

/** `{ player_id }` or `{ new_player: { name, rating } }` — the second creates the club player first (spec 7.4). */
export async function resolvePlayerId(body: Record<string, unknown>, session: Session): Promise<string> {
  const np = body.new_player;
  if (np && typeof np === "object") {
    const b = np as Record<string, unknown>;
    const name = requiredString(b, "name", 60);
    const rating = requiredRating(b);
    const db = await getDb();
    const player = await db.transaction((tx) => createPlayer(tx, name, rating, session.name));
    return player.id;
  }
  return requiredUuid(body, "player_id");
}

/**
 * Runs an override action (spec 7.6): with `{ dry_run: true }` it returns the change list without writing;
 * otherwise it writes, logs and returns the bracket plus the same change list.
 */
export async function runOverride<T>(
  request: Request,
  session: Session,
  body: Record<string, unknown>,
  opts: MutateOptions,
  fn: (s: Snapshot, ctx: Ctx) => T,
): Promise<Response> {
  const dryRun = optionalBool(body, "dry_run") ?? false;
  const r = await mutateCompetition(session, { ...opts, dryRun }, fn);
  if (dryRun) return json({ dry_run: true, changes: r.changes });
  return json({ ok: true, changes: r.changes, result: r.result ?? null, bracket: r.bracket });
}

/** "Friday 11 Sep 2026" in Sydney time. */
export function defaultCompetitionName(now = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney",
  }).format(now);
}

/** The JSON both Complete and Correct return (spec 7.5). */
export function completeResponse(r: CompleteResult) {
  return {
    ok: true,
    winner_entry_id: r.match.winner_id,
    loser_decision: r.loser.decision,
    no_slots: r.loser.decision === "no_slots",
    buyback_match_number: r.loser.buybackMatch?.number ?? null,
    auto_closed: r.autoClose !== null,
    free_passes: r.autoClose?.freePasses.length ?? 0,
    round_drawn: r.draw && !r.draw.completed ? r.draw.round : null,
    completed: r.draw?.completed ?? false,
  };
}

export { readJson };
