"use client";

import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { formatRemaining, matchClock } from "@/lib/timer";
import { Btn } from "./Btn";

type TableState = { n: number; match: MatchView | null };

/** Every table tonight with the match on it, if any (spec 5.14). */
export function tableStates(b: BracketPayload): TableState[] {
  const c = b.competition;
  if (!c) return [];
  const live = b.rounds.flatMap((r) => r.matches).filter((m) => m.state === "in_play");
  return Array.from({ length: c.table_count }, (_, i) => i + 1).map((n) => ({ n, match: live.find((m) => m.table_number === n) ?? null }));
}

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
};

/**
 * One table card, the same everywhere it appears (strip, Start, Move): "Table 1 - FREE", or
 * "Table 1 - R2M1", the players, and the time left.
 */
function TableFace({ n, match, now }: { n: number; match: MatchView | null; now: number }) {
  const clock = match ? matchClock(match.started_at, match.time_limit_minutes, now) : null;
  return (
    <>
      <span className="table-n">
        Table {n} - {match ? match.label : "FREE"}
      </span>
      {match && (
        <>
          <span className="table-sub">
            {shortName(match.a.name)} v {shortName(match.b.name)}
          </span>
          <span className="table-clock">{clock ? (clock.timed_out ? "time up" : `${formatRemaining(clock.remaining_ms)} left`) : ""}</span>
        </>
      )}
    </>
  );
}

const tileClass = (match: MatchView | null, now: number) => {
  const clock = match ? matchClock(match.started_at, match.time_limit_minutes, now) : null;
  return `table-tile ${match ? "busy" : "free"} ${clock?.timed_out ? "over" : ""}`;
};

/** The tables along the top of the page: green when free, the match and its clock when not. */
export function TableStrip({ b, now }: { b: BracketPayload; now: number }) {
  const tables = tableStates(b);
  if (tables.length === 0) return null;
  const free = tables.filter((t) => !t.match).length;
  return (
    <div className="table-strip" aria-label={`${free} of ${tables.length} tables free`}>
      {tables.map(({ n, match }) => (
        <div key={n} className={tileClass(match, now)}>
          <TableFace n={n} match={match} now={now} />
        </div>
      ))}
    </div>
  );
}

/**
 * "Which table?" (spec 5.14), as a match starts or moves: the same cards as the strip, one button per
 * table, the free ones tappable. A busy table stays visible, greyed, so it is plain why it cannot be
 * picked. In "move" the table the match is already on is marked, and "No table" takes it off the strip.
 */
export function TablePicker({
  b,
  m,
  now,
  mode,
  onPick,
  onClear,
  onClose,
}: {
  b: BracketPayload;
  m: MatchView;
  now: number;
  mode: "start" | "move";
  onPick: (table: number) => void;
  /** "move" only: take the match off its table (or clear a note on a match not yet started). */
  onClear?: () => void;
  onClose: () => void;
}) {
  const tables = tableStates(b);
  const free = tables.filter((t) => !t.match).length;
  const title = mode === "start" ? `Start ${m.label}` : m.state === "in_play" ? `Move ${m.label}` : `Table for ${m.label}`;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet result" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row between">
          <h2>{title}</h2>
        </div>
        <p className="muted">
          {m.a.name} v {m.b.name}
        </p>
        <h3>Which table?</h3>
        {free === 0 && mode === "start" && <div className="notice">Every table is busy. Finish or move a match before starting this one.</div>}
        <div className="table-pick">
          {tables.map(({ n, match }) => {
            const here = match?.id === m.id;
            return (
              <button key={n} type="button" className={`${tileClass(match, now)} pickable ${here ? "here" : ""}`} disabled={!!match} onClick={() => onPick(n)}>
                <TableFace n={n} match={match} now={now} />
                {here && <span className="table-sub">this match</span>}
              </button>
            );
          })}
        </div>
        <div className="row dialog-actions">
          {mode === "move" && onClear && m.table_number && (
            <Btn onClick={onClear}>No table</Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
