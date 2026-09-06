"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BracketPayload } from "@/lib/bracket/payload";
import { del, patch, post } from "./client/api";
import { fmtRating } from "./client/format";
import { useAction } from "./client/hooks";
import { AddSheet, type ClubPlayer } from "./PlayersAdmin";

export interface SetupDefaults {
  name: string;
  rating_top_count: number;
  rating_top_delta: number;
  rating_bottom_count: number;
  rating_bottom_delta: number;
}

/** Competition setup and draw (spec 3.3). */
export function SetupForm({ competition, players, defaults }: { competition: BracketPayload | null; players: ClubPlayer[]; defaults: SetupDefaults }) {
  const router = useRouter();
  const c = competition?.competition ?? null;
  const [form, setForm] = useState({
    name: c?.name ?? defaults.name,
    bracket_size: c?.bracket_size ?? 16,
    buyback_mode: c?.buyback_mode ?? "random_draw",
    default_time_limit_minutes: c?.default_time_limit_minutes ?? 25,
    rating_top_count: c?.rating_top_count ?? defaults.rating_top_count,
    rating_top_delta: c?.rating_top_delta ?? defaults.rating_top_delta,
    rating_bottom_count: c?.rating_bottom_count ?? defaults.rating_bottom_count,
    rating_bottom_delta: c?.rating_bottom_delta ?? defaults.rating_bottom_delta,
  });
  const [clubPlayers, setClubPlayers] = useState(players);
  const [adding, setAdding] = useState(false);
  const { busy, error, run, setError } = useAction();
  const entries = competition?.entries ?? [];
  const entered = new Map(entries.map((e) => [e.player_id, e.entry_id]));
  const n = entries.length;
  const B = form.bracket_size;

  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (c) {
      void run(async () => {
        await patch(`/api/admin/competitions/${c.id}`, { [key]: value });
        router.refresh();
      });
    }
  };

  const create = () =>
    run(async () => {
      await post("/api/admin/competitions", form);
      router.refresh();
    });

  const toggle = (p: ClubPlayer, on: boolean) =>
    run(async () => {
      if (!c) return;
      if (on) await post(`/api/admin/competitions/${c.id}/entries`, { player_id: p.id });
      else await del(`/api/admin/competitions/${c.id}/entries/${entered.get(p.id)}`);
      router.refresh();
    });

  const start = () => {
    if (!c) return;
    if (!confirm(`Start with ${n} players in a ${B} bracket? The bracket size cannot be changed afterwards.`)) return;
    void run(async () => {
      await post(`/api/admin/competitions/${c.id}/start`);
      router.push("/admin");
    });
  };

  const abandonSetup = () => {
    if (!c || !confirm(`Discard this setup (${c.name})? A new competition can be set up straight away.`)) return;
    void run(async () => {
      await post(`/api/admin/competitions/${c.id}/abandon`);
      router.refresh();
    });
  };

  const matches = Math.floor(n / 2);
  const waiting = n % 2;
  const open = B - n;

  return (
    <main>
      <h1>Tonight&apos;s competition</h1>
      {!c && <p className="muted">Choose the settings, then set up the competition to tick players in.</p>}
      <div className="card stack">
        <label className="field">
          <span>Name</span>
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onBlur={() => c && update("name", form.name)} />
        </label>
        <div className="field">
          <span className="muted small">Bracket size</span>
          {[16, 32].map((s) => (
            <label key={s} className="radio">
              <input type="radio" checked={B === s} disabled={n > s} onChange={() => update("bracket_size", s)} /> {s}
            </label>
          ))}
        </div>
        <div className="field">
          <span className="muted small">Buy-back mode</span>
          <label className="radio"><input type="radio" checked={form.buyback_mode === "random_draw"} onChange={() => update("buyback_mode", "random_draw")} /> Random Draw (default) — buy-backs are paired in one go when the window closes</label>
          <label className="radio"><input type="radio" checked={form.buyback_mode === "sequential"} onChange={() => update("buyback_mode", "sequential")} /> Sequential Pairing — a match forms as soon as two are waiting</label>
        </div>
        <label className="field">
          <span>Match time limit (minutes)</span>
          <input className="inline" type="number" min={1} max={180} value={form.default_time_limit_minutes} onChange={(e) => setForm((f) => ({ ...f, default_time_limit_minutes: Number(e.target.value) }))} onBlur={(e) => num(e.target.value) !== undefined && update("default_time_limit_minutes", Number(e.target.value))} />
        </label>
        <div className="field">
          <span className="muted small">Rating adjustment (applied on the review after the night)</span>
          <div className="row">
            Top <input className="inline" type="number" min={0} value={form.rating_top_count} onChange={(e) => setForm((f) => ({ ...f, rating_top_count: Number(e.target.value) }))} onBlur={(e) => update("rating_top_count", Number(e.target.value))} /> finishers
            <input className="inline" type="number" value={form.rating_top_delta} onChange={(e) => setForm((f) => ({ ...f, rating_top_delta: Number(e.target.value) }))} onBlur={(e) => update("rating_top_delta", Number(e.target.value))} /> each
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            Bottom <input className="inline" type="number" min={0} value={form.rating_bottom_count} onChange={(e) => setForm((f) => ({ ...f, rating_bottom_count: Number(e.target.value) }))} onBlur={(e) => update("rating_bottom_count", Number(e.target.value))} /> finishers
            <input className="inline" type="number" value={form.rating_bottom_delta} onChange={(e) => setForm((f) => ({ ...f, rating_bottom_delta: Number(e.target.value) }))} onBlur={(e) => update("rating_bottom_delta", Number(e.target.value))} /> each
          </div>
          <p className="muted small">A good night brings your number down (−1), a bad night puts it up (+2).</p>
        </div>
        {!c && <button className="btn primary wide" disabled={busy} onClick={create}>Set up tonight&apos;s competition</button>}
      </div>
      {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
      {c && (
        <>
          <div className="row between">
            <h2 style={{ border: 0, margin: "12px 0 4px" }}>Entered players</h2>
            <span className="muted">{n} of {B}</span>
          </div>
          <div className="card">
            {clubPlayers.filter((p) => p.active).map((p) => (
              <label key={p.id} className="radio">
                <input type="checkbox" checked={entered.has(p.id)} disabled={busy || (!entered.has(p.id) && n >= B)} onChange={(e) => toggle(p, e.target.checked)} /> {p.name} ({fmtRating(p.rating)})
              </label>
            ))}
            <button className="btn sm" onClick={() => setAdding(true)}>+ New player</button>
          </div>
          <p>
            <strong>{n} player{n === 1 ? "" : "s"}</strong> → {matches} match{matches === 1 ? "" : "es"}{waiting ? ", 1 waiting player" : ""}, {open} open slot{open === 1 ? "" : "s"} for buy-backs
          </p>
          {n > B && <div className="error">More players than slots — choose the 32 bracket.</div>}
          <button className="btn primary wide" disabled={busy || n < 2 || n > B} onClick={start}>Start Competition</button>
          <p className="small" style={{ marginTop: 16 }}>
            <a href="#" style={{ color: "var(--red)" }} onClick={(e) => { e.preventDefault(); abandonSetup(); }}>Discard this setup</a>
          </p>
        </>
      )}
      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onSaved={async (p) => {
            setAdding(false);
            setClubPlayers((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
            if (c) await toggle(p, true);
          }}
        />
      )}
    </main>
  );
}
