// POST /api/admin/competitions/{id}/convert-to-16 (O-30): a 32 bracket with 16 or fewer slots used becomes a
// 16 while entries are open; lone round-one players are paired. { dry_run: true } answers "what would
// happen" for the confirmation on 3.4 without writing.
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json, readJson } from "@/lib/api/respond";
import { mutateCompetition } from "@/lib/api/mutate";
import { optionalBool } from "@/lib/api/validate";
import { convertTo16 } from "@/lib/logic/buybacks";
import { playerName } from "@/lib/logic/derive";

export const POST = handle(async (request, { params }) => {
  const session = requireAdmin(request);
  const { id } = await params;
  const dryRun = optionalBool(await readJson(request), "dry_run") ?? false;
  const r = await mutateCompetition(session, { competitionId: id, dryRun }, (s, ctx) => convertTo16(s, ctx));
  return json({
    ok: !dryRun,
    dry_run: dryRun,
    kept: r.result.kept,
    pairs: r.result.paired.map((m) => [playerName(r.after, m.player_a_id), playerName(r.after, m.player_b_id)]),
    waiting: r.result.waiting ? playerName(r.after, r.result.waiting) : null,
    open_slots: r.result.openSlots,
    bracket: r.bracket,
  });
});
