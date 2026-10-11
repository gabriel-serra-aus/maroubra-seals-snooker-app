// PATCH /api/admin/competitions/{id}/players/{playerId} — edit a player from tonight's bracket (spec 3.4, 7.3, O-26).
// Same fields as PATCH /api/admin/players/{id}. A rating change is permanent, recorded against this night, and
// recalculates the start of every match of theirs not yet finished (spec 5.6). Replies with the fresh bracket.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalBool, optionalEmail, optionalPhone, optionalRating, optionalString } from "@/lib/api/validate";
import { photoUrl } from "@/lib/bracket/payload";
import { getPlayer, updatePlayer } from "@/lib/db/players";
import { badRequest, conflict } from "@/lib/logic/errors";
import { refreshPlayerStarts } from "@/lib/logic/matches";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id, playerId } = await params;
  const body = await readJson(request);
  const name = optionalString(body, "name", 60);
  if (name === "") throw badRequest("name is required");
  const patch = {
    expectedUpdatedAt: optionalString(body, "expected_updated_at", 40),
    name,
    rating: optionalRating(body),
    reason: optionalString(body, "reason", 200),
    active: optionalBool(body, "active"),
    phone: optionalPhone(body),
    email: optionalEmail(body),
  };
  let player: Awaited<ReturnType<typeof getPlayer>> | undefined;
  const r = await mutateCompetition(
    session,
    {
      competitionId: id,
      before: async (tx) => {
        player = await updatePlayer(tx, playerId, patch, session.name, id);
      },
    },
    (s) => {
      if (s.competition.status !== "in_progress") throw conflict("Players are edited from the bracket only while the night is in progress");
      if (!s.entries.some((e) => e.player_id === playerId)) throw badRequest("That player is not in tonight's competition");
      return refreshPlayerStarts(s, playerId);
    },
  );
  return json({ player: player && { ...player, photo: photoUrl(player) }, notes: r.result, bracket: r.bracket });
});
