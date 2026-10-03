import { PublicBracket } from "@/components/PublicBracket";
import { publicPage } from "@/lib/bracket/public";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Public bracket (spec 3.8): short names and no photos (O-21). */
export default async function PublicPage() {
  const { bracket, players } = await publicPage(await getDb());
  return <PublicBracket initial={bracket} initialPlayers={{ players }} />;
}
