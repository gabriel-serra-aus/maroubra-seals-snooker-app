"use client";

import type { BracketPayload, EntryView, RoundView } from "@/lib/bracket/payload";
import { fmtRating } from "./client/format";
import { MatchCard, type MatchActions } from "./MatchCard";

export function EntryName({ e }: { e: EntryView }) {
  return (
    <span>
      {e.name} <span className="muted">({fmtRating(e.rating)})</span>{" "}
      {e.source === "buyback" ? <span className="tag buyback">buy-back{e.buyback_seq ? ` #${e.buyback_seq}` : ""}</span> : <span className="tag draw">first draw</span>}
    </span>
  );
}

function RoundBody({ r, b, now, actions, expandable }: { r: RoundView; b: BracketPayload; now: number; actions?: MatchActions; expandable?: boolean }) {
  const c = b.competition!;
  const inProgress = c.status === "in_progress";
  return (
    <div>
      {r.free_passes.length > 0 && (
        <div className="info">
          Free pass{r.free_passes.length > 1 ? "es" : ""} to round {r.round + 1}: {r.free_passes.map((fp) => fp.entry.name).join(", ")}
        </div>
      )}
      {r.matches.length === 0 && r.awaiting.length === 0 && (
        <p className="muted">{r.round === 1 ? "No matches yet." : inProgress ? "Waiting for the previous round to finish." : ""}</p>
      )}
      {r.matches.map((m) => (
        <MatchCard key={m.id} m={m} now={now} actions={actions} expandable={expandable} />
      ))}
      {r.awaiting.map((a) => (
        <div key={a.slot} className="match awaiting">
          <div className="head">
            <span>M{a.number} <span className="state">○ AWAITING OPPONENT</span></span>
            <span className="muted">slot {a.slot}</span>
          </div>
          <div className="player">
            <EntryName e={a.entry} />
          </div>
        </div>
      ))}
      {inProgress && r.round === 1 && (
        <div className="card">
          <div className="row between">
            <strong>Waiting players ({r.waiting.length})</strong>
            <span className="muted">Open slots: {c.open_slots} of {c.bracket_size}</span>
          </div>
          {r.waiting.length === 0 ? (
            <p className="muted">Nobody waiting.</p>
          ) : (
            <ul className="plain">
              {r.waiting.map((w) => (
                <li key={w.entry_id}>
                  <EntryName e={w} />
                  <span className="muted small">{w.slot ? `slot ${w.slot}` : "not placed yet"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {inProgress && r.round > 1 && r.waiting.length > 0 && (
        <div className="card">
          <strong>Waiting in round {r.round}</strong>
          <ul className="plain">
            {r.waiting.map((w) => (
              <li key={w.entry_id}>
                <EntryName e={w} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Every round: the latest expanded, earlier ones collapsed (spec 3.4, 3.8). */
export function BracketView({ b, now, actions, expandable }: { b: BracketPayload; now: number; actions?: MatchActions; expandable?: boolean }) {
  if (!b.competition) return null;
  const last = b.rounds[b.rounds.length - 1]?.round ?? 1;
  return (
    <div>
      {b.rounds
        .slice()
        .reverse()
        .map((r) =>
          r.round === last ? (
            <section key={r.round}>
              <h2>Round {r.round}</h2>
              <RoundBody r={r} b={b} now={now} actions={actions} expandable={expandable} />
            </section>
          ) : (
            <details key={r.round} className="round">
              <summary>Round {r.round} · {r.matches.length} match{r.matches.length === 1 ? "" : "es"}</summary>
              <RoundBody r={r} b={b} now={now} actions={actions} expandable={expandable} />
            </details>
          ),
        )}
    </div>
  );
}
