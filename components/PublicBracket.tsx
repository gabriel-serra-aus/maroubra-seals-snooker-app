"use client";

import Link from "next/link";
import type { BracketPayload } from "@/lib/bracket/payload";
import { BracketTree } from "./BracketTree";
import { BracketView } from "./BracketView";
import { ViewToggle, type BracketViewMode } from "./ViewToggle";
import { fmtRating } from "./client/format";
import { usePoll, useServerClock, useStoredChoice, useWideScreen } from "./client/hooks";

type PlayerList = { players: Array<{ id: string; name: string; rating: number }> };

/** The public bracket (spec 3.8): read only, refreshes itself every 10 seconds. */
export function PublicBracket({ initial, initialPlayers }: { initial: BracketPayload; initialPlayers: PlayerList }) {
  const { data: b } = usePoll<BracketPayload>("/api/public/bracket", 10_000, initial);
  const { data: players } = usePoll<PlayerList>("/api/public/players", 60_000, initialPlayers);
  const now = useServerClock(b.server_now);
  // Tree by default on a desktop, list on a phone (spec 3.4, 3.8); a tap on the switch is remembered.
  const wide = useWideScreen();
  const [view, setView] = useStoredChoice<BracketViewMode>("bracket-view", wide ? "tree" : "list", "list");
  const c = b.competition;
  return (
    <main>
      <div className="brand">
        {/* Served as-is from public/: three fixed sizes, no image service needed (plan: cheap and self-contained). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/club-logo.png" alt="Maroubra Seals Snooker Club" className="logo-lg" />
        <h1>Maroubra Seals Snooker</h1>
      </div>
      {c ? (
        <>
          <div className="row between">
            <p>
              <strong>{c.name}</strong> · {c.status === "complete" ? (c.ended_early ? "Complete (unfinished)" : "Complete") : c.current_round === c.rounds_total ? "Final" : `Round ${c.current_round}`}
              {c.status === "in_progress" && (c.buybacks_open || c.current_round === 1) && (
                <span className="muted"> · Buy-backs {c.buybacks_open ? `open · ${c.open_slots} slot${c.open_slots === 1 ? "" : "s"} left` : "closed"}</span>
              )}
            </p>
            <ViewToggle value={view} onChange={setView} />
          </div>
          {c.status === "complete" && (
            <div className="info">
              {c.winner ? (
                <strong>Winner: {c.winner.name}</strong>
              ) : (
                // Ended early on time (spec 5.11): the night is over with no final played.
                <strong>Night ended early — no winner this week.</strong>
              )}
            </div>
          )}
          {view === "tree" ? <BracketTree b={b} now={now} /> : <BracketView b={b} now={now} expandable />}
        </>
      ) : (
        <p className="muted">No competition tonight yet.</p>
      )}
      <section>
        <h2>Players &amp; ratings</h2>
        <p className="small">
          {players.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              {p.name} {fmtRating(p.rating)}
            </span>
          ))}
        </p>
        <p className="muted small">Lower is better; the higher number starts with two thirds of the difference.</p>
      </section>
      <p>
        <Link href="/admin/login">Organiser login ›</Link>
      </p>
    </main>
  );
}
