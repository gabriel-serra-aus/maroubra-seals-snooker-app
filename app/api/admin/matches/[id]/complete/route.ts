// POST /api/admin/matches/{id}/complete { winner_entry_id, loser_decision? } (rules 12, spec 3.5, 7.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { completeResponse } from "@/lib/api/routes";
import { optionalEnum, requiredUuid } from "@/lib/api/validate";
import { completeMatch } from "@/lib/logic/matchControl";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const winner = requiredUuid(body, "winner_entry_id");
  const decision = optionalEnum(body, "loser_decision", ["bought_back", "declined"] as const);
  const r = await mutateCompetition(session, { matchId: id }, (s, ctx) => completeMatch(s, ctx, id, winner, decision));
  return json({ ...completeResponse(r.result), bracket: r.bracket });
});
