// POST /api/admin/matches/{id}/start { time_limit_minutes? } (rules 12, spec 7.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { competitionIdOfMatch } from "@/lib/api/routes";
import { optionalInt } from "@/lib/api/validate";
import { startMatch } from "@/lib/logic/matchControl";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const minutes = optionalInt(body, "time_limit_minutes", 1, 180);
  const competitionId = await competitionIdOfMatch(id);
  const r = await mutateCompetition(session, { competitionId }, (s, ctx) => startMatch(s, ctx, id, minutes));
  return json({ ok: true, started_at: r.result.started_at, time_limit_minutes: r.result.time_limit_minutes, bracket: r.bracket });
});
