// GET /api/public/players (spec 7.2): active players and ratings, short names and no photos (O-21).
import { getDb } from "@/lib/db/client";
import { publicPlayers } from "@/lib/bracket/public";
import { handle } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = await getDb();
  return Response.json(
    { players: await publicPlayers(db) },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
});
