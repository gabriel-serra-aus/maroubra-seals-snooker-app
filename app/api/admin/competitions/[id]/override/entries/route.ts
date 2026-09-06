// POST /api/admin/competitions/{id}/override/entries { player_id | new_player, dry_run? } (spec 7.6).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { resolvePlayerId, runOverride } from "@/lib/api/routes";
import { overrideAddPlayer } from "@/lib/logic/override";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const playerId = await resolvePlayerId(body, session);
  return runOverride(request, session, body, { competitionId: id, extraPlayerIds: [playerId] }, (s, ctx) => overrideAddPlayer(s, ctx, playerId).id);
});
