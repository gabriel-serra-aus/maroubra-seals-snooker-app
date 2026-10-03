import { PlayersAdmin } from "@/components/PlayersAdmin";
import { currentSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { listPlayers } from "@/lib/db/players";
import { photoUrl } from "@/lib/bracket/payload";

export const dynamic = "force-dynamic";

/** Players and ratings (spec 3.2). */
export default async function PlayersPage() {
  const db = await getDb();
  const session = await currentSession();
  const players = (await listPlayers(db, true)).map((p) => ({ id: p.id, name: p.name, rating: p.rating, active: p.active, photo: photoUrl(p), phone: p.phone, email: p.email, updated_at: p.updated_at.toISOString() }));
  return <PlayersAdmin initial={players} signedInAs={session?.name ?? ""} />;
}
