"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BracketPayload } from "@/lib/bracket/payload";
import { Btn } from "./Btn";
import { patch } from "./client/api";
import { useAction } from "./client/hooks";

/** Settings (spec 3.10): the match time limit and the rating-adjustment scale, off the setup page. */
export function SettingsForm({ competition }: { competition: BracketPayload | null }) {
  const router = useRouter();
  const c = competition?.competition ?? null;
  const [form, setForm] = useState({
    default_time_limit_minutes: c?.default_time_limit_minutes ?? 25,
    rating_top_count: c?.rating_top_count ?? 3,
    rating_top_delta: c?.rating_top_delta ?? -1,
    rating_bottom_count: c?.rating_bottom_count ?? 3,
    rating_bottom_delta: c?.rating_bottom_delta ?? 2,
  });
  const { busy, error, run, setError } = useAction();
  const [saved, setSaved] = useState(false);
  const locked = c?.status !== "setup";

  const save = () =>
    run(async () => {
      if (!c) return;
      const body: Record<string, number> = { default_time_limit_minutes: form.default_time_limit_minutes };
      if (!locked) {
        body.rating_top_count = form.rating_top_count;
        body.rating_top_delta = form.rating_top_delta;
        body.rating_bottom_count = form.rating_bottom_count;
        body.rating_bottom_delta = form.rating_bottom_delta;
      }
      await patch(`/api/admin/competitions/${c.id}`, body);
      setSaved(true);
      router.refresh();
    });

  const num = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  };

  return (
    <main className="narrow">
      <h1>Settings</h1>
      {!c ? (
        <p className="muted">
          No competition is set up. <Link href="/admin/setup">Set up tonight&apos;s competition</Link> first; a new night starts with the previous night&apos;s settings.
        </p>
      ) : (
        <div className="card stack">
          <p className="muted small">Applies to <strong>{c.name}</strong>. A new night copies these values.</p>
          <label className="field">
            <span>Match time limit (minutes)</span>
            <input className="inline" type="number" min={1} max={180} value={form.default_time_limit_minutes} onChange={num("default_time_limit_minutes")} />
          </label>
          <div className="field">
            <span className="muted small">Rating adjustment (applied on the review after the night)</span>
            <div className="row">
              Top <input className="inline" type="number" min={0} disabled={locked} value={form.rating_top_count} onChange={num("rating_top_count")} /> finishers
              <input className="inline" type="number" disabled={locked} value={form.rating_top_delta} onChange={num("rating_top_delta")} /> each
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              Bottom <input className="inline" type="number" min={0} disabled={locked} value={form.rating_bottom_count} onChange={num("rating_bottom_count")} /> finishers
              <input className="inline" type="number" disabled={locked} value={form.rating_bottom_delta} onChange={num("rating_bottom_delta")} /> each
            </div>
            <p className="muted small">
              A good night brings your number down (−1), a bad night puts it up (+2).
              {locked && " The scale is locked once the night has started."}
            </p>
          </div>
          {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
          {saved && <div className="info">Saved.</div>}
          <Btn className="primary" disabled={busy} pending={busy} onClick={save}>Save</Btn>
        </div>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href="/admin/setup">‹ Setup</Link>
      </p>
    </main>
  );
}
