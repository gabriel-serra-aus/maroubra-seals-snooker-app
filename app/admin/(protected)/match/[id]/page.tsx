import { TimerView } from "@/components/TimerView";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { findCurrentCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Match timer view (spec 3.6). */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await findCurrentCompetition(db);
  const payload = buildBracketPayload(c ? await loadSnapshot(db, c) : null);
  return <TimerView matchId={id} initial={payload} />;
}
