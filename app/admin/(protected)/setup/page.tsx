import { redirect } from "next/navigation";
import { SetupForm } from "@/components/SetupForm";
import { defaultCompetitionName } from "@/lib/api/routes";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { previousRatingSettings } from "@/lib/db/competitions";
import { listPlayers } from "@/lib/db/players";
import { findLiveCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Competition setup and draw (spec 3.3). Not reachable while a night is in progress. */
export default async function SetupPage() {
  const db = await getDb();
  const live = await findLiveCompetition(db);
  if (live?.status === "in_progress") redirect("/admin");
  const payload = live ? buildBracketPayload(await loadSnapshot(db, live)) : null;
  const players = (await listPlayers(db, false)).map((p) => ({ id: p.id, name: p.name, rating: p.rating, active: p.active }));
  const prev = await previousRatingSettings(db);
  return <SetupForm competition={payload} players={players} defaults={{ name: defaultCompetitionName(), ...prev }} />;
}
