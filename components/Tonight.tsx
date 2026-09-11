"use client";

import type { BracketPayload, EntryView, MatchView } from "@/lib/bracket/payload";
import { feederLabel } from "@/lib/logic/derive";
import { formatRemaining, matchClock } from "@/lib/timer";
import { SourceTag, StateChip, TableChip } from "./MatchCard";
import { fmtRating, roundName } from "./client/format";

/**
 * "Tonight" (spec 3.8): live play first. What is on the tables now, with the clock large enough to read
 * from the bar, then who is up next, then the results so far. The full draw is a tab away.
 */

const norm = (s: string) => s.trim().toLowerCase();
/** True when the query matches either name; an empty query matches everything. */
export const matchInvolves = (m: MatchView, q: string) => q === "" || norm(m.a.name).includes(q) || norm(m.b.name).includes(q);

function Names({ m, big }: { m: MatchView; big?: boolean }) {
  const line = (e: EntryView, rating: number) => (
    <span className={`vs-name ${m.winner_id === e.entry_id ? "winner" : ""} ${m.state === "finished" && m.loser_id === e.entry_id ? "loser" : ""}`}>
      {m.winner_id === e.entry_id && <span className="tick">✔ </span>}
      {e.name} <span className="muted">({fmtRating(rating)})</span> <SourceTag e={e} />
    </span>
  );
  return (
    <div className={`vs ${big ? "big" : ""}`}>
      {line(m.a, m.rating_a)}
      <span className="vs-mark">vs</span>
      {line(m.b, m.rating_b)}
    </div>
  );
}

function StartLine({ m }: { m: MatchView }) {
  if (m.start_points <= 0) return <div className="muted small center">Level, no start</div>;
  const receiver = m.start_entry_id === m.a.entry_id ? m.a : m.b;
  return (
    <div className="muted small center">
      {receiver.name} starts on {m.start_points}
    </div>
  );
}

/** A match in play: the clock is the headline (spec 5.12). */
export function LiveCard({ m, now }: { m: MatchView; now: number }) {
  const clock = matchClock(m.started_at, m.time_limit_minutes, now);
  const over = clock?.timed_out ?? false;
  return (
    <div className={`live-card ${over ? "timed-out" : ""}`}>
      <div className="row between">
        <StateChip m={m} timedOut={over} />
        <span className="muted small">{m.label}</span>
      </div>
      {m.table_number && <div className="table-big">Table {m.table_number}</div>}
      <div className={`big-clock ${over ? "over" : ""}`}>{over ? "00:00" : clock ? formatRemaining(clock.remaining_ms) : "--:--"}</div>
      <Names m={m} big />
      <StartLine m={m} />
    </div>
  );
}

/** A match with both players that has not started. */
export function NextCard({ m }: { m: MatchView }) {
  return (
    <div className="next-card">
      <div className="row between">
        <span className="row">
          <StateChip m={m} />
          <TableChip m={m} />
        </span>
        <span className="muted small">{m.label}</span>
      </div>
      <Names m={m} />
      <StartLine m={m} />
    </div>
  );
}

/** A finished match, one line. */
export function ResultRow({ m }: { m: MatchView }) {
  const w = m.winner_id === m.a.entry_id ? m.a : m.b;
  const l = m.winner_id === m.a.entry_id ? m.b : m.a;
  const decision = m.round === 1 && l.source !== "buyback" ? l.buyback_decision : null;
  return (
    <li className="result-row">
      <span className="muted small mid">{m.label}</span>
      <span>
        <strong>{w.name}</strong> <span className="muted">beat</span> {l.name}
        {decision === "bought_back" && <span className="tag buyback">bought back</span>}
        {m.corrected_at && <span className="tag">corrected</span>}
      </span>
    </li>
  );
}

/** One line saying where an entry stands, for Find my match (spec 3.8). */
export function whereIs(b: BracketPayload, e: EntryView, now: number): string {
  const c = b.competition!;
  const p = e.position;
  if (p.status === "winner") return "Winner of the night";
  if (p.status === "out") return `Out — lost in ${roundName(p.round, c.rounds_total).toLowerCase()}`;
  if (p.status === "in_match") {
    const m = b.rounds.flatMap((r) => r.matches).find((x) => x.id === p.matchId);
    if (!m) return "";
    const other = m.a.entry_id === e.entry_id ? m.b : m.a;
    const table = m.table_number ? ` on table ${m.table_number}` : "";
    if (m.state === "in_play") {
      const clock = matchClock(m.started_at, m.time_limit_minutes, now);
      return `Playing now${table} in ${m.label} against ${other.name} · ${clock?.timed_out ? "time is up" : `${formatRemaining(clock?.remaining_ms ?? 0)} left`}`;
    }
    return `Up next in ${m.label} against ${other.name}${table}`;
  }
  // Waiting: a free pass carried them here, or they sit alone in a box.
  const pass = b.rounds.find((r) => r.round === p.round - 1)?.free_passes.some((fp) => fp.entry.entry_id === e.entry_id);
  const box = b.rounds.find((r) => r.round === p.round)?.awaiting.find((a) => a.entry.entry_id === e.entry_id);
  if (box) {
    return p.round === 1 ? `Waiting in ${box.label} for the next buy-back or late arrival` : `${pass ? "Free pass — " : ""}waiting in ${box.label} for the winner of ${feederLabel(c.bracket_size, box.slot, p.round)}`;
  }
  if (pass) return `Free pass to ${roundName(p.round, c.rounds_total).toLowerCase()}`;
  return e.slot === null ? "Not placed yet" : `Waiting in ${roundName(p.round, c.rounds_total).toLowerCase()}`;
}

/** Find my match: a name box and, once typed, where each matching entry stands (spec 3.8). */
export function PlayerFinder({ b, now, query, setQuery, placeholder }: { b: BracketPayload; now: number; query: string; setQuery: (q: string) => void; placeholder?: string }) {
  const q = norm(query);
  const hits = q === "" ? [] : b.entries.filter((e) => norm(e.name).includes(q));
  return (
    <div className="finder">
      <input type="search" value={query} placeholder={placeholder ?? "Find my match — type a name"} aria-label="Find a player" onChange={(e) => setQuery(e.target.value)} />
      {q !== "" && (
        <ul className="plain finder-hits">
          {hits.length === 0 && <li className="muted">No player called “{query}” tonight.</li>}
          {hits.map((e) => (
            <li key={e.entry_id}>
              <span>
                <strong>{e.name}</strong> <SourceTag e={e} />
              </span>
              <span className="muted small">{whereIs(b, e, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The live-play view. `query` narrows every section to matches involving that name. */
export function TonightView({ b, now, query }: { b: BracketPayload; now: number; query: string }) {
  const c = b.competition!;
  const q = norm(query);
  const all = b.rounds.flatMap((r) => r.matches).filter((m) => matchInvolves(m, q));
  const live = all.filter((m) => m.state === "in_play");
  // Earlier rounds first, then by number: the order the tables are called.
  const next = all.filter((m) => m.state === "not_started").sort((x, y) => x.round - y.round || x.number - y.number);
  const done = all.filter((m) => m.state === "finished").sort((x, y) => (y.finished_at ?? "").localeCompare(x.finished_at ?? ""));
  const waiting = b.rounds.flatMap((r) => r.awaiting.filter((a) => q === "" || norm(a.entry.name).includes(q)).map((a) => ({ ...a, round: r.round })));
  const passes = b.rounds.flatMap((r) => r.free_passes.filter((fp) => q === "" || norm(fp.entry.name).includes(q)).map((fp) => ({ ...fp, round: r.round })));
  const nothing = live.length + next.length + done.length + waiting.length + passes.length === 0;
  return (
    <div className="tonight">
      {c.status === "complete" && (
        <div className="info">
          {c.winner ? <strong>Winner: {c.winner.name}</strong> : <strong>Night ended early — no winner this week.</strong>}
        </div>
      )}
      {nothing && <p className="muted">{q === "" ? "No matches yet — the draw is being made." : `Nothing tonight for “${query}”.`}</p>}
      {live.length > 0 && (
        <section>
          <h2>Playing now</h2>
          <div className="match-grid">
            {live.map((m) => (
              <LiveCard key={m.id} m={m} now={now} />
            ))}
          </div>
        </section>
      )}
      {next.length > 0 && (
        <section>
          <h2>Up next</h2>
          <div className="match-grid">
            {next.map((m) => (
              <NextCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
      {(waiting.length > 0 || passes.length > 0) && (
        <section>
          <h2>Waiting for an opponent</h2>
          <ul className="plain rows">
            {waiting.map((a) => (
              <li key={a.entry.entry_id}>
                <span>
                  <strong>{a.entry.name}</strong> <SourceTag e={a.entry} />
                </span>
                <span className="muted small">{a.round === 1 ? `${a.label} · next buy-back or late arrival` : `${a.label} · winner of ${feederLabel(c.bracket_size, a.slot, a.round)}`}</span>
              </li>
            ))}
            {passes.map((fp) => (
              <li key={fp.id}>
                <span>
                  <strong>{fp.entry.name}</strong> <SourceTag e={fp.entry} />
                </span>
                <span className="muted small">free pass to {roundName(fp.round + 1, c.rounds_total).toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h2>Results</h2>
          <ul className="plain rows">
            {done.map((m) => (
              <ResultRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The club list as searchable rows with a labelled handicap column (spec 3.8). */
export function PlayersTable({ players, query, setQuery }: { players: Array<{ id: string; name: string; rating: number }>; query: string; setQuery: (q: string) => void }) {
  const q = norm(query);
  const rows = players.filter((p) => q === "" || norm(p.name).includes(q));
  return (
    <div>
      <input type="search" value={query} placeholder="Search players" aria-label="Search players" onChange={(e) => setQuery(e.target.value)} />
      <p className="muted small">Handicap: lower is better, and it can be negative. The player with the higher number starts with two thirds of the difference.</p>
      <table className="players">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Handicap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="num">{fmtRating(p.rating)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                No player called “{query}”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
