// POST /api/admin/competitions/{id}/override/free-pass { entry_id, from_round, dry_run? } (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { requiredInt, requiredUuid } from "@/lib/api/validate";
import { overrideGrantFreePass } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const entryId = requiredUuid(body, "entry_id");
  const fromRound = requiredInt(body, "from_round", 1, 10);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => overrideGrantFreePass(s, ctx, entryId, fromRound).id);
});
