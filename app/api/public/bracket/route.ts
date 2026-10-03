// GET /api/public/bracket (spec 7.2). Read-only; CDN-cached for 5 s, which is the cost control in spec 9.
// Short names and no photos (O-21).
import { getDb } from "@/lib/db/client";
import { publicBracket } from "@/lib/bracket/public";
import { handle } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = await getDb();
  return Response.json(await publicBracket(db), {
    headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" },
  });
});
