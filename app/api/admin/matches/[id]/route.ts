// PATCH /api/admin/matches/{id} { time_limit_minutes } — per-match limit before start (spec 7.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalInt } from "@/lib/api/validate";
import { badRequest } from "@/lib/logic/errors";
import { setMatchTimeLimit } from "@/lib/logic/matchControl";

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  if (!("time_limit_minutes" in body)) throw badRequest("time_limit_minutes is required (a number, or null for the default)");
  const minutes = optionalInt(body, "time_limit_minutes", 1, 180) ?? null;
  const r = await mutateCompetition(session, { matchId: id }, (s) => setMatchTimeLimit(s, id, minutes));
  return json({ ok: true, bracket: r.bracket });
});
