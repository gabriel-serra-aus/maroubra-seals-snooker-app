// Persists what the pure logic did: diff a before/after Snapshot and write the inserts, updates and
// deletes in a foreign-key-safe order. Nothing else in the app writes to entries, matches or free_passes.
// Rows of one kind go in one statement (inserts, deletes) or one batch of statements (updates) so a
// Complete costs a handful of round trips to the database, not a dozen.

import type { Queryable } from "./client";
import type { CompetitionRow, EntryRow, FreePassRow, MatchRow, Snapshot } from "@/lib/logic/types";

const ENTRY_COLS: (keyof EntryRow)[] = [
  "competition_id", "player_id", "source", "slot", "buyback_seq", "rebuy_of_entry_id",
  "buyback_decision", "rating_at_entry", "joined_round", "entered_at",
];
const MATCH_COLS: (keyof MatchRow)[] = [
  "competition_id", "round", "number", "player_a_id", "player_b_id", "rating_a", "rating_b", "start_points",
  "start_entry_id", "state", "origin", "time_limit_minutes", "started_at", "finished_at", "winner_id",
  "corrected_at", "created_at",
];
const FREE_PASS_COLS: (keyof FreePassRow)[] = ["competition_id", "entry_id", "from_round", "granted_at"];
const COMPETITION_COLS: (keyof CompetitionRow)[] = [
  "name", "status", "bracket_size", "default_time_limit_minutes", "rating_top_count",
  "rating_top_delta", "rating_bottom_count", "rating_bottom_delta", "started_at", "buybacks_closed_at",
  "completed_at", "abandoned_at", "winner_entry_id",
];

type Row = { id: string };

function key(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x instanceof Date ? x.toISOString() : x));
}

function diff<T extends Row>(before: T[], after: T[], cols: (keyof T)[]) {
  const b = new Map(before.map((r) => [r.id, r]));
  const a = new Map(after.map((r) => [r.id, r]));
  const inserts = after.filter((r) => !b.has(r.id));
  const deletes = before.filter((r) => !a.has(r.id));
  const updates = after.filter((r) => {
    const old = b.get(r.id);
    return old && cols.some((c) => key(old[c]) !== key(r[c]));
  });
  return { inserts, updates, deletes };
}

/** One multi-row insert per table. */
async function insertRows<T extends Row>(q: Queryable, table: string, rows: T[], cols: (keyof T)[]) {
  if (rows.length === 0) return;
  const names = ["id", ...cols.map(String)];
  const params: unknown[] = [];
  const tuples = rows.map((r) => {
    const values = [r.id, ...cols.map((c) => r[c])];
    const placeholders = values.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  await q.query(`insert into ${table} (${names.join(", ")}) values ${tuples.join(", ")}`, params);
}

/** Updates are sent together; the driver pipelines them on the one connection. */
async function updateRows<T extends Row>(q: Queryable, table: string, rows: T[], cols: (keyof T)[]) {
  await Promise.all(
    rows.map((r) => {
      const sets = cols.map((c, i) => `${String(c)} = $${i + 2}`);
      return q.query(`update ${table} set ${sets.join(", ")} where id = $1`, [r.id, ...cols.map((c) => r[c])]);
    }),
  );
}

async function deleteRows<T extends Row>(q: Queryable, table: string, rows: T[]) {
  if (rows.length === 0) return;
  await q.query(`delete from ${table} where id = any($1::uuid[])`, [rows.map((r) => r.id)]);
}

export async function applySnapshotDiff(q: Queryable, before: Snapshot, after: Snapshot): Promise<void> {
  const entries = diff(before.entries, after.entries, ENTRY_COLS);
  const matches = diff(before.matches, after.matches, MATCH_COLS);
  const passes = diff(before.freePasses, after.freePasses, FREE_PASS_COLS);
  const compChanged = COMPETITION_COLS.some((c) => key(before.competition[c]) !== key(after.competition[c]));

  // 1. A winner about to be deleted must be unlinked first.
  if (before.competition.winner_entry_id && before.competition.winner_entry_id !== after.competition.winner_entry_id) {
    await q.query("update competitions set winner_entry_id = null where id = $1", [before.competition.id]);
  }
  // 2. Deletes: matches and passes reference entries; a buy-back entry references its draw entry.
  await deleteRows(q, "matches", matches.deletes);
  await deleteRows(q, "free_passes", passes.deletes);
  // Updates that clear links must land before the referenced rows go.
  await updateRows(q, "entries", entries.updates, ENTRY_COLS);
  await deleteRows(q, "entries", entries.deletes.filter((e) => e.rebuy_of_entry_id));
  await deleteRows(q, "entries", entries.deletes.filter((e) => !e.rebuy_of_entry_id));
  // 3. Inserts: draw-source entries before the buy-backs that reference them.
  await insertRows(q, "entries", entries.inserts.filter((e) => !e.rebuy_of_entry_id), ENTRY_COLS);
  await insertRows(q, "entries", entries.inserts.filter((e) => e.rebuy_of_entry_id), ENTRY_COLS);
  await insertRows(q, "matches", matches.inserts, MATCH_COLS);
  await updateRows(q, "matches", matches.updates, MATCH_COLS);
  await insertRows(q, "free_passes", passes.inserts, FREE_PASS_COLS);
  // 4. The competition row last, so winner_entry_id can point at a new entry.
  if (compChanged) await updateRows(q, "competitions", [after.competition], COMPETITION_COLS);
}
