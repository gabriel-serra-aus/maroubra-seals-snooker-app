"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BracketPayload } from "@/lib/bracket/payload";
import { Btn } from "./Btn";
import { useDialog } from "./Dialog";
import { del, patch, post } from "./client/api";
import { fmtRating } from "./client/format";
import { useAction } from "./client/hooks";
import { AddSheet, type ClubPlayer } from "./PlayersAdmin";

export interface SetupDefaults {
  name: string;
}

type WithBracket = { bracket: BracketPayload };

/**
 * Competition setup and draw (spec 3.3): club players on the left, tonight's list on the right. Tick as
 * many as you like and move them across in one request; every reply carries the bracket, so the screen
 * never fetches again. The time limit and rating scale live on the settings page (3.10).
 */
export function SetupForm({ competition, players, defaults }: { competition: BracketPayload | null; players: ClubPlayer[]; defaults: SetupDefaults }) {
  const router = useRouter();
  const [comp, setComp] = useState<BracketPayload | null>(competition);
  const c = comp?.competition ?? null;
  const [name, setName] = useState(c?.name ?? defaults.name);
  const [sizeChoice, setSizeChoice] = useState<number>(c?.bracket_size ?? 16);
  const [clubPlayers, setClubPlayers] = useState(players);
  const [q, setQ] = useState("");
  const [pickedIn, setPickedIn] = useState<Set<string>>(new Set()); // player ids, left list
  const [pickedOut, setPickedOut] = useState<Set<string>>(new Set()); // entry ids, right list
  const [adding, setAdding] = useState(false);
  const { busy, isPending, error, run, setError } = useAction();
  // Confirmations are the app's own centred card, never a browser dialog (spec 3.5).
  const { ask, dialog: confirmCard } = useDialog();

  const entries = comp?.entries ?? [];
  const entered = new Set(entries.map((e) => e.player_id));
  const n = entries.length;
  const B = c?.bracket_size ?? sizeChoice;
  const needle = q.trim().toLowerCase();
  const available = clubPlayers.filter((p) => p.active && !entered.has(p.id) && (!needle || p.name.toLowerCase().includes(needle)));
  const room = B - n;

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const create = () =>
    run(async () => {
      const r = await post<WithBracket>("/api/admin/competitions", { name: name.trim() || defaults.name, bracket_size: sizeChoice });
      setComp(r.bracket);
    }, "create");

  const saveName = () => {
    if (!c || name.trim() === c.name || !name.trim()) return;
    void run(async () => setComp((await patch<WithBracket>(`/api/admin/competitions/${c.id}`, { name: name.trim() })).bracket), "name");
  };

  const chooseSize = (s: number) => {
    setSizeChoice(s);
    if (c) void run(async () => setComp((await patch<WithBracket>(`/api/admin/competitions/${c.id}`, { bracket_size: s })).bracket), "size");
  };

  const addPlayers = (ids: string[]) =>
    run(async () => {
      if (!c || ids.length === 0) return;
      setComp((await post<WithBracket>(`/api/admin/competitions/${c.id}/entries`, { player_ids: ids })).bracket);
      setPickedIn(new Set());
    }, "add");

  const removePlayers = () =>
    run(async () => {
      if (!c || pickedOut.size === 0) return;
      setComp((await del<WithBracket>(`/api/admin/competitions/${c.id}/entries`, { entry_ids: Array.from(pickedOut) })).bracket);
      setPickedOut(new Set());
    }, "remove");

  const start = () => {
    if (!c) return;
    void (async () => {
      const ok = await ask({
        title: `Start with ${n} player${n === 1 ? "" : "s"} in a ${B} bracket?`,
        body: "The draw is made now and the night begins.",
        points: [
          "The bracket size cannot be changed afterwards (§8.1).",
          `${B - n} open slot${B - n === 1 ? "" : "s"} are held for buy-backs and late arrivals.`,
          "From here players can only join as a buy-back or a late arrival.",
        ],
        confirm: "Start the night",
        cancel: "Not yet",
      });
      if (!ok) return;
      void run(async () => {
        await post(`/api/admin/competitions/${c.id}/start`);
        router.push("/admin");
      }, "start");
    })();
  };

  const abandonSetup = () => {
    if (!c) return;
    void (async () => {
      const ok = await ask({
        title: `Discard this setup (${c.name})?`,
        body: "The night has not started, so nothing is lost. A new competition can be set up straight away.",
        confirm: "Discard the setup",
        cancel: "Keep it",
        danger: true,
      });
      if (!ok) return;
      void run(async () => {
        await post(`/api/admin/competitions/${c.id}/abandon`);
        setComp(null);
        setName(defaults.name);
        setPickedIn(new Set());
        setPickedOut(new Set());
      }, "discard");
    })();
  };

  const matches = Math.floor(n / 2);
  const waiting = n % 2;
  const open = B - n;

  return (
    <main className="medium">
      <h1>Tonight&apos;s competition</h1>
      {!c && <p className="muted">Choose the settings, then set up the competition to pick tonight&apos;s players.</p>}
      <div className="card stack">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 260px", margin: 0 }}>
            <span>Name</span>
            <input type="text" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
          <div className="field" style={{ margin: 0 }}>
            <span className="muted small">Bracket size</span>
            <div className="row">
              {[16, 32].map((s) => (
                <label key={s} className="radio" style={{ padding: "8px 4px" }}>
                  <input type="radio" checked={B === s} disabled={busy || n > s} onChange={() => chooseSize(s)} /> {s}
                </label>
              ))}
              {isPending("size") && <span className="spinner" />}
            </div>
          </div>
        </div>
        {c && (
          <p className="muted small">
            Match time limit: <strong>{c.default_time_limit_minutes} min</strong>. Tables: <strong>{c.table_count}</strong>. Rating adjustment: top {c.rating_top_count} by {c.rating_top_delta}, bottom {c.rating_bottom_count} by +{c.rating_bottom_delta}.{" "}
            <Link href="/admin/settings">Change ›</Link>
          </p>
        )}
        {!c && (
          <Btn className="primary wide" disabled={busy} pending={isPending("create")} onClick={create}>
            Set up tonight&apos;s competition
          </Btn>
        )}
      </div>
      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {c && (
        <>
          <div className="picker" style={{ marginTop: 12 }}>
            <div className="card">
              <div className="row between">
                <strong>Club players</strong>
                <span className="muted">{available.length} available</span>
              </div>
              <input type="search" placeholder="Find a player…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 6 }} />
              <ul className="pick-list" aria-label="Club players">
                {available.length === 0 && <li className="empty">{needle ? "No one matches." : "Everyone is in."}</li>}
                {available.map((p) => (
                  <li key={p.id} className={pickedIn.has(p.id) ? "on" : ""}>
                    <label>
                      <input type="checkbox" checked={pickedIn.has(p.id)} disabled={busy} onChange={() => setPickedIn((s) => toggle(s, p.id))} />
                      {p.name}
                      <span className="rating">{fmtRating(p.rating)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="row between">
                <Btn
                  className="primary"
                  disabled={busy || pickedIn.size === 0 || pickedIn.size > room}
                  pending={isPending("add")}
                  title={pickedIn.size > room ? `Only ${room} slot${room === 1 ? "" : "s"} left in a ${B} bracket` : ""}
                  onClick={() => addPlayers(Array.from(pickedIn))}
                >
                  Add{pickedIn.size ? ` ${pickedIn.size}` : ""} ›
                </Btn>
                <Btn className="sm" disabled={busy} onClick={() => setAdding(true)}>
                  + New player
                </Btn>
              </div>
              {pickedIn.size > room && <p className="error small">Only {room} slot{room === 1 ? "" : "s"} left — choose the 32 bracket or pick fewer.</p>}
            </div>
            <div className="card">
              <div className="row between">
                <strong>Tonight</strong>
                <span className="muted">
                  {n} of {B}
                </span>
              </div>
              <ul className="pick-list" aria-label="Tonight's players" style={{ marginTop: 6 }}>
                {entries.length === 0 && <li className="empty">Nobody yet — pick players on the left and add them.</li>}
                {entries.map((e) => (
                  <li key={e.entry_id} className={pickedOut.has(e.entry_id) ? "on" : ""}>
                    <label>
                      <input type="checkbox" checked={pickedOut.has(e.entry_id)} disabled={busy} onChange={() => setPickedOut((s) => toggle(s, e.entry_id))} />
                      {e.name}
                      <span className="rating">{fmtRating(e.rating)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <Btn disabled={busy || pickedOut.size === 0} pending={isPending("remove")} onClick={removePlayers}>
                ‹ Remove{pickedOut.size ? ` ${pickedOut.size}` : ""}
              </Btn>
            </div>
          </div>
          <p>
            <strong>
              {n} player{n === 1 ? "" : "s"}
            </strong>{" "}
            → {matches} match{matches === 1 ? "" : "es"}
            {waiting ? ", 1 waiting player" : ""}, {open} open slot{open === 1 ? "" : "s"} for buy-backs
          </p>
          {n > B && <div className="error">More players than slots — choose the 32 bracket.</div>}
          <Btn className="primary wide" disabled={busy || n < 2 || n > B} pending={isPending("start")} onClick={start}>
            Start Competition
          </Btn>
          <p className="small" style={{ marginTop: 16 }}>
            <a
              href="#"
              style={{ color: "var(--red)" }}
              onClick={(e) => {
                e.preventDefault();
                abandonSetup();
              }}
            >
              {isPending("discard") && <span className="spinner" />}Discard this setup
            </a>
          </p>
        </>
      )}
      <p className="footer-links small">
        <Link href="/admin/settings">Settings ›</Link>
      </p>
      {confirmCard}
      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onSaved={async (p) => {
            setAdding(false);
            setClubPlayers((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
            if (c) await addPlayers([p.id]);
          }}
        />
      )}
    </main>
  );
}
