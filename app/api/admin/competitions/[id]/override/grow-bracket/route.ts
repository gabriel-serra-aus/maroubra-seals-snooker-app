// POST /api/admin/competitions/{id}/override/grow-bracket: 16 → 32 (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { growBracket } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => growBracket(s, ctx));
});
