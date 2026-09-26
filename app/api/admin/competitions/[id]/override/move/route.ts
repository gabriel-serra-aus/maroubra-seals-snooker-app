// POST /api/admin/competitions/{id}/override/move { entry_id, slot, dry_run? } (spec 7.6, O-17).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { requiredInt, requiredUuid } from "@/lib/api/validate";
import { overrideMovePlayer } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const entryId = requiredUuid(body, "entry_id");
  const slot = requiredInt(body, "slot", 1, 32);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => overrideMovePlayer(s, ctx, entryId, slot));
});
