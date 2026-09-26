import { PublicBracket } from "@/components/PublicBracket";
import { buildBracketPayload, photoUrl } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { listPlayers } from "@/lib/db/players";
import { findCurrentCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

/** Public bracket (spec 3.8). */
export default async function PublicPage() {
  const db = await getDb();
  const c = await findCurrentCompetition(db);
  const payload = buildBracketPayload(c ? await loadSnapshot(db, c) : null);
  const players = (await listPlayers(db, false)).map((p) => ({ id: p.id, name: p.name, rating: p.rating, photo: photoUrl(p) }));
  return <PublicBracket initial={payload} initialPlayers={{ players }} />;
}
