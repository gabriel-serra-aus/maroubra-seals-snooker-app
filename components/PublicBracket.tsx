"use client";

import Link from "next/link";
import { useState } from "react";
import { bracketIsStale, type BracketPayload } from "@/lib/bracket/payload";
import { BracketTree } from "./BracketTree";
import { Btn } from "./Btn";
import { MatchCard } from "./MatchCard";
import { TableStrip } from "./Tables";
import { PlayerFinder, PlayersTable, TonightView } from "./Tonight";
import { ViewToggle, type BracketViewMode } from "./ViewToggle";
import { roundName } from "./client/format";
import { usePoll, useServerClock, useStoredChoice, useWideScreen } from "./client/hooks";

type PlayerList = { players: Array<{ id: string; name: string; rating: number; photo: string | null }> };
type Tab = "tonight" | "players";

const ICONS: Record<Tab, string> = {
  // A clock face and two people: line icons drawn in currentColor.
  tonight: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 4v5l3 2",
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
 * The public page (spec 3.8): read only, refreshes itself every 10 seconds. Two tabs — Tonight (live
 * play as a list, or the whole bracket as a tree) and Players (the club list) — with the tab bar along
 * the bottom on a phone, where the thumb is.
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
  // The match a tree box opened: read from the live bracket so the popup follows its clock and result.
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const c = b.competition;
  const selected = b.rounds.flatMap((r) => r.matches).find((m) => m.id === openMatch);
  const liveCount = b.rounds.flatMap((r) => r.matches).filter((m) => m.state === "in_play").length;

  const tabs = (
    <nav className="tabs" aria-label="Sections">
      <button type="button" className={tab === "tonight" ? "on" : ""} aria-current={tab === "tonight" ? "page" : undefined} onClick={() => setTab("tonight")}>
        <TabIcon kind="tonight" />
        Tonight
        {liveCount > 0 && <span className="badge">{liveCount}</span>}
      </button>
      <button type="button" className={tab === "players" ? "on" : ""} aria-current={tab === "players" ? "page" : undefined} onClick={() => setTab("players")}>
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
        {tab === "tonight" && (
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
                {/* Find my match with the List | Tree switch beside it, as on 3.4 (spec 3.8). */}
                <div className="row actionbar-right" style={{ margin: "8px 0" }}>
                  <PlayerFinder b={b} now={now} query={query} setQuery={setQuery} />
                  <ViewToggle value={view} onChange={setView} />
                </div>
                {c.status === "in_progress" && <TableStrip b={b} now={now} />}
                {view === "tree" ? (
                  <>
                    {c.status === "complete" && (
                      <div className="info">
                        {c.winner ? <strong>Winner: {c.winner.name}</strong> : <strong>Night ended early — no winner this week.</strong>}
                      </div>
                    )}
                    <BracketTree b={b} now={now} onSelect={(m) => setOpenMatch(m.id)} />
                  </>
                ) : (
                  <TonightView b={b} now={now} query={query} />
                )}
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
        {tab === "players" && (
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
      {selected && (
        // A tapped box opens the match with both players' faces large (spec 3.8, O-18). Read only.
        <div className="sheet-backdrop" onClick={() => setOpenMatch(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2 style={{ margin: 0, border: 0 }}>{selected.label}</h2>
              <Btn className="sm" onClick={() => setOpenMatch(null)}>Close</Btn>
            </div>
            <MatchCard m={selected} now={now} large />
          </div>
        </div>
      )}
    </>
  );
}
