// DELETE /api/admin/competitions/{id}/override/free-pass/{fpId} (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { overrideRevokeFreePass } from "@/lib/logic/override";

export const DELETE = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id, fpId } = await params;
  const body = await readJson(request);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => overrideRevokeFreePass(s, ctx, fpId));
});
