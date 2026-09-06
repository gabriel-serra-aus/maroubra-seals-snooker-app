// POST /api/admin/competitions/{id}/override/reopen-buybacks (O-5, spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { overrideReopenBuybacks } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => overrideReopenBuybacks(s, ctx));
});
