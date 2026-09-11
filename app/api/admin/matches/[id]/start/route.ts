// POST /api/admin/matches/{id}/start { time_limit_minutes?, table? } (rules 12, spec 5.14, 7.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalInt } from "@/lib/api/validate";
import { startMatch } from "@/lib/logic/matchControl";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const minutes = optionalInt(body, "time_limit_minutes", 1, 180);
  const table = optionalInt(body, "table", 1, 16);
  const r = await mutateCompetition(session, { matchId: id }, (s, ctx) => startMatch(s, ctx, id, minutes, table));
  return json({ ok: true, started_at: r.result.started_at, time_limit_minutes: r.result.time_limit_minutes, table_number: r.result.table_number, bracket: r.bracket });
});
