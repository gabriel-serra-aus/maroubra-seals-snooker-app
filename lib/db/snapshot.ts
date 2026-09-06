// Loading one competition into a Snapshot for the pure logic, and finding which competition is current.

import type { Queryable } from "./client";
import type { CompetitionRow, EntryRow, FreePassRow, MatchRow, PlayerRow, Snapshot } from "@/lib/logic/types";

export async function findLiveCompetition(q: Queryable): Promise<CompetitionRow | null> {
  const rows = await q.query<CompetitionRow>(
    "select * from competitions where status in ('setup', 'in_progress') order by created_at desc limit 1",
    [],
  );
  return rows[0] ?? null;
}

/** The competition the public page shows: the current one, else the most recent that was not abandoned. */
export async function findCurrentCompetition(q: Queryable): Promise<CompetitionRow | null> {
  const live = await findLiveCompetition(q);
  if (live) return live;
  const rows = await q.query<CompetitionRow>(
    "select * from competitions where status <> 'abandoned' order by created_at desc limit 1",
    [],
  );
  return rows[0] ?? null;
}

export async function getCompetition(q: Queryable, id: string): Promise<CompetitionRow | null> {
  const rows = await q.query<CompetitionRow>("select * from competitions where id = $1", [id]);
  return rows[0] ?? null;
}

/** Row lock: serialises every write to one competition (spec 7). */
export async function lockCompetition(q: Queryable, id: string): Promise<CompetitionRow | null> {
  const rows = await q.query<CompetitionRow>("select * from competitions where id = $1 for update", [id]);
  return rows[0] ?? null;
}

/** The same lock reached through a match id, in one query (the match routes). */
export async function lockCompetitionOfMatch(q: Queryable, matchId: string): Promise<CompetitionRow | null> {
  const rows = await q.query<CompetitionRow>(
    "select c.* from competitions c join matches m on m.competition_id = c.id where m.id = $1 for update of c",
    [matchId],
  );
  return rows[0] ?? null;
}

export async function loadSnapshot(q: Queryable, competition: CompetitionRow, extraPlayerIds: string[] = []): Promise<Snapshot> {
  const id = competition.id;
  // Four independent reads, sent together: one round trip's worth of waiting instead of two.
  const [entries, matches, freePasses, players] = await Promise.all([
    q.query<EntryRow>("select * from entries where competition_id = $1 order by entered_at, id", [id]),
    q.query<MatchRow>("select * from matches where competition_id = $1 order by round, number", [id]),
    q.query<FreePassRow>("select * from free_passes where competition_id = $1 order by from_round, granted_at", [id]),
    q.query<PlayerRow>(
      `select id, name, rating, active from players
       where id in (select player_id from entries where competition_id = $1) or id = any($2::uuid[])
       order by name`,
      [id, extraPlayerIds],
    ),
  ]);
  return { competition, players, entries, matches, freePasses };
}
