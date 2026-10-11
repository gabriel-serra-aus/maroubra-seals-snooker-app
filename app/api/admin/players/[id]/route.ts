// GET and PATCH /api/admin/players/{id} { expected_updated_at?, name?, rating?, reason?, active?, phone?, email? } (spec 7.3, 7.8). There is no DELETE (O-9).
import { getDb } from "@/lib/db/client";
import { getPlayer, updatePlayer } from "@/lib/db/players";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { optionalBool, optionalEmail, optionalPhone, optionalRating, optionalString } from "@/lib/api/validate";
import { badRequest } from "@/lib/logic/errors";
import { photoUrl } from "@/lib/bracket/payload";

export const dynamic = "force-dynamic";

/** One player, for the edit sheet opened from tonight's bracket (spec 3.4, O-26). */
export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const player = await getPlayer(await getDb(), id);
  return json({ player: { ...player, photo: photoUrl(player) } });
});

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
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
  const db = await getDb();
  const player = await db.transaction((tx) => updatePlayer(tx, id, patch, session.name));
  return json({ player: { ...player, photo: photoUrl(player) } });
});
