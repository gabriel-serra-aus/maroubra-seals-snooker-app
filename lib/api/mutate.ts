// The one write pattern (spec 7): lock the competition row, load a snapshot, run pure logic on a clone,
// persist the diff plus audit rows, return the fresh bracket. Dry runs skip the persisting.

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { applySnapshotDiff } from "@/lib/db/apply";
import { insertAdminActions } from "@/lib/db/adminActions";
import { findLiveCompetition, loadSnapshot, lockCompetition } from "@/lib/db/snapshot";
import { buildBracketPayload, type BracketPayload } from "@/lib/bracket/payload";
import type { Session } from "@/lib/auth/session";
import { describeChanges } from "@/lib/logic/describe";
import { AppError, notFound } from "@/lib/logic/errors";
import { secureRng } from "@/lib/logic/random";
import { cloneSnapshot, type AdminAction, type Ctx, type Snapshot } from "@/lib/logic/types";

export interface MutateOptions {
  /** Competition id, or omit for the live (setup / in_progress) one. */
  competitionId?: string;
  /** Players to load into the snapshot beyond those already entered (for adding someone). */
  extraPlayerIds?: string[];
  dryRun?: boolean;
}

export interface MutateResult<T> {
  result: T;
  before: Snapshot;
  after: Snapshot;
  bracket: BracketPayload;
  changes: string[];
  log: AdminAction[];
}

export function makeCtx(actor: string): Ctx {
  return { now: new Date(), rng: secureRng(), actor, newId: randomUUID, log: [] };
}

export async function mutateCompetition<T>(
  session: Session,
  opts: MutateOptions,
  fn: (s: Snapshot, ctx: Ctx) => T,
): Promise<MutateResult<T>> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const live = opts.competitionId ? { id: opts.competitionId } : await findLiveCompetition(tx);
    if (!live) throw notFound("No competition is set up");
    const competition = await lockCompetition(tx, live.id);
    if (!competition) throw notFound("Competition not found");
    const before = await loadSnapshot(tx, competition, opts.extraPlayerIds ?? []);
    const after = cloneSnapshot(before);
    const ctx = makeCtx(session.name);
    const result = fn(after, ctx);
    const changes = describeChanges(before, after);
    if (!opts.dryRun) {
      await applySnapshotDiff(tx, before, after);
      await insertAdminActions(tx, competition.id, session.name, ctx.log);
    }
    return { result, before, after, bracket: buildBracketPayload(after, ctx.now), changes, log: ctx.log };
  });
}

/** Read-only snapshot of a competition (by id or the live one), or null. */
export async function readSnapshot(competitionId?: string): Promise<Snapshot | null> {
  const db = await getDb();
  const rows = competitionId
    ? await db.query<Snapshot["competition"]>("select * from competitions where id = $1", [competitionId])
    : [await findLiveCompetition(db)].filter((x) => x !== null);
  const c = rows[0];
  if (!c) return null;
  return loadSnapshot(db, c);
}

export function assertStatus(s: Snapshot, ...allowed: Snapshot["competition"]["status"][]) {
  if (!allowed.includes(s.competition.status)) throw new AppError(409, `Not allowed while the competition is ${s.competition.status.replace("_", " ")}`);
}
