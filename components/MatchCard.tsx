"use client";

import { useState } from "react";
import type { EntryView, MatchView } from "@/lib/bracket/payload";
import { formatRemaining, matchClock } from "@/lib/timer";
import { Btn, Spinner } from "./Btn";
import { DECISION_LABEL, STATE_LABEL, fmtRating, fmtTime } from "./client/format";

export interface MatchActions {
  onStart: (m: MatchView) => void;
  onComplete: (m: MatchView) => void;
  onCorrect: (m: MatchView) => void;
  onCancelStart: (m: MatchView) => void;
  onSetLimit: (m: MatchView) => void;
  /** Note or move the table a match is on (spec 5.14). */
  onSetTable: (m: MatchView) => void;
  /**
   * True while an action on this match, or one that touches the whole night, is in flight: this card's
   * buttons wait. Every other card stays live, so the organiser can move on to the next table (spec 3.4).
   */
  locked: (m: MatchView) => boolean;
  /** True while this action on this match is in flight: its button shows a spinner. */
  pending: (action: string, m: MatchView) => boolean;
}

/** The pending key for one action on one match (see useAction). */
export const actionKey = (action: string, m: MatchView) => `${action}:${m.id}`;
/** The match id inside a pending key, or null for a night-wide action. */
export const matchOfKey = (key: string) => (key.includes(":") ? key.slice(key.indexOf(":") + 1) : null);

/** The player's source as a small tag; first-draw entries need none. */
export function SourceTag({ e }: { e: EntryView }) {
  if (e.source === "buyback") return <span className="tag buyback">buy-back{e.buyback_seq ? ` #${e.buyback_seq}` : ""}</span>;
  if (e.source === "late") return <span className="tag late">late arrival</span>;
  return null;
}

/** "Table 2" on a card (spec 5.14); for the organiser it is the tap that moves the match. */
export function TableChip({ m, actions, disabled }: { m: MatchView; actions?: MatchActions; disabled?: boolean }) {
  const label = m.table_number ? `Table ${m.table_number}` : m.state === "in_play" ? "No table" : null;
  if (!actions || m.state === "finished") return label ? <span className={`chip table ${m.table_number ? "" : "none"}`}>{label}</span> : null;
  return (
    <button
      type="button"
      className={`chip table tappable ${m.table_number ? "" : "none"}`}
      disabled={disabled}
      title={m.state === "in_play" ? "Move this match to another table" : "Note which table this match will be on"}
      onClick={(e) => {
        e.stopPropagation();
        actions.onSetTable(m);
      }}
    >
      {actions.pending("table", m) && <Spinner />}
      {label ?? "Table?"} ▾
    </button>
  );
}

/** The state chip on a card: felt green when live, amber when ready, neutral once finished (spec 4.1). */
export function StateChip({ m, timedOut }: { m: MatchView; timedOut?: boolean }) {
  return (
    <span className={`chip ${m.state}`}>
      {m.state === "in_play" ? <span className="dot" /> : null}
      {STATE_LABEL[m.state]}
      {timedOut && " · TIMED OUT"}
    </span>
  );
}

export function PlayerLine({ e, m, className }: { e: EntryView; m: MatchView; className?: string }) {
  const start = m.start_entry_id === e.entry_id && m.start_points > 0;
  const isLoser = m.state === "finished" && m.loser_id === e.entry_id;
  const decision = isLoser && e.source !== "buyback" && m.round === 1 ? e.buyback_decision : null;
  return (
    <div className={`player ${className ?? ""} ${m.winner_id === e.entry_id ? "winner" : ""} ${isLoser ? "loser" : ""}`}>
      <span>
        <span className="name">{e.name}</span> <span className="muted">({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})</span> <SourceTag e={e} />
      </span>
      <span className="muted facts">
        {/* The handicap start sits on the weaker player's own line, so the number is read with the name (rules §6, spec 5.6). */}
        {start && <span className="start-pts">starts on {m.start_points}</span>}
        {decision && <span>→ {DECISION_LABEL[decision]}</span>}
        {isLoser && !decision && m.round === 1 && e.source === "buyback" && <span>out</span>}
      </span>
    </div>
  );
}

/** One short line of working under the names: who starts on what, and the difference it came from (spec 5.6). */
export function StartNote({ m }: { m: MatchView }) {
  if (m.start_points <= 0) return <div className="muted small">Level, no start</div>;
  const receiver = m.start_entry_id === m.a.entry_id ? m.a : m.b;
  return (
    <div className="muted small">
      {receiver.name} starts on {m.start_points} <span className="dim">(⅔ of {Math.abs(m.rating_a - m.rating_b)})</span>
    </div>
  );
}

export function MatchCard({ m, now, actions, expandable }: { m: MatchView; now: number; actions?: MatchActions; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const clock = m.state === "in_play" ? matchClock(m.started_at, m.time_limit_minutes, now) : null;
  const timedOut = clock?.timed_out ?? false;
  const disabled = actions?.locked(m) ?? false;
  const pending = (action: string) => actions?.pending(action, m) ?? false;
  return (
    <div className={`match ${m.state} ${timedOut ? "timed-out" : ""}`} onClick={expandable ? () => setOpen((o) => !o) : undefined}>
      <div className="head">
        <span className="head-left">
          <span className="mid">{m.label}</span>
          <StateChip m={m} timedOut={timedOut} />
          <TableChip m={m} actions={actions} disabled={disabled} />
        </span>
        <span className="head-right">
          {m.state === "in_play" && clock && <span className={`clock ${timedOut ? "over" : ""}`}>{timedOut ? "00:00" : formatRemaining(clock.remaining_ms)}</span>}
          {m.state === "not_started" &&
            (actions ? (
              // The per-match limit is rarely changed (rules 12), so it hides behind the note itself.
              <button
                type="button"
                className="linkish"
                disabled={disabled}
                title="Change the time limit for this match"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onSetLimit(m);
                }}
              >
                {pending("limit") && <Spinner />}
                {m.time_limit_minutes} min ▾
              </button>
            ) : (
              <span className="muted small">{m.time_limit_minutes} min</span>
            ))}
          {m.state === "finished" && m.corrected_at && <span className="muted small">corrected</span>}
        </span>
      </div>
      <PlayerLine e={m.a} m={m} />
      <PlayerLine e={m.b} m={m} />
      <StartNote m={m} />
      {(open || (actions && m.state === "in_play")) && m.started_at && (
        <div className="muted small">
          started {fmtTime(m.started_at)} · {m.time_limit_minutes} min limit
          {m.finished_at && <> · finished {fmtTime(m.finished_at)}</>}
        </div>
      )}
      {actions && (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          {/* Start and Complete are the taps of the night, so each takes the full width of the card. */}
          {m.state === "not_started" && (
            <Btn className="primary wide" disabled={disabled} pending={pending("start")} onClick={() => actions.onStart(m)}>
              Start match
            </Btn>
          )}
          {m.state === "in_play" && (
            <>
              <Btn className="primary wide" disabled={disabled} pending={pending("complete")} onClick={() => actions.onComplete(m)}>
                Record result
              </Btn>
              <Btn className="sm" disabled={disabled} pending={pending("cancel")} title="Cancel start" onClick={() => actions.onCancelStart(m)}>
                ⤺ Cancel start
              </Btn>
            </>
          )}
          {m.state === "finished" &&
            (m.correction_blocked ? (
              <span className="muted small">{m.correction_blocked}</span>
            ) : (
              <Btn className="sm" disabled={disabled} pending={pending("correct")} onClick={() => actions.onCorrect(m)}>
                Review result
              </Btn>
            ))}
        </div>
      )}
    </div>
  );
}
