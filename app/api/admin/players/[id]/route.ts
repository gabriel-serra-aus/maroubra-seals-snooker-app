// PATCH /api/admin/players/{id} { rating?, reason?, active? } (spec 7.3). There is no DELETE (O-9).
import { getDb } from "@/lib/db/client";
import { updatePlayer } from "@/lib/db/players";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { optionalBool, optionalRating, optionalString } from "@/lib/api/validate";

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const patch = {
    rating: optionalRating(body),
    reason: optionalString(body, "reason", 200),
    active: optionalBool(body, "active"),
  };
  const db = await getDb();
  const player = await db.transaction((tx) => updatePlayer(tx, id, patch, session.name));
  return json({ player });
});
