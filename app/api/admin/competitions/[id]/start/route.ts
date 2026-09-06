// POST /api/admin/competitions/{id}/start — Start Competition (rules 8.2, spec 5.1).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { startCompetition } from "@/lib/logic/competition";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const r = await mutateCompetition(session, { competitionId: id }, (s, ctx) => startCompetition(s, ctx));
  return json({ ok: true, bracket: r.bracket });
});
