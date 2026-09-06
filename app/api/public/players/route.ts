// GET /api/public/players (spec 7.2): active players and ratings.
import { getDb } from "@/lib/db/client";
import { listPlayers } from "@/lib/db/players";
import { handle } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = await getDb();
  const players = await listPlayers(db, false);
  return Response.json(
    { players: players.map((p) => ({ id: p.id, name: p.name, rating: p.rating })) },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
});
