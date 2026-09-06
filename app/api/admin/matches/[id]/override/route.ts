// DELETE /api/admin/matches/{id}/override: delete the match, both players return to waiting (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { competitionIdOfMatch, runOverride } from "@/lib/api/routes";
import { overrideDeleteMatch } from "@/lib/logic/override";

export const DELETE = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const competitionId = await competitionIdOfMatch(id);
  return runOverride(request, session, body, { competitionId }, (s, ctx) => overrideDeleteMatch(s, ctx, id));
});
