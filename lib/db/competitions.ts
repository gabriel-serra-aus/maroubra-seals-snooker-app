// Creating a night and editing its settings (spec 7.4). Match and bracket writes go through apply.ts.

import type { Queryable } from "./client";
import { conflict } from "@/lib/logic/errors";
import type { BracketSize, CompetitionRow } from "@/lib/logic/types";

/** The four O-24 changes by finishing position (spec 5.9). The O-1 group numbers are no longer set on a new night. */
export interface RatingSettings {
  rating_final_delta: number;
  rating_semi_delta: number;
  rating_buyback_lost_delta: number;
  rating_other_delta: number;
}

export const RATING_SETTING_KEYS = ["rating_final_delta", "rating_semi_delta", "rating_buyback_lost_delta", "rating_other_delta"] as const;

export const DEFAULT_RATING_SETTINGS: RatingSettings = {
  rating_final_delta: -3,
  rating_semi_delta: -2,
  rating_buyback_lost_delta: 2,
  rating_other_delta: 1,
};

/** The club's tables (spec 5.14): four unless a night says otherwise. */
export const DEFAULT_TABLE_COUNT = 4;

/** The four O-24 numbers and the table count carry over from the previous competition (spec 3.3). */
export async function previousRatingSettings(q: Queryable): Promise<RatingSettings & { table_count: number }> {
  const rows = await q.query<RatingSettings & { table_count: number }>(
    `select ${RATING_SETTING_KEYS.join(", ")}, table_count from competitions order by created_at desc limit 1`,
    [],
  );
  return rows[0] ?? { ...DEFAULT_RATING_SETTINGS, table_count: DEFAULT_TABLE_COUNT };
}

export interface NewCompetition {
  name: string;
  bracket_size: BracketSize;
  default_time_limit_minutes: number;
  table_count: number;
  rating: RatingSettings;
}

export async function createCompetition(q: Queryable, c: NewCompetition): Promise<CompetitionRow> {
  const live = await q.query("select 1 from competitions where status in ('setup', 'in_progress')", []);
  if (live.length) throw conflict("A competition is already set up or in progress — complete or abandon it first");
  const [row] = await q.query<CompetitionRow>(
    `insert into competitions (name, bracket_size, default_time_limit_minutes, table_count, rating_scheme,
       ${RATING_SETTING_KEYS.join(", ")})
     values ($1, $2, $3, $4, 'finish', $5, $6, $7, $8) returning *`,
    [
      c.name, c.bracket_size, c.default_time_limit_minutes, c.table_count,
      ...RATING_SETTING_KEYS.map((k) => c.rating[k]),
    ],
  );
  return row;
}

export async function listCompetitions(q: Queryable, limit = 20): Promise<CompetitionRow[]> {
  return q.query<CompetitionRow>("select * from competitions order by created_at desc limit $1", [limit]);
}
