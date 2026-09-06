// GET /api/admin/players?include_inactive=1 and POST /api/admin/players { name, rating } (spec 7.3).
import { getDb } from "@/lib/db/client";
import { createPlayer, listPlayers } from "@/lib/db/players";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { requiredRating, requiredString } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  requireAdmin(request);
  const db = await getDb();
  const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
  return json({ players: await listPlayers(db, includeInactive) });
});

export const POST = handle(async (request) => {
  const session = requireAdmin(request);
  const body = await readJson(request);
  const name = requiredString(body, "name", 60);
  const rating = requiredRating(body);
  const db = await getDb();
  const player = await db.transaction((tx) => createPlayer(tx, name, rating, session.name));
  return json({ player }, { status: 201 });
});
