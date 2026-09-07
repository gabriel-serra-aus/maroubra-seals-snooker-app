// POST /api/admin/competitions/{id}/entries (spec 7.4):
//   { player_id } | { new_player }  — setup → a first-draw entry; round one with buy-backs open → a late
//                                     arrival: a `late` entry that may still buy back once (rules 3, 8.3).
//   { player_ids: [...] }           — setup only: several first-draw entries in one request (spec 3.3).
// DELETE /api/admin/competitions/{id}/entries { entry_ids: [...] } — setup only: untick several at once.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { resolvePlayerId } from "@/lib/api/routes";
import { isUuid } from "@/lib/api/validate";
import { addLateArrival } from "@/lib/logic/buybacks";
import { addDrawEntry, removeDrawEntry } from "@/lib/logic/competition";
import { badRequest, conflict } from "@/lib/logic/errors";

/** `key: [uuid, ...]`, at most `max` distinct ids. */
function idList(body: Record<string, unknown>, key: string, max = 64): string[] {
  const v = body[key];
  if (!Array.isArray(v) || v.length === 0 || !v.every(isUuid)) throw badRequest(`${key} must be a list of ids`);
  const ids = Array.from(new Set(v as string[]));
  if (ids.length > max) throw badRequest(`${key} must have at most ${max} ids`);
  return ids;
}

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  if (Array.isArray(body.player_ids)) {
    const playerIds = idList(body, "player_ids");
    const r = await mutateCompetition(session, { competitionId: id, extraPlayerIds: playerIds }, (s, ctx) => {
      if (s.competition.status !== "setup") throw conflict("Several players at once can only be entered before the competition starts");
      return playerIds.map((p) => addDrawEntry(s, ctx, p).id);
    });
    return json({ ok: true, entry_ids: r.result, bracket: r.bracket }, { status: 201 });
  }
  const playerId = await resolvePlayerId(body, session);
  const r = await mutateCompetition(session, { competitionId: id, extraPlayerIds: [playerId] }, (s, ctx) => {
    if (s.competition.status === "setup") return { entry: addDrawEntry(s, ctx, playerId), match: null };
    if (s.competition.status === "in_progress") return addLateArrival(s, ctx, playerId);
    throw conflict("This competition is over");
  });
  const slot = r.result.entry.slot;
  return json(
    {
      ok: true,
      entry_id: r.result.entry.id,
      match_number: r.result.match?.number ?? null,
      // Placed but alone: the match position they wait in (spec 5.2).
      awaiting_in: r.result.match || slot === null ? null : Math.ceil(slot / 2),
      bracket: r.bracket,
    },
    { status: 201 },
  );
});

export const DELETE = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const entryIds = idList(await readJson(request), "entry_ids");
  const r = await mutateCompetition(session, { competitionId: id }, (s) => {
    for (const e of entryIds) removeDrawEntry(s, e);
  });
  return json({ ok: true, bracket: r.bracket });
});
