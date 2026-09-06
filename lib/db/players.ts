// The club list (rules 13, O-9): players are never deleted, ratings carry a full history.

import type { Queryable } from "./client";
import { AppError, conflict, notFound } from "@/lib/logic/errors";

export interface PlayerRecord {
  id: string;
  name: string;
  rating: number;
  active: boolean;
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RatingChangeRow {
  id: string;
  player_id: string;
  competition_id: string | null;
  old_rating: number | null;
  new_rating: number;
  changed_by: string;
  reason: string | null;
  changed_at: Date;
}

export async function listPlayers(q: Queryable, includeInactive: boolean): Promise<PlayerRecord[]> {
  return q.query<PlayerRecord>(
    `select * from players ${includeInactive ? "" : "where active"} order by lower(name)`,
    [],
  );
}

export async function getPlayer(q: Queryable, id: string): Promise<PlayerRecord> {
  const rows = await q.query<PlayerRecord>("select * from players where id = $1", [id]);
  if (!rows[0]) throw notFound("Player not found");
  return rows[0];
}

export async function insertRatingChange(
  q: Queryable,
  p: { player_id: string; competition_id: string | null; old_rating: number | null; new_rating: number; changed_by: string; reason: string | null },
) {
  await q.query(
    "insert into rating_changes (player_id, competition_id, old_rating, new_rating, changed_by, reason) values ($1, $2, $3, $4, $5, $6)",
    [p.player_id, p.competition_id, p.old_rating, p.new_rating, p.changed_by, p.reason],
  );
}

/** Adds a player; the first rating is written to the history so its origin is on record (spec 3.2). */
export async function createPlayer(q: Queryable, name: string, rating: number, changedBy: string): Promise<PlayerRecord> {
  const clash = await q.query("select 1 from players where lower(name) = lower($1)", [name]);
  if (clash.length) throw conflict("A player with that name already exists");
  const [row] = await q.query<PlayerRecord>("insert into players (name, rating) values ($1, $2) returning *", [name, rating]);
  await insertRatingChange(q, { player_id: row.id, competition_id: null, old_rating: null, new_rating: rating, changed_by: changedBy, reason: "added" });
  return row;
}

export interface PlayerPatch {
  rating?: number;
  reason?: string;
  active?: boolean;
}

/** Rating override and activate/deactivate (spec 7.3). Deactivation is refused while they are in a live night (O-9). */
export async function updatePlayer(q: Queryable, id: string, patch: PlayerPatch, changedBy: string): Promise<PlayerRecord> {
  const player = await getPlayer(q, id);
  if (patch.rating !== undefined && patch.rating !== player.rating) {
    await insertRatingChange(q, {
      player_id: id, competition_id: null, old_rating: player.rating, new_rating: patch.rating, changed_by: changedBy, reason: patch.reason ?? null,
    });
    await q.query("update players set rating = $2, updated_at = now() where id = $1", [id, patch.rating]);
  }
  if (patch.active !== undefined && patch.active !== player.active) {
    if (!patch.active) {
      const live = await q.query(
        `select 1 from entries e join competitions c on c.id = e.competition_id
         where e.player_id = $1 and c.status in ('setup', 'in_progress')`,
        [id],
      );
      if (live.length) throw new AppError(409, "That player is in tonight's competition and cannot be deactivated until it is complete or abandoned");
    }
    await q.query("update players set active = $2, deactivated_at = case when $2 then null else now() end, updated_at = now() where id = $1", [id, patch.active]);
  }
  return getPlayer(q, id);
}

export async function ratingHistory(q: Queryable, playerId: string): Promise<RatingChangeRow[]> {
  return q.query<RatingChangeRow>(
    "select id::text as id, player_id, competition_id, old_rating, new_rating, changed_by, reason, changed_at from rating_changes where player_id = $1 order by changed_at desc, id desc",
    [playerId],
  );
}
