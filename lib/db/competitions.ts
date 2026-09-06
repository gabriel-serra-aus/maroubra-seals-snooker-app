// Creating a night and editing its settings (spec 7.4). Match and bracket writes go through apply.ts.

import type { Queryable } from "./client";
import { conflict } from "@/lib/logic/errors";
import type { BracketSize, CompetitionRow } from "@/lib/logic/types";

export interface RatingSettings {
  rating_top_count: number;
  rating_top_delta: number;
  rating_bottom_count: number;
  rating_bottom_delta: number;
}

export const DEFAULT_RATING_SETTINGS: RatingSettings = {
  rating_top_count: 3,
  rating_top_delta: -1,
  rating_bottom_count: 3,
  rating_bottom_delta: 2,
};

/** The four O-1 numbers carry over from the previous competition (spec 3.3). */
export async function previousRatingSettings(q: Queryable): Promise<RatingSettings> {
  const rows = await q.query<RatingSettings>(
    "select rating_top_count, rating_top_delta, rating_bottom_count, rating_bottom_delta from competitions order by created_at desc limit 1",
    [],
  );
  return rows[0] ?? DEFAULT_RATING_SETTINGS;
}

export interface NewCompetition {
  name: string;
  bracket_size: BracketSize;
  default_time_limit_minutes: number;
  rating: RatingSettings;
}

export async function createCompetition(q: Queryable, c: NewCompetition): Promise<CompetitionRow> {
  const live = await q.query("select 1 from competitions where status in ('setup', 'in_progress')", []);
  if (live.length) throw conflict("A competition is already set up or in progress — complete or abandon it first");
  const [row] = await q.query<CompetitionRow>(
    `insert into competitions (name, bracket_size, default_time_limit_minutes,
       rating_top_count, rating_top_delta, rating_bottom_count, rating_bottom_delta)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [
      c.name, c.bracket_size, c.default_time_limit_minutes,
      c.rating.rating_top_count, c.rating.rating_top_delta, c.rating.rating_bottom_count, c.rating.rating_bottom_delta,
    ],
  );
  return row;
}

export async function listCompetitions(q: Queryable, limit = 20): Promise<CompetitionRow[]> {
  return q.query<CompetitionRow>("select * from competitions order by created_at desc limit $1", [limit]);
}
