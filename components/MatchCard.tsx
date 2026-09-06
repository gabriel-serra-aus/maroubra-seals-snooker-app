"use client";

import Link from "next/link";
import { useState } from "react";
import type { EntryView, MatchView } from "@/lib/bracket/payload";
import { formatRemaining, matchClock } from "@/lib/timer";
import { DECISION_LABEL, STATE_LABEL, fmtRating, fmtTime } from "./client/format";

export interface MatchActions {
  onStart: (m: MatchView) => void;
  onComplete: (m: MatchView) => void;
  onCorrect: (m: MatchView) => void;
  onCancelStart: (m: MatchView) => void;
  onSetLimit: (m: MatchView) => void;
}

export function PlayerLine({ e, m, className }: { e: EntryView; m: MatchView; className?: string }) {
  const start = m.start_entry_id === e.entry_id && m.start_points > 0;
  const isLoser = m.state === "finished" && m.loser_id === e.entry_id;
  const decision = isLoser && e.source === "draw" && m.round === 1 ? e.buyback_decision : null;
  return (
    <div className={`player ${className ?? ""} ${m.winner_id === e.entry_id ? "winner" : ""} ${isLoser ? "loser" : ""}`}>
      <span>
        <span className="name">{e.name}</span> <span className="muted">({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})</span>
        {e.source === "buyback" && <> <span className="tag buyback">buy-back{e.buyback_seq ? ` #${e.buyback_seq}` : ""}</span></>}
      </span>
      <span className="muted">
        {start && <>starts on {m.start_points}</>}
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
  return (
    <div className={`match ${m.state}`} onClick={expandable ? () => setOpen((o) => !o) : undefined}>
      <div className="head">
        <span>
          {m.label} <span className={`state ${m.state}`}>{m.state === "in_play" ? "●" : m.state === "finished" ? "■" : "○"} {STATE_LABEL[m.state]}</span>
          {timedOut && <span className="timed-out"> ⚠ TIMED OUT</span>}
        </span>
        <span className="muted">
          {m.state === "in_play" && clock && (timedOut ? "00:00" : `${formatRemaining(clock.remaining_ms)} left`)}
          {m.state === "not_started" && `limit: ${m.time_limit_minutes} min`}
          {m.state === "finished" && m.corrected_at && "corrected"}
        </span>
      </div>
      <PlayerLine e={m.a} m={m} />
      <PlayerLine e={m.b} m={m} />
      {m.start_points === 0 && <div className="muted small">level, no start</div>}
      {(open || (actions && m.state === "in_play")) && m.started_at && (
        <div className="muted small">
          started {fmtTime(m.started_at)} · {m.time_limit_minutes} min limit
          {m.finished_at && <> · finished {fmtTime(m.finished_at)}</>}
        </div>
      )}
      {actions && (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          {m.state === "not_started" && (
            <>
              <button className="btn primary" onClick={() => actions.onStart(m)}>Start</button>
              <button className="btn sm" onClick={() => actions.onSetLimit(m)}>Time limit ▾</button>
            </>
          )}
          {m.state === "in_play" && (
            <>
              <button className="btn primary" onClick={() => actions.onComplete(m)}>Complete</button>
              <Link className="btn" href={`/admin/match/${m.id}`}>Timer ›</Link>
              <button className="btn sm" title="Cancel start" onClick={() => actions.onCancelStart(m)}>⤺ Cancel start</button>
            </>
          )}
          {m.state === "finished" &&
            (m.correction_blocked ? (
              <span className="muted small">{m.correction_blocked}</span>
            ) : (
              <button className="btn sm" onClick={() => actions.onCorrect(m)}>Correct result</button>
            ))}
        </div>
      )}
    </div>
  );
}
