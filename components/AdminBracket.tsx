"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { numberLabel } from "@/lib/logic/derive";
import { BracketTree } from "./BracketTree";
import { BracketView } from "./BracketView";
import { Btn, Spinner } from "./Btn";
import { CompleteDialog } from "./CompleteDialog";
import { useDialog } from "./Dialog";
import { MatchCard, actionKey, type MatchActions } from "./MatchCard";
import { SoundBanner } from "./SoundBanner";
import { ViewToggle, type BracketViewMode } from "./ViewToggle";
import { get, patch, post } from "./client/api";
import { useAction, usePoll, useServerClock, useStoredChoice, useWideScreen } from "./client/hooks";
import { unlockSound, useSoundUnlocked, useTimeoutAlert } from "./client/sound";

type Dialog = { kind: "complete" | "correct"; m: MatchView } | { kind: "match"; id: string } | { kind: "add" } | null;
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
  // Tree by default on a desktop, list on a phone (spec 3.4, 3.8); a tap on the switch is remembered.
  const wide = useWideScreen();
  const [view, setView] = useStoredChoice<BracketViewMode>("bracket-view", wide ? "tree" : "list", "list");
  const { busy, pending, error, run, setError } = useAction();
  // Confirmations and the time-limit field are the app's own centred cards, never the browser's (spec 3.5).
  const { ask, askText, dialog: confirmCard } = useDialog();
  const c = b.competition;

  // The night is over — the final played out, or "End night here" closed it. The next step is always the
  // rating review (rules §13, spec 3.7), so go there rather than leave the organiser to find the link.
  // Only the moment the status turns complete redirects; coming back to a finished bracket stays put.
  const status = c?.status;
  const finishedId = c?.id;
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "in_progress" && status === "complete" && finishedId) {
      router.push(`/admin/ratings?competition=${finishedId}`);
    }
    prevStatus.current = status;
  }, [status, finishedId, router]);

  if (!c) {
    return (
      <main className="narrow">
        <p>No competition tonight yet.</p>
        <Link className="btn primary" href="/admin/setup">Set up tonight&apos;s competition</Link>
      </main>
    );
  }

  const roundOneOpen = c.status === "in_progress" && (c.buybacks_open || c.current_round === 1);
  const waitingCount = b.rounds[0]?.waiting.length ?? 0;
  // The window never closes by itself (O-15). Once every round-one match is played, nudge the organiser
  // towards the tap that gives the lone players their pass, naming them.
  const roundOneMatches = b.rounds[0]?.matches ?? [];
  const roundOnePlayedOut = c.buybacks_open && roundOneMatches.length > 0 && roundOneMatches.every((m) => m.state === "finished");
  const waitingNames = (b.rounds[0]?.waiting ?? []).map((e) => e.name);
  const compId = c.id;
  /** A dialog finished: show its note and drop in the bracket its reply carried. */
  const done = (msg: string | null, bracket: BracketPayload) => {
    setDialog(null);
    setNotice(msg);
    setData(bracket);
  };
  /** An action on one match: the button tapped shows a spinner until the reply lands (one round trip). */
  const onMatch = (m: MatchView, action: string, fn: () => Promise<WithBracket>) =>
    run(async () => {
      const r = await fn();
      setData(r.bracket);
    }, actionKey(action, m));

  const actions: MatchActions = {
    busy,
    pending,
    onStart: (m) => {
      unlockSound();
      void onMatch(m, "start", () => post<WithBracket>(`/api/admin/matches/${m.id}/start`));
    },
    onComplete: (m) => setDialog({ kind: "complete", m }),
    onCorrect: (m) => setDialog({ kind: "correct", m }),
    onCancelStart: (m) => {
      void (async () => {
        const ok = await ask({
          title: `Cancel the start of ${m.label}?`,
          body: "The clock is discarded and the match goes back to not started. The pairing is untouched (O-5).",
          confirm: "Cancel the start",
          cancel: "Keep playing",
        });
        if (!ok) return;
        void onMatch(m, "cancel", () => post<WithBracket>(`/api/admin/matches/${m.id}/cancel-start`));
      })();
    },
    onSetLimit: (m) => {
      void (async () => {
        const v = await askText({
          title: `Time limit for ${m.label}`,
          body: `Whole minutes, 1 to 180. Leave it blank for the competition default of ${c.default_time_limit_minutes} minutes.`,
          label: "Minutes",
          initial: m.has_own_time_limit ? String(m.time_limit_minutes) : "",
          placeholder: String(c.default_time_limit_minutes),
          numeric: true,
          confirm: "Set the limit",
          // Checked in the card itself, so a wrong number is corrected where it was typed.
          validate: (raw) => {
            if (raw.trim() === "") return null;
            const n = Number(raw);
            return Number.isInteger(n) && n >= 1 && n <= 180 ? null : "Enter a whole number of minutes from 1 to 180";
          },
        });
        if (v === null) return;
        const minutes = v.trim() === "" ? null : Number(v);
        void onMatch(m, "limit", () => patch<WithBracket>(`/api/admin/matches/${m.id}`, { time_limit_minutes: minutes }));
      })();
    },
  };

  const closeBuybacks = () =>
    run(async () => {
      const dry = await post<{ free_passes: number; free_pass_names: string[] }>(`/api/admin/competitions/${compId}/close-buybacks`, { dry_run: true });
      const n = dry.free_passes;
      const consequence = n === 0 ? "Everyone in round one has an opponent." : `${n} player${n === 1 ? " has" : "s have"} no opponent and will go straight to round 2${n ? `: ${dry.free_pass_names.join(", ")}` : ""}.`;
      const ok = await ask({
        title: "No more buy-backs or late entries?",
        body: "The player list is locked for the night: a round-one loser from here on is out (§8.3).",
        points: [consequence],
        confirm: "Close the window",
        cancel: "Keep it open",
      });
      if (!ok) return;
      const r = await post<{ free_passes: number; matches_created: number[] } & WithBracket>(`/api/admin/competitions/${compId}/close-buybacks`);
      setNotice(`Buy-backs closed. ${r.free_passes} free pass${r.free_passes === 1 ? "" : "es"}.${r.matches_created.length ? ` Created ${r.matches_created.map((n) => numberLabel(c.bracket_size, n)).join(", ")}.` : ""}`);
      setData(r.bracket);
    }, "close");

  const forcePair = () =>
    run(async () => {
      const r = await post<{ match_number: number } & WithBracket>(`/api/admin/competitions/${compId}/force-pair`);
      setNotice(`Force Pair created ${numberLabel(c.bracket_size, r.match_number)}.`);
      setData(r.bracket);
    }, "force");

  // "End night here" (spec 5.11): the club's time is up, so the night is closed where it stands —
  // complete, kept, no winner. The dry run names what the tap costs before the organiser commits.
  const endNight = () =>
    run(async () => {
      const dry = await post<{ unplayed: number; clocks_cancelled: number; still_in: string[] }>(`/api/admin/competitions/${compId}/end`, { dry_run: true });
      const points = [dry.unplayed === 0 ? "Every match has been played." : `${dry.unplayed} match${dry.unplayed === 1 ? " is" : "es are"} left unplayed.`];
      if (dry.clocks_cancelled > 0) points.push(`${dry.clocks_cancelled} running clock${dry.clocks_cancelled === 1 ? " is" : "s are"} discarded.`);
      if (dry.still_in.length > 0) points.push(`Still in: ${dry.still_in.join(", ")}.`);
      const ok = await ask({
        title: `End ${c.name} here?`,
        body: "The night is kept and counts, but no winner is recorded and the rating review opens (O-16).",
        points,
        note: "This cannot be undone.",
        confirm: "End the night",
        cancel: "Keep playing",
        danger: true,
      });
      if (!ok) return;
      const r = await post<{ unplayed: number } & WithBracket>(`/api/admin/competitions/${compId}/end`);
      setNotice(`${c.name} ended with ${r.unplayed} match${r.unplayed === 1 ? "" : "es"} unplayed. No winner recorded — the rating review is open.`);
      setData(r.bracket);
    }, "end");

  const abandon = () => {
    void (async () => {
      const ok = await ask({
        title: `Abandon ${c.name}?`,
        body: "Every match and result tonight is kept, but the night is closed and a new competition can be set up (O-7).",
        points: ["An abandoned night has no winner and never reaches the rating review."],
        confirm: "Abandon the night",
        cancel: "Keep playing",
        danger: true,
      });
      if (!ok) return;
      void run(async () => {
        await post(`/api/admin/competitions/${compId}/abandon`);
        router.push("/admin/setup");
      }, "abandon");
    })();
  };

  // The card a tree box opened, always read from the latest bracket so it follows the match's state.
  const selected = dialog?.kind === "match" ? allMatches.find((m) => m.id === dialog.id) : undefined;

  return (
    <main>
      <div className="row between">
        <h1>
          {c.name} · {c.status === "complete" ? (c.ended_early ? "Complete (unfinished)" : "Complete") : c.current_round === c.rounds_total ? "Final" : `Round ${c.current_round}`}
        </h1>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {c.status === "complete" && (
        <div className="info">
          {c.winner ? (
            <strong>Winner: {c.winner.name}</strong>
          ) : (
            // Ended early on time (spec 5.11): the night counts and reaches the rating review, but the
            // final was never played, so there is no champion.
            <strong>Night ended early — no winner. Every result is kept.</strong>
          )}
          <div className="muted small" style={{ marginTop: 4 }}>Next step: review the handicaps for tonight, then the night goes into the history.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn primary" href={`/admin/ratings?competition=${c.id}`}>Rating review ›</Link>
            <Link className="btn" href={`/admin/history?night=${c.id}`}>History ›</Link>
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
          {roundOnePlayedOut && (
            <div className="notice small">
              Every round-one match is finished.
              {waitingNames.length > 0 && <> Still waiting alone: {waitingNames.join(", ")}.</>} When nobody else is coming, tap No More Buy-Backs / Late Entries: everyone
              still alone gets a free pass and the bracket moves on.
            </div>
          )}
          {c.buybacks_open && (
            <div className="row">
              <Btn className={roundOnePlayedOut ? "primary" : ""} disabled={busy} pending={pending === "close"} onClick={closeBuybacks}>
                No More Buy-Backs / Late Entries
              </Btn>
              <Btn disabled={busy || waitingCount < 2} pending={pending === "force"} title={waitingCount < 2 ? "Needs 2 waiting players" : ""} onClick={forcePair}>
                Force Pair{waitingCount < 2 ? " (needs 2 waiting)" : ""}
              </Btn>
              {c.open_slots > 0 && (
                <Btn className="sm" disabled={busy} onClick={() => setDialog({ kind: "add" })}>
                  + Add late arrival
                </Btn>
              )}
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
          {c.status === "in_progress" && <p className="muted small">Start and Complete are on each box. Tap a box for the time limit, cancel start or to review a result.</p>}
          <BracketTree b={b} now={now} onSelect={c.status === "in_progress" ? (m) => setDialog({ kind: "match", id: m.id }) : undefined} actions={c.status === "in_progress" ? actions : undefined} />
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
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void endNight();
            }}
          >
            {pending === "end" && <Spinner />}End night here ›
          </a>
        )}
        {c.status === "in_progress" && (
          <a
            href="#"
            className="danger"
            style={{ color: "var(--red)" }}
            onClick={(e) => {
              e.preventDefault();
              abandon();
            }}
          >
            {pending === "abandon" && <Spinner />}Abandon night
          </a>
        )}
      </div>
      {dialog?.kind === "complete" || dialog?.kind === "correct" ? (
        <CompleteDialog m={dialog.m} b={b} mode={dialog.kind} onClose={() => setDialog(null)} onSaved={done} />
      ) : null}
      {selected && (
        // The same card as the list, with the same buttons, opened from the tree (spec 3.4).
        <div className="sheet-backdrop" onClick={busy ? undefined : () => setDialog(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2 style={{ margin: 0, border: 0 }}>
                {selected.label}
              </h2>
              <Btn className="sm" disabled={busy} onClick={() => setDialog(null)}>Close</Btn>
            </div>
            <MatchCard m={selected} now={now} actions={actions} />
          </div>
        </div>
      )}
      {dialog?.kind === "add" && <AddLateArrivalSheet b={b} onClose={() => setDialog(null)} onSaved={done} />}
      {confirmCard}
      {void refresh}
    </main>
  );
}

/**
 * "Add late arrival" (spec 3.4, rules 3, 8.3): a club player or a new one who was not in the draw joins
 * round one as a late arrival — not a buy-back, so they may still buy back once if they lose. A round-one
 * loser who changes their mind buys back through Review result on their match, so tonight's players are
 * left out of the list.
 */
function AddLateArrivalSheet({ b, onClose, onSaved }: { b: BracketPayload; onClose: () => void; onSaved: (msg: string | null, bracket: BracketPayload) => void }) {
  const [players, setPlayers] = useState<ClubPlayer[] | null>(null);
  const [playerId, setPlayerId] = useState("");
  // One tick decides the form: a club player off the list, or a brand-new player typed in. Only the
  // fields for the chosen one are shown, so there is nothing to get wrong on a phone at the table.
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRating, setNewRating] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => {
    void get<{ players: ClubPlayer[] }>("/api/admin/players").then((r) => setPlayers(r.players));
  }, []);
  const tonight = new Set(b.entries.map((e) => e.player_id));
  const choices = (players ?? []).filter((p) => p.active && !tonight.has(p.id));
  const save = () =>
    run(async () => {
      if (isNew && (!newName.trim() || newRating.trim() === "" || !Number.isInteger(Number(newRating)))) {
        throw new Error("Enter a name and a whole-number rating");
      }
      if (!isNew && !playerId) throw new Error("Choose a club player, or tick New player");
      const body = isNew ? { new_player: { name: newName.trim(), rating: Number(newRating) } } : { player_id: playerId };
      const r = await post<{ match_number: number | null; awaiting_in: number | null } & WithBracket>(`/api/admin/competitions/${b.competition!.id}/entries`, body);
      const B = b.competition!.bracket_size;
      onSaved(r.match_number ? `Placed into ${numberLabel(B, r.match_number)}.` : `Placed into ${numberLabel(B, r.awaiting_in!)}, awaiting an opponent.`, r.bracket);
    });
  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add late arrival</h2>
        <p className="muted small">
          A player who was not in the draw. Takes one open slot ({b.competition!.open_slots} left) and goes straight into the bracket: a random empty match while one exists, otherwise beside a random lone player. They can still buy back once if they lose. To buy back a round-one loser, open Review result on their match.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={isNew}
            disabled={busy}
            onChange={(e) => {
              setIsNew(e.target.checked);
              // Switching sides clears the other one, so only what is on screen is ever sent.
              if (e.target.checked) setPlayerId("");
              else {
                setNewName("");
                setNewRating("");
              }
            }}
          />
          <span>New player — not on the club list</span>
        </label>
        {isNew ? (
          <>
            <label className="field">
              <span>Name</span>
              <input type="text" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} disabled={busy} />
            </label>
            <label className="field">
              <span>Rating (lower is better; negatives allowed)</span>
              <input type="number" value={newRating} onChange={(e) => setNewRating(e.target.value)} disabled={busy} />
            </label>
            <p className="muted small">They are added to the club player list as well, so they are on it next week.</p>
          </>
        ) : (
          <label className="field">
            <span>Club player</span>
            <span className="select-wrap" style={{ display: "block" }}>
              <select value={playerId} disabled={busy || players === null} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">{players === null ? "Loading players…" : "— choose —"}</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.rating})
                  </option>
                ))}
              </select>
              {players === null && <Spinner />}
            </span>
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <div className="row">
          <Btn className="primary" disabled={busy} pending={busy} onClick={save}>Add</Btn>
          <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
