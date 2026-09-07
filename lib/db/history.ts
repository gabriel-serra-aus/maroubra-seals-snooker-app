// Past nights and how the handicaps moved (spec 3.11): read-only queries for the History screen.

import type { Queryable } from "./client";
import type { BracketSize, CompetitionStatus } from "@/lib/logic/types";

export interface NightSummary {
  id: string;
  name: string;
  status: CompetitionStatus;
  bracket_size: BracketSize;
  created_at: Date;
  completed_at: Date | null;
  abandoned_at: Date | null;
  /** Distinct players who took part (a buy-back is the same player twice). */
  players: number;
  winner_name: string | null;
  /** The player beaten in the final, or null when the title came by free pass or the night was abandoned. */
  runner_up_name: string | null;
}

export interface NightRatingChange {
  competition_id: string;
  player_id: string;
  name: string;
  old_rating: number | null;
  new_rating: number;
  changed_by: string;
  changed_at: Date;
}

export interface NightPlayer {
  competition_id: string;
  player_id: string;
  name: string;
  rating: number;
}

export interface CompetitionHistory {
  /** Complete and abandoned nights, newest first. The live night, if any, is not history yet. */
  nights: NightSummary[];
  /** Every rating change written against one of those nights (the rating review, rules 13). */
  changes: NightRatingChange[];
  /** Who took part in each night, with their rating as it stands now. */
  played: NightPlayer[];
}

const PAST = "select id from competitions where status in ('complete', 'abandoned') order by created_at desc limit $1";

export async function competitionHistory(q: Queryable, limit = 52): Promise<CompetitionHistory> {
  const nights = await q.query<NightSummary>(
    `select c.id, c.name, c.status, c.bracket_size, c.created_at, c.completed_at, c.abandoned_at,
       (select count(distinct e.player_id)::int from entries e where e.competition_id = c.id) as players,
       wp.name as winner_name,
       (select lp.name from matches m
          join entries le on le.id = case when m.winner_id = m.player_a_id then m.player_b_id else m.player_a_id end
          join players lp on lp.id = le.player_id
        where m.competition_id = c.id and m.state = 'finished' and m.winner_id = c.winner_entry_id
        order by m.round desc limit 1) as runner_up_name
     from competitions c
     left join entries we on we.id = c.winner_entry_id
     left join players wp on wp.id = we.player_id
     where c.id in (${PAST})
     order by c.created_at desc`,
    [limit],
  );
  const changes = await q.query<NightRatingChange>(
    `select r.competition_id, r.player_id, p.name, r.old_rating, r.new_rating, r.changed_by, r.changed_at
     from rating_changes r join players p on p.id = r.player_id
     where r.competition_id in (${PAST})
     order by r.changed_at, r.id`,
    [limit],
  );
  const played = await q.query<NightPlayer>(
    `select distinct e.competition_id, e.player_id, p.name, p.rating
     from entries e join players p on p.id = e.player_id
     where e.competition_id in (${PAST})
     order by p.name`,
    [limit],
  );
  return { nights, changes, played };
}
