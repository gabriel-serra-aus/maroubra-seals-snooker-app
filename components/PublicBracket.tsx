"use client";

import Link from "next/link";
import type { BracketPayload } from "@/lib/bracket/payload";
import { BracketView } from "./BracketView";
import { MODE_LABEL, fmtRating } from "./client/format";
import { usePoll, useServerClock } from "./client/hooks";

type PlayerList = { players: Array<{ id: string; name: string; rating: number }> };

/** The public bracket (spec 3.8): read only, refreshes itself every 10 seconds. */
export function PublicBracket({ initial, initialPlayers }: { initial: BracketPayload; initialPlayers: PlayerList }) {
  const { data: b } = usePoll<BracketPayload>("/api/public/bracket", 10_000, initial);
  const { data: players } = usePoll<PlayerList>("/api/public/players", 60_000, initialPlayers);
  const now = useServerClock(b.server_now);
  const c = b.competition;
  return (
    <main>
      <h1>Maroubra Seals Snooker</h1>
      {c ? (
        <>
          <p>
            <strong>{c.name}</strong> · {c.status === "complete" ? "Complete" : `Round ${c.current_round}`}
            {c.status === "in_progress" && c.current_round === 1 && (
              <span className="muted"> · Buy-backs {c.buybacks_open ? `open · ${MODE_LABEL[c.buyback_mode as keyof typeof MODE_LABEL]}` : "closed"}</span>
            )}
          </p>
          {c.status === "complete" && c.winner && (
            <div className="info">
              <strong>Winner: {c.winner.name}</strong>
            </div>
          )}
          <BracketView b={b} now={now} expandable />
          {c.status === "in_progress" && b.rounds.length < 2 && (
            <section>
              <h2>Round 2</h2>
              <p className="muted">Drawn when round 1 is finished.</p>
            </section>
          )}
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
