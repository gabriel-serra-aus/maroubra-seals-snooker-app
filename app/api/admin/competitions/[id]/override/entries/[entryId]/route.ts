// DELETE /api/admin/competitions/{id}/override/entries/{entryId}: remove that entry's player from the night.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, readJson } from "@/lib/api/respond";
import { runOverride } from "@/lib/api/routes";
import { notFound } from "@/lib/logic/errors";
import { overrideRemovePlayer } from "@/lib/logic/override";

export const DELETE = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id, entryId } = await params;
  const body = await readJson(request);
  return runOverride(request, session, body, { competitionId: id }, (s, ctx) => {
    const entry = s.entries.find((e) => e.id === entryId);
    if (!entry) throw notFound("Entry not found");
    return overrideRemovePlayer(s, ctx, entry.player_id);
  });
});
