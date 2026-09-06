// DELETE /api/admin/competitions/{id}/entries/{entryId}: untick a player, setup only (spec 7.4).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { removeDrawEntry } from "@/lib/logic/competition";

export const DELETE = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id, entryId } = await params;
  const r = await mutateCompetition(session, { competitionId: id }, (s) => removeDrawEntry(s, entryId));
  return json({ ok: true, bracket: r.bracket });
});
