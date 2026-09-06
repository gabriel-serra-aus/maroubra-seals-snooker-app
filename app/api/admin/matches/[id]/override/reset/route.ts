// POST /api/admin/matches/{id}/override/reset: any state → not_started, unwinding the next round (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { overrideResetMatch } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  return runOverride(request, session, body, { matchId: id }, (s, ctx) => overrideResetMatch(s, ctx, id).number);
});
