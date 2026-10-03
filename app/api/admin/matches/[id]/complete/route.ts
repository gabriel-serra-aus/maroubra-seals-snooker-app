// POST /api/admin/matches/{id}/complete { winner_entry_id, loser_decision?, allow_rematch? } (rules 12, spec 3.5, 7.5).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { completeResponse } from "@/lib/api/routes";
import { optionalBool, optionalEnum, requiredUuid } from "@/lib/api/validate";
import { completeMatch } from "@/lib/logic/matchControl";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const winner = requiredUuid(body, "winner_entry_id");
  const decision = optionalEnum(body, "loser_decision", ["bought_back", "declined"] as const);
  // The organiser's yes to a buy-back seat in the round-one opponent's half (O-20).
  const allowRematch = optionalBool(body, "allow_rematch") ?? false;
  const r = await mutateCompetition(session, { matchId: id }, (s, ctx) => completeMatch(s, ctx, id, winner, decision, allowRematch));
  return json({ ...completeResponse(r.result), bracket: r.bracket });
});
