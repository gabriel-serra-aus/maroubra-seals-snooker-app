// GET /api/admin/competitions/{id} (bracket payload) and PATCH settings (spec 7.4).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition, readSnapshot } from "@/lib/api/mutate";
import { optionalInt, optionalString } from "@/lib/api/validate";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { RATING_SETTING_KEYS } from "@/lib/db/competitions";
import { conflict, notFound } from "@/lib/logic/errors";
import { setTableCount } from "@/lib/logic/tables";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const s = await readSnapshot(id);
  if (!s) throw notFound("Competition not found");
  return json(buildBracketPayload(s));
});

export const PATCH = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const name = optionalString(body, "name", 80);
  const size = optionalInt(body, "bracket_size", 16, 32);
  if (size !== undefined && size !== 16 && size !== 32) return json({ error: "bracket_size must be 16 or 32" }, { status: 400 });
  const limit = optionalInt(body, "default_time_limit_minutes", 1, 180);
  const tables = optionalInt(body, "table_count", 1, 16);
  // The O-24 changes (spec 3.10); the O-1 group numbers are no longer set.
  const rating = Object.fromEntries(RATING_SETTING_KEYS.map((k) => [k, optionalInt(body, k, -50, 50)]));
  const r = await mutateCompetition(session, { competitionId: id }, (s) => {
    const c = s.competition;
    if (c.status === "complete" || c.status === "abandoned") throw conflict("This competition is over");
    if (name) c.name = name;
    if (limit !== undefined) c.default_time_limit_minutes = limit;
    if (tables !== undefined) setTableCount(s, tables);
    const settingsChanged = size !== undefined || Object.values(rating).some((v) => v !== undefined);
    if (settingsChanged && c.status !== "setup") throw conflict("The bracket size and rating scale can only be changed before Start");
    if (size !== undefined) {
      if (s.entries.length > size) throw conflict(`${s.entries.length} players are entered — they do not fit a ${size} bracket`);
      c.bracket_size = size;
    }
    for (const k of RATING_SETTING_KEYS) if (rating[k] !== undefined) c[k] = rating[k];
  });
  return json({ ok: true, bracket: r.bracket });
});
