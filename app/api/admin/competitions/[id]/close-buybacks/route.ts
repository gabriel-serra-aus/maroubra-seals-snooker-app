// POST /api/admin/competitions/{id}/close-buybacks (rules 11, spec 5.3). Reports the free passes granted.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { maybeDrawNextRound } from "@/lib/logic/rounds";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const r = await mutateCompetition(session, { competitionId: id }, (s, ctx) => {
    const close = closeBuybacks(s, ctx);
    const draw = maybeDrawNextRound(s, ctx);
    return { close, draw };
  });
  return json({
    ok: true,
    free_passes: r.result.close.freePasses.length,
    matches_created: r.result.close.matchesCreated.map((m) => m.number),
    round_drawn: r.result.draw?.round ?? null,
    bracket: r.bracket,
  });
});
