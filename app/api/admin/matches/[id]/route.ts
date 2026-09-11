// PATCH /api/admin/matches/{id} { time_limit_minutes } and/or { table_number } (spec 5.14, 7.5): the per-match
// limit before start, and the table before or during play. Either may be null to clear.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalInt } from "@/lib/api/validate";
import { badRequest } from "@/lib/logic/errors";
import { getMatch, setMatchTimeLimit } from "@/lib/logic/matchControl";
import { setMatchTable } from "@/lib/logic/tables";

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const hasLimit = "time_limit_minutes" in body;
  const hasTable = "table_number" in body;
  if (!hasLimit && !hasTable) throw badRequest("time_limit_minutes or table_number is required (a number, or null to clear)");
  const minutes = optionalInt(body, "time_limit_minutes", 1, 180) ?? null;
  const table = optionalInt(body, "table_number", 1, 16) ?? null;
  const r = await mutateCompetition(session, { matchId: id }, (s) => {
    if (hasLimit) setMatchTimeLimit(s, id, minutes);
    if (hasTable) setMatchTable(s, getMatch(s, id), table);
  });
  return json({ ok: true, bracket: r.bracket });
});
