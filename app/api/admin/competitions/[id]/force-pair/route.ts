// POST /api/admin/competitions/{id}/force-pair (rules 10, spec 5.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { forcePair } from "@/lib/logic/forcePair";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const r = await mutateCompetition(session, { competitionId: id }, (s, ctx) => forcePair(s, ctx));
  return json({ ok: true, match_number: r.result.number, bracket: r.bracket });
});
