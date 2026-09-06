// POST /api/admin/competitions/{id}/override/pair { entry_id_a, entry_id_b, dry_run? } (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { requiredUuid } from "@/lib/api/validate";
import { overridePair } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const a = requiredUuid(body, "entry_id_a");
  const b = requiredUuid(body, "entry_id_b");
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => overridePair(s, ctx, a, b).number);
});
