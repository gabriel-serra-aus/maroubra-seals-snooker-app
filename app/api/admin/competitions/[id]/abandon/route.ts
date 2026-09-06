// POST /api/admin/competitions/{id}/abandon (O-7, spec 5.11).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { abandonCompetition } from "@/lib/logic/competition";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  await mutateCompetition(session, { competitionId: id }, (s, ctx) => abandonCompetition(s, ctx));
  return json({ ok: true });
});
