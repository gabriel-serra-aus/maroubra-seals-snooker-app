import { SettingsForm } from "@/components/SettingsForm";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { findLiveCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Settings (spec 3.10): time limit and rating scale for the live competition. */
export default async function SettingsPage() {
  const db = await getDb();
  const live = await findLiveCompetition(db);
  const payload = live ? buildBracketPayload(await loadSnapshot(db, live)) : null;
  return <SettingsForm competition={payload} />;
}
