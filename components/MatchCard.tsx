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
  /** Every button is disabled while any action is in flight; the one that was tapped shows a spinner. */
  busy: boolean;
  /** `${action}:${match id}` of the request in flight, or null. */
  pending: string | null;
}

/** The pending key for one action on one match (see MatchActions.pending). */
export const actionKey = (action: string, m: MatchView) => `${action}:${m.id}`;

export function PlayerLine({ e, m, className }: { e: EntryView; m: MatchView; className?: string }) {
  const start = m.start_entry_id === e.entry_id && m.start_points > 0;
  const isLoser = m.state === "finished" && m.loser_id === e.entry_id;
  const decision = isLoser && e.source !== "buyback" && m.round === 1 ? e.buyback_decision : null;
  return (
    <div className={`player ${className ?? ""} ${m.winner_id === e.entry_id ? "winner" : ""} ${isLoser ? "loser" : ""}`}>
      <span>
        <span className="name">{e.name}</span> <span className="muted">({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})</span>
        {e.source === "buyback" && <> <span className="tag buyback">buy-back{e.buyback_seq ? ` #${e.buyback_seq}` : ""}</span></>}
        {e.source === "late" && <> <span className="tag late">late arrival</span></>}
      </span>
      <span className="muted">
        {/* The handicap start sits on the weaker player's own line, so the number is read with the name (rules §6, spec 5.6). */}
        {start && <span className="start-pts">starts on {m.start_points}</span>}
        {decision && <>→ {DECISION_LABEL[decision]}</>}
        {isLoser && !decision && m.round === 1 && e.source === "buyback" && <>out</>}
      </span>
    </div>
  );
}

export function MatchCard({ m, now, actions, expandable }: { m: MatchView; now: number; actions?: MatchActions; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const clock = m.state === "in_play" ? matchClock(m.started_at, m.time_limit_minutes, now) : null;
  const timedOut = clock?.timed_out ?? false;
  const disabled = actions?.busy ?? false;
  const pending = (action: string) => actions?.pending === actionKey(action, m);
  return (
    <div className={`match ${m.state}`} onClick={expandable ? () => setOpen((o) => !o) : undefined}>
      <div className="head">
        <span>
          {m.label} <span className={`state ${m.state}`}>{m.state === "in_play" ? "●" : m.state === "finished" ? "■" : "○"} {STATE_LABEL[m.state]}</span>
          {timedOut && <span className="timed-out"> ⚠ TIMED OUT</span>}
        </span>
        <span className="muted">
          {m.state === "in_play" && clock && (timedOut ? "00:00" : `${formatRemaining(clock.remaining_ms)} left`)}
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
                {pending("limit") && <Spinner />}limit: {m.time_limit_minutes} min ▾
              </button>
            ) : (
              `limit: ${m.time_limit_minutes} min`
            ))}
          {m.state === "finished" && m.corrected_at && "corrected"}
        </span>
      </div>
      <PlayerLine e={m.a} m={m} />
      <PlayerLine e={m.b} m={m} />
      {/* Where the start came from, in numbers: two thirds of the rating difference, rounded (rules §6, spec 5.6). */}
      {m.start_points > 0 ? (
        <div className="muted small">
          {(m.start_entry_id === m.a.entry_id ? m.a : m.b).name} starts on {m.start_points} — two thirds of the {Math.abs(m.rating_a - m.rating_b)} difference
        </div>
      ) : (
        <div className="muted small">level, no start</div>
      )}
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
              Start
            </Btn>
          )}
          {m.state === "in_play" && (
            <>
              <Btn className="primary wide" disabled={disabled} onClick={() => actions.onComplete(m)}>
                Complete
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
              <Btn className="sm" disabled={disabled} onClick={() => actions.onCorrect(m)}>
                Review result
              </Btn>
            ))}
        </div>
      )}
    </div>
  );
}
