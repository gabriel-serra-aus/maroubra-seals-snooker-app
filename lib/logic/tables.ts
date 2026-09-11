// Tables (spec 5.14): the club has a few snooker tables, numbered; a match in play occupies one. The
// organiser picks a free table as a match starts, can move a match, and Cancel start gives the table back.

import { badRequest, conflict } from "./errors";
import { matchLabel } from "./derive";
import type { MatchRow, Snapshot } from "./types";

/** Tables no match in play is using, lowest first. */
export function freeTables(s: Snapshot, except?: MatchRow): number[] {
  const used = new Set(s.matches.filter((m) => m.state === "in_play" && m !== except && m.table_number !== null).map((m) => m.table_number!));
  return Array.from({ length: s.competition.table_count }, (_, i) => i + 1).filter((t) => !used.has(t));
}

/** The match in play on a table, if any. */
export function matchOnTable(s: Snapshot, table: number, except?: MatchRow): MatchRow | undefined {
  return s.matches.find((m) => m.state === "in_play" && m !== except && m.table_number === table);
}

function checkRange(s: Snapshot, table: number): void {
  if (!Number.isInteger(table) || table < 1 || table > s.competition.table_count) {
    throw badRequest(`Table must be 1 to ${s.competition.table_count}`);
  }
}

function checkFree(s: Snapshot, table: number, m: MatchRow): void {
  const busy = matchOnTable(s, table, m);
  if (busy) throw conflict(`Table ${table} is in use by ${matchLabel(s, busy)}`);
}

/**
 * The table a match starts on: the one chosen (`requested`), which must be in range and free, else the
 * one noted on the match beforehand if still free. Nothing is picked for the organiser: with neither the
 * start is refused, and with every table busy it is refused too — a match never shares a table.
 */
export function tableForStart(s: Snapshot, m: MatchRow, requested?: number): number {
  if (requested !== undefined) {
    checkRange(s, requested);
    checkFree(s, requested, m);
    return requested;
  }
  if (m.table_number !== null && freeTables(s, m).includes(m.table_number)) return m.table_number;
  const free = freeTables(s, m);
  if (free.length === 0) throw conflict(`Every table is busy — finish or move a match before starting ${matchLabel(s, m)}`);
  throw badRequest(`Choose a free table for ${matchLabel(s, m)}: ${free.join(", ")}`);
}

/**
 * Set or clear a match's table. Before start it is a note of where the match will go and any table in
 * range is fine; in play the table must be free (or the match's own). A finished match keeps its record.
 */
export function setMatchTable(s: Snapshot, m: MatchRow, table: number | null): MatchRow {
  if (m.state === "finished") throw conflict("A finished match keeps the table it was played on");
  if (table !== null) {
    checkRange(s, table);
    if (m.state === "in_play") checkFree(s, table, m);
  }
  m.table_number = table;
  return m;
}

/** Fewer tables than are in play right now is refused: a match cannot be on table 5 of 4. */
export function setTableCount(s: Snapshot, count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 16) throw badRequest("Tables must be 1 to 16");
  const over = s.matches.find((m) => m.state === "in_play" && m.table_number !== null && m.table_number > count);
  if (over) throw conflict(`${matchLabel(s, over)} is in play on table ${over.table_number}`);
  s.competition.table_count = count;
}
