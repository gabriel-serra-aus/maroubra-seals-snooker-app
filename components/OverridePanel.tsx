"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BracketPayload, EntryView, MatchView } from "@/lib/bracket/payload";
import { Btn, Spinner } from "./Btn";
import { useDialog } from "./Dialog";
import { call, get, post } from "./client/api";
import { fmtDateTime, fmtRating } from "./client/format";
import { useAction, usePoll } from "./client/hooks";

interface ActionRow {
  id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}
interface OverrideReply {
  changes: string[];
}
type ClubPlayer = { id: string; name: string; rating: number; active: boolean };

/** An override button: shows a spinner while its own action (keyed by its label) is in flight. */
function ActBtn({ label, pending, busy, className, disabled, onClick, children }: { label: string; pending: string | null; busy: boolean; className?: string; disabled?: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <Btn className={className} disabled={busy || disabled} pending={pending === label} onClick={onClick} title={label}>
      {children ?? label}
    </Btn>
  );
}

function positionLabel(e: EntryView, b: BracketPayload): string {
  const p = e.position;
  if (p.status === "winner") return "winner";
  if (p.status === "out") return `out (R${p.round})`;
  if (p.status === "in_match") {
    const m = b.rounds.flatMap((r) => r.matches).find((x) => x.id === p.matchId);
    return m ? `${m.label} (${m.state.replace("_", " ")})` : "in a match";
  }
  return `waiting R${p.round}${e.slot ? `, slot ${e.slot}` : ""}`;
}

/** Master override (spec 3.9, O-5): everything the normal screens refuse, each confirmed and logged. */
export function OverridePanel({ initial, initialActions }: { initial: BracketPayload; initialActions: ActionRow[] }) {
  const router = useRouter();
  const { data: b, refresh } = usePoll<BracketPayload>("/api/admin/bracket", 5_000, initial);
  const [actions, setActions] = useState(initialActions);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, pending, error, run, setError } = useAction();
  // Every override is confirmed in the app's own card, never a browser dialog (spec 3.5, 7.6).
  const { ask, dialog: confirmCard } = useDialog();
  const [players, setPlayers] = useState<ClubPlayer[] | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [addId, setAddId] = useState("");
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [grantId, setGrantId] = useState("");
  const c = b.competition;

  if (!c) {
    return (
      <main className="narrow">
        <h1>Master override</h1>
        <p className="muted">No competition is running.</p>
        <Link href="/admin/setup">Set up a competition ›</Link>
      </main>
    );
  }
  const compId = c.id;
  const waiting = b.entries.filter((e) => e.position.status === "waiting");
  const allMatches = b.rounds.flatMap((r) => r.matches);
  const freePasses = b.rounds.flatMap((r) => r.free_passes.map((fp) => ({ ...fp, round: r.round })));

  /** Dry run → confirmation listing every consequence → the real thing (spec 7.6). */
  const override = (label: string, method: string, path: string, body: Record<string, unknown> = {}) =>
    run(async () => {
      const dry = await call<OverrideReply>(method, path, { ...body, dry_run: true });
      const ok = await ask({
        title: `${label}?`,
        body: "This override skips the normal checks. It will:",
        points: dry.changes.length ? dry.changes : ["(no change to matches or entries)"],
        note: "Every override is logged against your name.",
        confirm: label,
        danger: true,
      });
      if (!ok) return;
      const real = await call<OverrideReply>(method, path, body);
      setNotice(`${label}: done. ${real.changes.join("; ")}`);
      await refresh();
      setActions((await get<{ actions: ActionRow[] }>(`/api/admin/competitions/${compId}/admin-actions`)).actions);
    }, label);

  const loadPlayers = () => {
    if (players !== null || loadingPlayers) return;
    setLoadingPlayers(true);
    void get<{ players: ClubPlayer[] }>("/api/admin/players")
      .then((r) => setPlayers(r.players))
      .finally(() => setLoadingPlayers(false));
  };
  const livePlayerIds = new Set(b.entries.filter((e) => e.position.status !== "out").map((e) => e.player_id));

  return (
    <main className="medium">
      <h1>Master override</h1>
      <div className="notice">⚠ These actions skip the normal checks. Each one asks for confirmation and is logged.</div>
      {notice && <div className="info" onClick={() => setNotice(null)}>{notice}</div>}
      {error && <div className="error" onClick={() => setError(null)}>{error}</div>}

      <h2>Players tonight</h2>
      <div className="card">
        <div className="row">
          <span className="select-wrap">
            <select value={addId} onFocus={loadPlayers} onChange={(e) => setAddId(e.target.value)}>
              <option value="">{loadingPlayers ? "Loading players…" : "+ Add a player to the night…"}</option>
              {(players ?? []).filter((p) => !livePlayerIds.has(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({fmtRating(p.rating)})</option>
              ))}
            </select>
            {loadingPlayers && <Spinner />}
          </span>
          <ActBtn label="Add a player to the night" pending={pending} busy={busy} className="sm" disabled={!addId} onClick={() => override("Add a player to the night", "POST", `/api/admin/competitions/${compId}/override/entries`, { player_id: addId }).then(() => setAddId(""))}>Add</ActBtn>
        </div>
        <table>
          <tbody>
            {b.entries.map((e) => (
              <tr key={e.entry_id}>
                <td>{e.name} {e.source === "buyback" && <span className="tag buyback">buy-back</span>}{e.source === "late" && <span className="tag late">late arrival</span>}</td>
                <td className="muted small">{positionLabel(e, b)}</td>
                <td className="num">
                  {e.position.status !== "out" && (
                    <ActBtn label={`Remove ${e.name} from the night`} pending={pending} busy={busy} className="sm danger" onClick={() => override(`Remove ${e.name} from the night`, "DELETE", `/api/admin/competitions/${compId}/override/entries/${e.entry_id}`)}>Remove</ActBtn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Matches</h2>
      <div className="card">
        {allMatches.length === 0 && <p className="muted">No matches.</p>}
        {allMatches.map((m) => (
          <MatchRow key={m.id} m={m} waiting={waiting.filter((w) => w.position.round === m.round)} busy={busy} pending={pending} override={override} />
        ))}
        <h3>Pair two waiting players</h3>
        <p className="muted small">From round two the two must share the same place in the tree (spec 5.4); in round one any two waiting players can be paired.</p>
        <div className="row">
          <select value={pairA} onChange={(e) => setPairA(e.target.value)} style={{ flex: 1 }}>
            <option value="">first…</option>
            {waiting.map((w) => <option key={w.entry_id} value={w.entry_id}>{w.name} (R{w.position.round})</option>)}
          </select>
          <select value={pairB} onChange={(e) => setPairB(e.target.value)} style={{ flex: 1 }}>
            <option value="">second…</option>
            {waiting.filter((w) => w.entry_id !== pairA).map((w) => <option key={w.entry_id} value={w.entry_id}>{w.name} (R{w.position.round})</option>)}
          </select>
          <ActBtn label="Pair two waiting players" pending={pending} busy={busy} className="sm" disabled={!pairA || !pairB} onClick={() => override("Pair two waiting players", "POST", `/api/admin/competitions/${compId}/override/pair`, { entry_id_a: pairA, entry_id_b: pairB }).then(() => { setPairA(""); setPairB(""); })}>Pair</ActBtn>
        </div>
      </div>

      <h2>Free passes</h2>
      <div className="card">
        {freePasses.length === 0 && <p className="muted">None.</p>}
        <ul className="plain">
          {freePasses.map((fp) => (
            <li key={fp.id}>
              <span>{fp.entry.name} → R{fp.round + 1}</span>
              <ActBtn label={`Revoke the free pass for ${fp.entry.name}`} pending={pending} busy={busy} className="sm danger" onClick={() => override(`Revoke the free pass for ${fp.entry.name}`, "DELETE", `/api/admin/competitions/${compId}/override/free-pass/${fp.id}`)}>Revoke</ActBtn>
            </li>
          ))}
        </ul>
        <div className="row">
          <select value={grantId} onChange={(e) => setGrantId(e.target.value)} style={{ flex: 1 }}>
            <option value="">+ Grant a free pass to…</option>
            {waiting.map((w) => <option key={w.entry_id} value={w.entry_id}>{w.name} (waiting R{w.position.round})</option>)}
          </select>
          <Btn
            className="sm"
            disabled={busy || !grantId}
            pending={pending?.startsWith("Grant ") ?? false}
            onClick={() => {
              const w = waiting.find((x) => x.entry_id === grantId)!;
              void override(`Grant ${w.name} a free pass to round ${w.position.round + 1}`, "POST", `/api/admin/competitions/${compId}/override/free-pass`, { entry_id: grantId, from_round: w.position.round }).then(() => setGrantId(""));
            }}
          >
            Grant
          </Btn>
        </div>
      </div>

      <h2>The night</h2>
      <div className="card row">
        <ActBtn label="Reopen buy-backs" pending={pending} busy={busy} disabled={c.buybacks_open || c.current_round !== 1} onClick={() => override("Reopen buy-backs", "POST", `/api/admin/competitions/${compId}/override/reopen-buybacks`)} />
        <ActBtn label="Grow bracket 16 → 32" pending={pending} busy={busy} disabled={c.bracket_size !== 16} onClick={() => override("Grow bracket 16 → 32", "POST", `/api/admin/competitions/${compId}/override/grow-bracket`)} />
        {c.status === "in_progress" && (
          <Btn
            className="danger"
            disabled={busy}
            pending={pending === "abandon"}
            onClick={() => {
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
            }}
          >
            Abandon this competition
          </Btn>
        )}
      </div>

      <h2>Recent overrides</h2>
      {actions.length === 0 ? (
        <p className="muted">Nothing yet tonight.</p>
      ) : (
        <ul className="plain small">
          {actions.map((a) => (
            <li key={a.id}>
              <span>
                <span className="muted">{fmtDateTime(a.created_at)}</span> {a.actor} · {a.action.replace(/_/g, " ")}
                {" "}<span className="muted">{summarise(a.details)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="footer-links" style={{ marginTop: 16 }}>
        <Link href="/admin">‹ Bracket</Link>
        <Link href="/admin/settings">Settings ›</Link>
      </p>
      {confirmCard}
    </main>
  );
}

function summarise(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([k]) => k !== "entry")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}

function MatchRow({ m, waiting, busy, pending, override }: { m: MatchView; waiting: EntryView[]; busy: boolean; pending: string | null; override: (label: string, method: string, path: string, body?: Record<string, unknown>) => Promise<boolean> }) {
  const [side, setSide] = useState<"a" | "b">("a");
  const [replacement, setReplacement] = useState("");
  const stateIcon = m.state === "in_play" ? "●" : m.state === "finished" ? "■" : "○";
  return (
    <div className={`match ${m.state}`} style={{ margin: "6px 0" }}>
      <div className="head">
        <span>{m.label} <span className={`state ${m.state}`}>{stateIcon} {m.state.replace("_", " ")}</span></span>
        <span className="row">
          <ActBtn label={`Reset ${m.label} to not started`} pending={pending} busy={busy} className="sm" disabled={m.state === "not_started"} onClick={() => override(`Reset ${m.label} to not started`, "POST", `/api/admin/matches/${m.id}/override/reset`)}>Reset</ActBtn>
          {m.round === 1 && <ActBtn label={`Delete ${m.label}`} pending={pending} busy={busy} className="sm danger" onClick={() => override(`Delete ${m.label}`, "DELETE", `/api/admin/matches/${m.id}/override`)}>Delete</ActBtn>}
        </span>
      </div>
      <div className="small">{m.a.name}{m.winner_id === m.a.entry_id ? " ✔" : ""} v {m.b.name}{m.winner_id === m.b.entry_id ? " ✔" : ""}</div>
      {m.state !== "finished" && waiting.length > 0 && (
        <div className="row small" style={{ marginTop: 4 }}>
          Replace
          <select value={side} onChange={(e) => setSide(e.target.value as "a" | "b")}>
            <option value="a">{m.a.name}</option>
            <option value="b">{m.b.name}</option>
          </select>
          with
          <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
            <option value="">waiting player…</option>
            {waiting.map((w) => <option key={w.entry_id} value={w.entry_id}>{w.name}</option>)}
          </select>
          <ActBtn label={`Replace a player in ${m.label}`} pending={pending} busy={busy} className="sm" disabled={!replacement} onClick={() => override(`Replace a player in ${m.label}`, "POST", `/api/admin/matches/${m.id}/override/replace-player`, { slot: side, entry_id: replacement }).then(() => setReplacement(""))}>Go</ActBtn>
        </div>
      )}
    </div>
  );
}
