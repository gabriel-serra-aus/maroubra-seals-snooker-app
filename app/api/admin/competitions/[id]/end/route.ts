// POST /api/admin/competitions/{id}/end (spec 5.11): "End night here" — the night is out of time, so it
// is closed where it stands: complete, kept, no winner. `{ dry_run: true }` returns what the tap costs
// without writing, for the confirmation the organiser sees.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalBool } from "@/lib/api/validate";
import { endCompetitionEarly } from "@/lib/logic/competition";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const dryRun = optionalBool(await readJson(request), "dry_run") ?? false;
  const r = await mutateCompetition(session, { competitionId: id, dryRun }, (s, ctx) => endCompetitionEarly(s, ctx));
  return json({
    ok: !dryRun,
    dry_run: dryRun,
    unplayed: r.result.unplayed,
    clocks_cancelled: r.result.cancelled,
    still_in: r.result.standing,
    bracket: dryRun ? undefined : r.bracket,
  });
});
