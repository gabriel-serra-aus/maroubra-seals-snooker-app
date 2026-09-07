"use client";

import type { BracketPayload, EntryView, RoundView } from "@/lib/bracket/payload";
import { feederLabel } from "@/lib/logic/derive";
import { fmtRating } from "./client/format";
import { MatchCard, type MatchActions } from "./MatchCard";

export function EntryName({ e }: { e: EntryView }) {
  return (
    <span>
      {e.name} <span className="muted">({fmtRating(e.rating)})</span>{" "}
      {e.source === "buyback" ? <span className="tag buyback">buy-back{e.buyback_seq ? ` #${e.buyback_seq}` : ""}</span> : e.source === "late" ? <span className="tag late">late arrival</span> : <span className="tag draw">first draw</span>}
    </span>
  );
}

function RoundBody({ r, b, now, actions, expandable }: { r: RoundView; b: BracketPayload; now: number; actions?: MatchActions; expandable?: boolean }) {
  const c = b.competition!;
  const inProgress = c.status === "in_progress";
  const isFinal = r.round === c.rounds_total;
  const unplaced = r.round === 1 ? r.waiting.filter((w) => w.slot === null) : [];
  return (
    <div>
      {r.free_passes.length > 0 && (
        <div className="info">
          Free pass{r.free_passes.length > 1 ? "es" : ""} to {isFinal ? "the title" : `round ${r.round + 1}`}: {r.free_passes.map((fp) => fp.entry.name).join(", ")}
        </div>
      )}
      {r.matches.length === 0 && r.awaiting.length === 0 && (
        <p className="muted">{r.round === 1 ? "No matches yet." : inProgress ? "Waiting for the previous round." : ""}</p>
      )}
      {(r.matches.length > 0 || r.awaiting.length > 0) && (
        // Cards flow into columns on a wide screen and stack on a phone.
        <div className="match-grid">
          {r.matches.map((m) => (
            <MatchCard key={m.id} m={m} now={now} actions={actions} expandable={expandable} />
          ))}
          {r.awaiting.map((a) => (
            <div key={a.entry.entry_id} className="match awaiting">
              <div className="head">
                <span>
                  {a.label} <span className="state">○ AWAITING OPPONENT</span>
                </span>
                {r.round === 1 && <span className="muted">slot {a.slot}</span>}
              </div>
              <div className="player">
                <EntryName e={a.entry} />
              </div>
              {/* The second seat of the card: who fills it depends on the round (spec 5.2, 5.4). */}
              <div className="player muted">{r.round === 1 ? "open seat — next buy-back or late arrival" : `winner of ${feederLabel(c.bracket_size, a.slot, r.round)}`}</div>
            </div>
          ))}
        </div>
      )}
      {inProgress && r.round === 1 && (
        <div className="card">
          <div className="row between">
            <strong>Open slots: {c.open_slots} of {c.bracket_size}</strong>
            {r.awaiting.length > 0 && <span className="muted">{r.awaiting.length} awaiting an opponent</span>}
          </div>
          {unplaced.length > 0 && (
            <ul className="plain">
              {unplaced.map((w) => (
                <li key={w.entry_id}>
                  <EntryName e={w} />
                  <span className="muted small">not placed yet</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Every round, newest first: rounds still in play expanded, finished ones collapsed (spec 3.4, 3.8). */
export function BracketView({ b, now, actions, expandable }: { b: BracketPayload; now: number; actions?: MatchActions; expandable?: boolean }) {
  const c = b.competition;
  if (!c) return null;
  const title = (r: RoundView) => (r.round === c.rounds_total ? "Final" : `Round ${r.round}`);
  const live = (r: RoundView) => r.matches.some((m) => m.state !== "finished") || r.awaiting.length > 0 || r.round >= c.current_round;
  return (
    <div>
      {b.rounds
        .slice()
        .reverse()
        .map((r) =>
          live(r) ? (
            <section key={r.round}>
              <h2>{title(r)}</h2>
              <RoundBody r={r} b={b} now={now} actions={actions} expandable={expandable} />
            </section>
          ) : (
            <details key={r.round} className="round">
              <summary>
                {title(r)} · {r.matches.length} match{r.matches.length === 1 ? "" : "es"}
              </summary>
              <RoundBody r={r} b={b} now={now} actions={actions} expandable={expandable} />
            </details>
          ),
        )}
    </div>
  );
}
