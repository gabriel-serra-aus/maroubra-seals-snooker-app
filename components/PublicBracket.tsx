"use client";

import Link from "next/link";
import { useState } from "react";
import { bracketIsStale, type BracketPayload } from "@/lib/bracket/payload";
import { BracketTree } from "./BracketTree";
import { BracketView } from "./BracketView";
import { TableStrip } from "./Tables";
import { PlayerFinder, PlayersTable, TonightView } from "./Tonight";
import { ViewToggle, type BracketViewMode } from "./ViewToggle";
import { roundName } from "./client/format";
import { usePoll, useServerClock, useStoredChoice, useWideScreen } from "./client/hooks";

type PlayerList = { players: Array<{ id: string; name: string; rating: number }> };
type Tab = "tonight" | "draw" | "players";

const ICONS: Record<Tab, string> = {
  // A clock face, a bracket, two people: line icons drawn in currentColor.
  tonight: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 4v5l3 2",
  draw: "M3 5h5v4H3zM3 15h5v4H3zM8 7h4v10H8M12 12h4M16 10h5v4h-5",
  players: "M8 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6a3 3 0 0 0 0 6ZM2 20a6 6 0 0 1 12 0M12 20a5 5 0 0 1 10 0",
};

function TabIcon({ kind }: { kind: Tab }) {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[kind]} />
    </svg>
  );
}

/**
 * The public page (spec 3.8): read only, refreshes itself every 10 seconds. Three tabs — Tonight (live
 * play first), Draw (the full bracket as a list or tree) and Players (the club list) — with the tab bar
 * along the bottom on a phone, where the thumb is.
 */
export function PublicBracket({ initial, initialPlayers }: { initial: BracketPayload; initialPlayers: PlayerList }) {
  const { data: b } = usePoll<BracketPayload>("/api/public/bracket", 10_000, initial, bracketIsStale);
  const { data: players } = usePoll<PlayerList>("/api/public/players", 60_000, initialPlayers);
  const now = useServerClock(b.server_now);
  // Tree by default on a desktop, list on a phone (spec 3.4, 3.8); a tap on the switch is remembered.
  const wide = useWideScreen();
  const [view, setView] = useStoredChoice<BracketViewMode>("bracket-view", wide ? "tree" : "list", "list");
  const [tab, setTab] = useState<Tab>("tonight");
  const [query, setQuery] = useState("");
  const c = b.competition;
  const shownTab: Tab = c ? tab : tab === "draw" ? "tonight" : tab;
  const liveCount = b.rounds.flatMap((r) => r.matches).filter((m) => m.state === "in_play").length;

  const tabs = (
    <nav className="tabs" aria-label="Sections">
      <button type="button" className={shownTab === "tonight" ? "on" : ""} aria-current={shownTab === "tonight" ? "page" : undefined} onClick={() => setTab("tonight")}>
        <TabIcon kind="tonight" />
        Tonight
        {liveCount > 0 && <span className="badge">{liveCount}</span>}
      </button>
      <button type="button" className={shownTab === "draw" ? "on" : ""} disabled={!c} aria-current={shownTab === "draw" ? "page" : undefined} onClick={() => setTab("draw")}>
        <TabIcon kind="draw" />
        Draw
      </button>
      <button type="button" className={shownTab === "players" ? "on" : ""} aria-current={shownTab === "players" ? "page" : undefined} onClick={() => setTab("players")}>
        <TabIcon kind="players" />
        Players
      </button>
    </nav>
  );

  return (
    <>
      <header className="topbar public">
        <div className="inner">
          <span className="brand">
            {/* Served as-is from public/: three fixed sizes, no image service needed (plan: cheap and self-contained). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/club-logo-small.png" alt="" className="logo-sm" />
            <span className="brand-name">Maroubra Seals Snooker</span>
          </span>
          <span className="topbar-tabs">{tabs}</span>
          {/* The organiser's way in, on every screen: a labelled button in the ribbon, not a footer link. */}
          <Link href="/admin/login" className="login-link">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Organiser Login
          </Link>
        </div>
      </header>
      <main className="public-main">
        {shownTab === "tonight" && (
          <>
            <div className="page-head">
              <div>
                <h1>Tonight</h1>
                {c ? (
                  <p className="meta">
                    <strong>{c.name}</strong> ·{" "}
                    {c.status === "complete" ? (c.ended_early ? "Complete (unfinished)" : "Complete") : roundName(c.current_round, c.rounds_total)}
                    {c.status === "in_progress" && (c.buybacks_open || c.current_round === 1) && (
                      <> · Buy-backs {c.buybacks_open ? `open · ${c.open_slots} slot${c.open_slots === 1 ? "" : "s"} left` : "closed"}</>
                    )}
                  </p>
                ) : (
                  <p className="meta">No competition tonight yet</p>
                )}
              </div>
            </div>
            {c ? (
              <>
                <PlayerFinder b={b} now={now} query={query} setQuery={setQuery} />
                {c.status === "in_progress" && <TableStrip b={b} now={now} />}
                <TonightView b={b} now={now} query={query} />
              </>
            ) : (
              <div className="card empty-night">
                <p>
                  <strong>Nothing is running right now.</strong>
                </p>
                <p className="muted">
                  The draw appears here the moment the organiser sets up the next competition night, and every match, clock and result follows live. Until then the club list is under
                  Players.
                </p>
              </div>
            )}
          </>
        )}
        {shownTab === "draw" && c && (
          <>
            <div className="page-head">
              <div>
                <h1>Draw</h1>
                <p className="meta">
                  {c.bracket_size}-slot bracket · {roundName(c.current_round, c.rounds_total)}
                  {c.status === "in_progress" && c.buybacks_open && <> · {c.open_slots} open slot{c.open_slots === 1 ? "" : "s"}</>}
                </p>
              </div>
              <ViewToggle value={view} onChange={setView} />
            </div>
            {c.status === "complete" && (
              <div className="info">
                {c.winner ? <strong>Winner: {c.winner.name}</strong> : <strong>Night ended early — no winner this week.</strong>}
              </div>
            )}
            {view === "tree" ? <BracketTree b={b} now={now} /> : <BracketView b={b} now={now} expandable />}
          </>
        )}
        {shownTab === "players" && (
          <>
            <div className="page-head">
              <div>
                <h1>Players</h1>
                <p className="meta">{players.players.length} active players</p>
              </div>
            </div>
            <PlayersTable players={players.players} query={query} setQuery={setQuery} />
          </>
        )}
      </main>
      <div className="bottom-tabs">{tabs}</div>
    </>
  );
}
