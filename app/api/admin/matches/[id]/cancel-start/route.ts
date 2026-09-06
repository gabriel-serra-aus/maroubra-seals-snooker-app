// POST /api/admin/matches/{id}/cancel-start (O-5, spec 5.8).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { competitionIdOfMatch } from "@/lib/api/routes";
import { cancelStart } from "@/lib/logic/matchControl";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const competitionId = await competitionIdOfMatch(id);
  const r = await mutateCompetition(session, { competitionId }, (s, ctx) => cancelStart(s, ctx, id));
  return json({ ok: true, bracket: r.bracket });
});
