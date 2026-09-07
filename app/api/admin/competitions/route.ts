// GET /api/admin/competitions (recent nights) and POST /api/admin/competitions (spec 7.4).
import { getDb } from "@/lib/db/client";
import { createCompetition, listCompetitions, previousRatingSettings } from "@/lib/db/competitions";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { defaultCompetitionName } from "@/lib/api/routes";
import { optionalInt, optionalString } from "@/lib/api/validate";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  requireAdmin(request);
  const db = await getDb();
  return json({ competitions: await listCompetitions(db) });
});

export const POST = handle(async (request) => {
  requireAdmin(request);
  const body = await readJson(request);
  const db = await getDb();
  const prev = await previousRatingSettings(db);
  const size = optionalInt(body, "bracket_size", 16, 32) ?? 16;
  if (size !== 16 && size !== 32) return json({ error: "bracket_size must be 16 or 32" }, { status: 400 });
  // The reply carries the (empty) bracket so the setup screen can show it without a second request.
  const { competition, bracket } = await db.transaction(async (tx) => {
    const competition = await createCompetition(tx, {
      name: optionalString(body, "name", 80) || defaultCompetitionName(),
      bracket_size: size,
      default_time_limit_minutes: optionalInt(body, "default_time_limit_minutes", 1, 180) ?? 25,
      rating: {
        rating_top_count: optionalInt(body, "rating_top_count", 0, 64) ?? prev.rating_top_count,
        rating_top_delta: optionalInt(body, "rating_top_delta", -50, 50) ?? prev.rating_top_delta,
        rating_bottom_count: optionalInt(body, "rating_bottom_count", 0, 64) ?? prev.rating_bottom_count,
        rating_bottom_delta: optionalInt(body, "rating_bottom_delta", -50, 50) ?? prev.rating_bottom_delta,
      },
    });
    return { competition, bracket: buildBracketPayload(await loadSnapshot(tx, competition)) };
  });
  return json({ competition, bracket }, { status: 201 });
});
