// POST /api/admin/matches/{id}/override/replace-player { slot: "a" | "b", entry_id } (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { competitionIdOfMatch, runOverride } from "@/lib/api/routes";
import { requiredEnum, requiredUuid } from "@/lib/api/validate";
import { overrideReplacePlayer } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const side = requiredEnum(body, "slot", ["a", "b"] as const);
  const entryId = requiredUuid(body, "entry_id");
  const competitionId = await competitionIdOfMatch(id);
  return runOverride(request, session, body, { competitionId }, (s, ctx) => overrideReplacePlayer(s, ctx, id, side, entryId).number);
});
