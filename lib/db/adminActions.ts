import type { Queryable } from "./client";
import type { AdminAction } from "@/lib/logic/types";

export interface AdminActionRow {
  id: string;
  competition_id: string | null;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  created_at: Date;
}

/** One row per override or reversible action, naming the organiser (O-5, O-7, O-8). */
export async function insertAdminActions(q: Queryable, competitionId: string | null, actor: string, actions: AdminAction[]) {
  for (const a of actions) {
    await q.query("insert into admin_actions (competition_id, actor, action, details) values ($1, $2, $3, $4::jsonb)", [
      competitionId,
      actor,
      a.action,
      JSON.stringify(a.details),
    ]);
  }
}

export async function listAdminActions(q: Queryable, competitionId: string, limit = 50): Promise<AdminActionRow[]> {
  return q.query<AdminActionRow>(
    "select id::text as id, competition_id, actor, action, details, created_at from admin_actions where competition_id = $1 order by created_at desc, id desc limit $2",
    [competitionId, limit],
  );
}
