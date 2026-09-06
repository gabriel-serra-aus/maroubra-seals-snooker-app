// POST /api/admin/competitions/{id}/close-buybacks (rules 11, spec 5.3). Reports the free passes granted.
// { dry_run: true } answers "what would happen" for the confirmation on 3.4 without writing.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalBool } from "@/lib/api/validate";
import { closeBuybacks } from "@/lib/logic/buybacks";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const body = await readJson(request);
  const dryRun = optionalBool(body, "dry_run") ?? false;
  const r = await mutateCompetition(session, { competitionId: id, dryRun }, (s, ctx) => closeBuybacks(s, ctx));
  return json({
    ok: !dryRun,
    dry_run: dryRun,
    free_passes: r.result.freePasses.length,
    free_pass_names: r.result.freePasses.map((id) => r.after.players.find((p) => p.id === r.after.entries.find((e) => e.id === id)?.player_id)?.name ?? "?"),
    matches_created: r.result.matchesCreated.map((m) => m.number),
    completed: r.after.competition.status === "complete",
    bracket: r.bracket,
  });
});
