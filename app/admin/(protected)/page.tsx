import { redirect } from "next/navigation";
import { AdminBracket } from "@/components/AdminBracket";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { findCurrentCompetition, findLiveCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Admin bracket and match control (spec 3.4). */
export default async function AdminPage() {
  const db = await getDb();
  const live = await findLiveCompetition(db);
  if (live?.status === "setup") redirect("/admin/setup");
  const c = live ?? (await findCurrentCompetition(db));
  if (!c || c.status === "abandoned") redirect("/admin/setup");
  const payload = buildBracketPayload(await loadSnapshot(db, c));
  return <AdminBracket initial={payload} />;
}
