import { OverridePanel } from "@/components/OverridePanel";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { listAdminActions } from "@/lib/db/adminActions";
import { getDb } from "@/lib/db/client";
import { findLiveCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Master override (spec 3.9). */
export default async function OverridePage() {
  const db = await getDb();
  const live = await findLiveCompetition(db);
  const payload = buildBracketPayload(live ? await loadSnapshot(db, live) : null);
  const actions = live ? await listAdminActions(db, live.id) : [];
  return (
    <OverridePanel
      initial={payload}
      initialActions={actions.map((a) => ({ ...a, created_at: new Date(a.created_at).toISOString() }))}
    />
  );
}
