"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { BracketTree } from "./BracketTree";
import { BracketView } from "./BracketView";
import { CompleteDialog } from "./CompleteDialog";
import { SoundBanner } from "./SoundBanner";
import { ViewToggle, type BracketViewMode } from "./ViewToggle";
import { get, patch, post } from "./client/api";
import { useAction, usePoll, useServerClock, useStoredChoice } from "./client/hooks";
import { unlockSound, useSoundUnlocked, useTimeoutAlert } from "./client/sound";

type Dialog = { kind: "complete" | "correct"; m: MatchView } | { kind: "add" } | null;
type ClubPlayer = { id: string; name: string; rating: number; active: boolean };
type WithBracket = { bracket: BracketPayload };

/** Admin bracket and match control (spec 3.4). */
export function AdminBracket({ initial }: { initial: BracketPayload }) {
  const router = useRouter();
  const { data: b, setData, refresh } = usePoll<BracketPayload>("/api/admin/bracket", 5_000, initial);
  const now = useServerClock(b.server_now);
  const soundOn = useSoundUnlocked();
  const allMatches = b.rounds.flatMap((r) => r.matches);
  useTimeoutAlert(allMatches, now, soundOn);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMatchId, setPending] = useState<string | null>(null);
  const [view, setView] = useStoredChoice<BracketViewMode>("bracket-view", "list");
  const { busy, error, run, setError } = useAction();
  const c = b.competition;

  if (!c) {
    return (
      <main>
        <p>No competition tonight yet.</p>
        <Link className="btn primary" href="/admin/setup">Set up tonight&apos;s competition</Link>
      </main>
    );
  }

  const roundOneOpen = c.status === "in_progress" && (c.buybacks_open || c.current_round === 1);
  const waitingCount = b.rounds[0]?.waiting.length ?? 0;
  const compId = c.id;
  /** A dialog finished: show its note and drop in the bracket its reply carried. */
  const done = (msg: string | null, bracket: BracketPayload) => {
    setDialog(null);
    setNotice(msg);
    setData(bracket);
  };
  /** An action on one match: that card shows "Saving…" until the reply lands. */
  const onMatch = (m: MatchView, fn: () => Promise<WithBracket>) => {
    setPending(m.id);
    void run(async () => {
      const r = await fn();
      setData(r.bracket);
    }).finally(() => setPending(null));
  };

  const actions = {
    busy,
    pendingMatchId,
    onStart: (m: MatchView) => {
      unlockSound();
      onMatch(m, () => post<WithBracket>(`/api/admin/matches/${m.id}/start`));
    },
    onComplete: (m: MatchView) => setDialog({ kind: "complete", m }),
    onCorrect: (m: MatchView) => setDialog({ kind: "correct", m }),
    onCancelStart: (m: MatchView) => {
      if (!confirm(`Cancel the start of ${m.label}? The clock is discarded and the match goes back to not started.`)) return;
      onMatch(m, () => post<WithBracket>(`/api/admin/matches/${m.id}/cancel-start`));
    },
    onSetLimit: (m: MatchView) => {
      const v = prompt(`Time limit for ${m.label} in minutes (blank = competition default of ${c.default_time_limit_minutes})`, m.has_own_time_limit ? String(m.time_limit_minutes) : "");
      if (v === null) return;
      const minutes = v.trim() === "" ? null : Number(v);
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) return setError("Enter a whole number of minutes from 1 to 180");
      onMatch(m, () => patch<WithBracket>(`/api/admin/matches/${m.id}`, { time_limit_minutes: minutes }));
    },
  };

  const closeBuybacks = () =>
    run(async () => {
      const dry = await post<{ free_passes: number; free_pass_names: string[] }>(`/api/admin/competitions/${compId}/close-buybacks`, { dry_run: true });
      const n = dry.free_passes;
      const consequence = n === 0 ? "Everyone in round one has an opponent." : `${n} player${n === 1 ? " has" : "s have"} no opponent and will go straight to round 2${n ? `: ${dry.free_pass_names.join(", ")}` : ""}.`;
      if (!confirm(`Close buy-backs? No more entries tonight. ${consequence}`)) return;
      const r = await post<{ free_passes: number; matches_created: number[] } & WithBracket>(`/api/admin/competitions/${compId}/close-buybacks`);
      setNotice(`Buy-backs closed. ${r.free_passes} free pass${r.free_passes === 1 ? "" : "es"}.${r.matches_created.length ? ` Created ${r.matches_created.map((n) => `M${n}`).join(", ")}.` : ""}`);
      setData(r.bracket);
    });

  const forcePair = () =>
    run(async () => {
      const r = await post<{ match_number: number } & WithBracket>(`/api/admin/competitions/${compId}/force-pair`);
      setNotice(`Force Pair created M${r.match_number}.`);
      setData(r.bracket);
    });

  const abandon = () => {
    if (!confirm(`Abandon ${c.name}? Every match and result tonight is kept but the night is closed and a new competition can be set up.`)) return;
    void run(async () => {
      await post(`/api/admin/competitions/${compId}/abandon`);
      router.push("/admin/setup");
    });
  };

  return (
    <main>
      <div className="row between">
        <h1>{c.name} · {c.status === "complete" ? "Complete" : c.current_round === c.rounds_total ? "Final" : `Round ${c.current_round}`}</h1>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {c.status === "complete" && c.winner && (
        <div className="info">
          <strong>Winner: {c.winner.name}</strong>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn primary" href={`/admin/ratings?competition=${c.id}`}>Rating review ›</Link>
            <Link className="btn" href="/admin/setup">Set up a new competition</Link>
          </div>
        </div>
      )}
      {roundOneOpen && (
        <div className="card stack">
          <div className="row between">
            <span>
              Buy-backs <strong>{c.buybacks_open ? "OPEN" : "closed"}</strong>
            </span>
            <span className="muted">Open slots: {c.open_slots} of {c.bracket_size}</span>
          </div>
          {!c.buybacks_open && c.buybacks_closed_at && <div className="muted small">Buy-backs closed. Losers from here on are out.</div>}
          {c.buybacks_open && (
            <div className="row">
              <button className="btn" disabled={busy} onClick={closeBuybacks}>Close Buy-Backs</button>
              <button className="btn" disabled={busy || waitingCount < 2} title={waitingCount < 2 ? "Needs 2 waiting players" : ""} onClick={forcePair}>
                Force Pair{waitingCount < 2 ? " (needs 2 waiting)" : ""}
              </button>
              {c.open_slots > 0 && <button className="btn sm" disabled={busy} onClick={() => setDialog({ kind: "add" })}>+ Add buy-back / late arrival</button>}
            </div>
          )}
        </div>
      )}
      <SoundBanner show={!soundOn && allMatches.some((m) => m.state === "in_play")} />
      {notice && (
        <div className="info" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {view === "tree" ? (
        <>
          <p className="muted small">The tree is a picture of the night. Start and complete matches from the list view.</p>
          <BracketTree b={b} />
        </>
      ) : (
        <BracketView b={b} now={now} actions={c.status === "in_progress" ? actions : undefined} />
      )}
      <div className="footer-links">
        <Link href="/admin/players">Players &amp; ratings ›</Link>
        <Link href="/" target="_blank">Public page ›</Link>
        <Link href="/admin/override">Master override ›</Link>
        <Link href="/admin/settings">Settings ›</Link>
        {c.status === "in_progress" && (
          <a href="#" className="danger" style={{ color: "var(--red)" }} onClick={(e) => { e.preventDefault(); abandon(); }}>
            Abandon night
          </a>
        )}
      </div>
      {dialog?.kind === "complete" || dialog?.kind === "correct" ? (
        <CompleteDialog m={dialog.m} b={b} mode={dialog.kind} onClose={() => setDialog(null)} onSaved={done} />
      ) : null}
      {dialog?.kind === "add" && <AddBuybackSheet b={b} onClose={() => setDialog(null)} onSaved={done} />}
      {void refresh}
    </main>
  );
}

/** "Add buy-back / late arrival" (spec 3.4): a club player or a new one enters as a buy-back player. */
function AddBuybackSheet({ b, onClose, onSaved }: { b: BracketPayload; onClose: () => void; onSaved: (msg: string | null, bracket: BracketPayload) => void }) {
  const [players, setPlayers] = useState<ClubPlayer[] | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRating, setNewRating] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => {
    void get<{ players: ClubPlayer[] }>("/api/admin/players").then((r) => setPlayers(r.players));
  }, []);
  const live = new Set(b.entries.filter((e) => e.position.status !== "out").map((e) => e.player_id));
  const choices = (players ?? []).filter((p) => !live.has(p.id));
  const save = () =>
    run(async () => {
      const body = playerId ? { player_id: playerId } : { new_player: { name: newName.trim(), rating: Number(newRating) } };
      if (!playerId && (!newName.trim() || !Number.isInteger(Number(newRating)))) throw new Error("Choose a player, or enter a name and a whole-number rating");
      const r = await post<{ match_number: number | null; awaiting_in: number | null } & WithBracket>(`/api/admin/competitions/${b.competition!.id}/entries`, body);
      onSaved(r.match_number ? `Placed into M${r.match_number}.` : `Placed into M${r.awaiting_in}, awaiting an opponent.`, r.bracket);
    });
  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add buy-back / late arrival</h2>
        <p className="muted small">Takes one open slot ({b.competition!.open_slots} left) and goes straight into the bracket: a random empty match while one exists, otherwise beside a random lone player.</p>
        <label className="field">
          <span>Club player</span>
          <select value={playerId} disabled={busy} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">— choose —</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rating})
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">or a new player:</p>
        <label className="field">
          <span>Name</span>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy || !!playerId} />
        </label>
        <label className="field">
          <span>Rating (lower is better; negatives allowed)</span>
          <input type="number" value={newRating} onChange={(e) => setNewRating(e.target.value)} disabled={busy || !!playerId} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add"}</button>
          <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
