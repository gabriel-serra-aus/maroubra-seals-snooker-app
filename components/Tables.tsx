"use client";

import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { formatRemaining, matchClock } from "@/lib/timer";
import { Btn } from "./Btn";

/** Every table tonight with the match on it, if any (spec 5.14). */
export function tableStates(b: BracketPayload): Array<{ n: number; match: MatchView | null }> {
  const c = b.competition;
  if (!c) return [];
  const live = b.rounds.flatMap((r) => r.matches).filter((m) => m.state === "in_play");
  return Array.from({ length: c.table_count }, (_, i) => i + 1).map((n) => ({ n, match: live.find((m) => m.table_number === n) ?? null }));
}

/** The tables along the top of the page: green when free, with the match and its clock when not. */
export function TableStrip({ b, now }: { b: BracketPayload; now: number }) {
  const tables = tableStates(b);
  if (tables.length === 0) return null;
  const free = tables.filter((t) => !t.match).length;
  return (
    <div className="table-strip" aria-label={`${free} of ${tables.length} tables free`}>
      {tables.map(({ n, match }) => {
        const clock = match ? matchClock(match.started_at, match.time_limit_minutes, now) : null;
        return (
          <div key={n} className={`table-tile ${match ? "busy" : "free"} ${clock?.timed_out ? "over" : ""}`}>
            <span className="table-n">Table {n}</span>
            {match ? (
              <>
                <span className="table-who">{match.label}</span>
                <span className="table-sub">
                  {shortName(match.a.name)} v {shortName(match.b.name)}
                </span>
                <span className="table-clock">{clock ? (clock.timed_out ? "time up" : formatRemaining(clock.remaining_ms)) : ""}</span>
              </>
            ) : (
              <span className="table-who free">Free</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
};

/**
 * "Which table?" as a match starts (spec 5.14): one large button per free table; a busy table is shown,
 * greyed, with the match on it, so it is plain why it cannot be picked. Nothing is chosen in advance.
 */
export function TablePicker({ b, m, now, onPick, onClose }: { b: BracketPayload; m: MatchView; now: number; onPick: (table: number) => void; onClose: () => void }) {
  const tables = tableStates(b);
  const free = tables.filter((t) => !t.match).length;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet result" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row between">
          <h2>Start {m.label}</h2>
        </div>
        <p className="muted">
          {m.a.name} v {m.b.name}
        </p>
        <h3>Which table?</h3>
        {free === 0 && <div className="notice">Every table is busy. Finish or move a match before starting this one.</div>}
        <div className="table-pick">
          {tables.map(({ n, match }) => {
            const clock = match ? matchClock(match.started_at, match.time_limit_minutes, now) : null;
            return (
              <button key={n} type="button" className={`table-tile pickable ${match ? "busy" : "free"}`} disabled={!!match} onClick={() => onPick(n)}>
                <span className="table-n">Table {n}</span>
                {match ? (
                  <>
                    <span className="table-who">{match.label} in play</span>
                    <span className="table-sub">{clock ? (clock.timed_out ? "time up" : `${formatRemaining(clock.remaining_ms)} left`) : ""}</span>
                  </>
                ) : (
                  <span className="table-who free">Free — start here</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="row dialog-actions">
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
