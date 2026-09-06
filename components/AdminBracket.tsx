"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { BracketView } from "./BracketView";
import { CompleteDialog } from "./CompleteDialog";
import { SoundBanner } from "./SoundBanner";
import { get, patch, post } from "./client/api";
import { MODE_LABEL } from "./client/format";
import { useAction, usePoll, useServerClock } from "./client/hooks";
import { unlockSound, useSoundUnlocked, useTimeoutAlert } from "./client/sound";

type Dialog = { kind: "complete" | "correct"; m: MatchView } | { kind: "add" } | null;
type ClubPlayer = { id: string; name: string; rating: number; active: boolean };

/** Admin bracket and match control (spec 3.4). */
export function AdminBracket({ initial }: { initial: BracketPayload }) {
  const router = useRouter();
  const { data: b, refresh } = usePoll<BracketPayload>("/api/admin/bracket", 5_000, initial);
  const now = useServerClock(b.server_now);
  const soundOn = useSoundUnlocked();
  const allMatches = b.rounds.flatMap((r) => r.matches);
  useTimeoutAlert(allMatches, now, soundOn);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const round1 = b.rounds[0];
  const inRound1 = c.status === "in_progress" && c.current_round === 1;
  const waitingCount = round1?.waiting.length ?? 0;
  const compId = c.id;
  const done = async (msg: string | null) => {
    setDialog(null);
    setNotice(msg);
    await refresh();
  };

  const actions = {
    onStart: (m: MatchView) => {
      unlockSound();
      void run(async () => {
        await post(`/api/admin/matches/${m.id}/start`);
        await refresh();
      });
    },
    onComplete: (m: MatchView) => setDialog({ kind: "complete", m }),
    onCorrect: (m: MatchView) => setDialog({ kind: "correct", m }),
    onCancelStart: (m: MatchView) => {
      if (!confirm(`Cancel the start of ${m.label}? The clock is discarded and the match goes back to not started.`)) return;
      void run(async () => {
        await post(`/api/admin/matches/${m.id}/cancel-start`);
        await refresh();
      });
    },
    onSetLimit: (m: MatchView) => {
      const v = prompt(`Time limit for ${m.label} in minutes (blank = competition default of ${c.default_time_limit_minutes})`, m.has_own_time_limit ? String(m.time_limit_minutes) : "");
      if (v === null) return;
      const minutes = v.trim() === "" ? null : Number(v);
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) return setError("Enter a whole number of minutes from 1 to 180");
      void run(async () => {
        await patch(`/api/admin/matches/${m.id}`, { time_limit_minutes: minutes });
        await refresh();
      });
    },
  };

  const closeBuybacks = () =>
    run(async () => {
      const dry = await post<{ free_passes: number; free_pass_names: string[] }>(`/api/admin/competitions/${compId}/close-buybacks`, { dry_run: true });
      const n = dry.free_passes;
      const consequence = n === 0 ? "Everyone waiting will be placed into a match." : `${n} player${n === 1 ? " has" : "s have"} no opponent and will go straight to round 2${n ? `: ${dry.free_pass_names.join(", ")}` : ""}.`;
      if (!confirm(`Close buy-backs? No more entries tonight. ${consequence}`)) return;
      const r = await post<{ free_passes: number; round_drawn: number | null }>(`/api/admin/competitions/${compId}/close-buybacks`);
      setNotice(`Buy-backs closed. ${r.free_passes} free pass${r.free_passes === 1 ? "" : "es"}.${r.round_drawn ? ` Round ${r.round_drawn} drawn.` : ""}`);
      await refresh();
    });

  const forcePair = () =>
    run(async () => {
      const r = await post<{ match_number: number }>(`/api/admin/competitions/${compId}/force-pair`);
      setNotice(`Force Pair created M${r.match_number}.`);
      await refresh();
    });

  const switchMode = () => {
    const next = c.buyback_mode === "random_draw" ? "sequential" : "random_draw";
    const note = next === "sequential" ? "Waiting buy-backs will be placed now, in the order they re-entered." : "Existing matches stay as they are; new buy-backs wait for the close.";
    if (!confirm(`Switch to ${MODE_LABEL[next]}? ${note}`)) return;
    void run(async () => {
      await patch(`/api/admin/competitions/${compId}`, { buyback_mode: next });
      await refresh();
    });
  };

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
        <h1>{c.name} · {c.status === "complete" ? "Complete" : `Round ${c.current_round}`}</h1>
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
      {inRound1 && (
        <div className="card stack">
          <div className="row between">
            <span>
              Buy-backs <strong>{c.buybacks_open ? "OPEN" : "closed"}</strong>
              {c.buybacks_open && <> · {MODE_LABEL[c.buyback_mode as keyof typeof MODE_LABEL]}</>}
            </span>
            <span className="muted">Open slots: {c.open_slots} of {c.bracket_size}</span>
          </div>
          {!c.buybacks_open && c.buybacks_closed_at && <div className="muted small">Buy-backs closed. Losers from here on are out.</div>}
          <div className="row">
            {c.buybacks_open && <button className="btn" disabled={busy} onClick={closeBuybacks}>Close Buy-Backs</button>}
            <button className="btn" disabled={busy || waitingCount < 2} title={waitingCount < 2 ? "Needs 2 waiting players" : ""} onClick={forcePair}>
              Force Pair{waitingCount < 2 ? " (needs 2 waiting)" : ""}
            </button>
            {c.buybacks_open && <button className="btn sm" disabled={busy} onClick={switchMode}>Switch mode</button>}
            {c.buybacks_open && c.open_slots > 0 && <button className="btn sm" disabled={busy} onClick={() => setDialog({ kind: "add" })}>+ Add buy-back / late arrival</button>}
          </div>
        </div>
      )}
      {c.status === "in_progress" && c.draw_blocked_by.length > 0 && (
        <div className="notice">
          Waiting with nobody to play: {c.draw_blocked_by.map((e) => e.name).join(", ")}. The next round will not be drawn until they are paired or given a free pass on the <Link href="/admin/override">override screen</Link>.
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
      <BracketView b={b} now={now} actions={c.status === "in_progress" ? actions : undefined} />
      <div className="footer-links">
        <Link href="/admin/players">Players &amp; ratings ›</Link>
        <Link href="/" target="_blank">Public page ›</Link>
        <Link href="/admin/override">Master override ›</Link>
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
    </main>
  );
}

/** "Add buy-back / late arrival" (spec 3.4): a club player or a new one enters as a buy-back player. */
function AddBuybackSheet({ b, onClose, onSaved }: { b: BracketPayload; onClose: () => void; onSaved: (msg: string | null) => void }) {
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
      const r = await post<{ match_number: number | null }>(`/api/admin/competitions/${b.competition!.id}/entries`, body);
      onSaved(r.match_number ? `Placed into M${r.match_number}.` : "Added as a waiting player.");
    });
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add buy-back / late arrival</h2>
        <p className="muted small">Takes one open slot ({b.competition!.open_slots} left) and enters as a buy-back player.</p>
        <label className="field">
          <span>Club player</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
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
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={!!playerId} />
        </label>
        <label className="field">
          <span>Rating (lower is better; negatives allowed)</span>
          <input type="number" value={newRating} onChange={(e) => setNewRating(e.target.value)} disabled={!!playerId} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={save}>Add</button>
          <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
