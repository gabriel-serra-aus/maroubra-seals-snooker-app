// POST /api/admin/competitions/{id}/entries { player_id } | { new_player } (spec 7.4):
// setup → a first-draw entry; round one with buy-backs open → a late arrival as a buy-back (rules 3, 8.3).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { resolvePlayerId } from "@/lib/api/routes";
import { addLateArrival } from "@/lib/logic/buybacks";
import { addDrawEntry } from "@/lib/logic/competition";
import { conflict } from "@/lib/logic/errors";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const playerId = await resolvePlayerId(body, session);
  const r = await mutateCompetition(session, { competitionId: id, extraPlayerIds: [playerId] }, (s, ctx) => {
    if (s.competition.status === "setup") return { entry: addDrawEntry(s, ctx, playerId), match: null };
    if (s.competition.status === "in_progress") return addLateArrival(s, ctx, playerId);
    throw conflict("This competition is over");
  });
  return json({ ok: true, entry_id: r.result.entry.id, match_number: r.result.match?.number ?? null, bracket: r.bracket }, { status: 201 });
});
