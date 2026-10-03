// What the public site reads (spec 3.8, 7.2, O-21): the bracket and the active club list with short names
// ("Gabriel S.") and no photos. The public page and both public routes use this, so no public path can
// carry a full name or a photo URL.
import type { Queryable } from "@/lib/db/client";
import { listPlayers } from "@/lib/db/players";
import { findCurrentCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { publicNames } from "@/lib/names";
import { buildBracketPayload, type BracketPayload } from "./payload";

export interface PublicPlayer {
  id: string;
  name: string;
  rating: number;
  photo: null;
}

/**
 * Names are worked out over the active club list plus tonight's players, so the same person reads the same
 * on the bracket and the Players tab, and a name doesn't change when someone joins mid-night.
 */
async function load(q: Queryable, withBracket: boolean) {
  const active = await listPlayers(q, false);
  const c = withBracket ? await findCurrentCompetition(q) : null;
  const snapshot = c ? await loadSnapshot(q, c) : null;
  const everyone = new Map(active.map((p) => [p.id, p.name]));
  for (const p of snapshot?.players ?? []) everyone.set(p.id, p.name);
  const { names } = publicNames([...everyone].map(([id, name]) => ({ id, name })));
  const players: PublicPlayer[] = active
    .map((p) => ({ id: p.id, name: names.get(p.id)!, rating: p.rating, photo: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { bracket: withBracket ? buildBracketPayload(snapshot, new Date(), names) : null, players };
}

export async function publicBracket(q: Queryable): Promise<BracketPayload> {
  return (await load(q, true)).bracket!;
}

export async function publicPlayers(q: Queryable): Promise<PublicPlayer[]> {
  return (await load(q, false)).players;
}

export async function publicPage(q: Queryable): Promise<{ bracket: BracketPayload; players: PublicPlayer[] }> {
  const { bracket, players } = await load(q, true);
  return { bracket: bracket!, players };
}
