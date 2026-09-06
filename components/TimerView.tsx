"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BracketPayload } from "@/lib/bracket/payload";
import { formatRemaining, matchClock } from "@/lib/timer";
import { CompleteDialog } from "./CompleteDialog";
import { SoundBanner } from "./SoundBanner";
import { post } from "./client/api";
import { fmtRating, fmtTime } from "./client/format";
import { useAction, usePoll, useServerClock } from "./client/hooks";
import { useSoundUnlocked, useTimeoutAlert } from "./client/sound";

/** Match timer view (spec 3.6): a big clock derived from the stored start time. */
export function TimerView({ matchId, initial }: { matchId: string; initial: BracketPayload }) {
  const router = useRouter();
  const { data: b, refresh } = usePoll<BracketPayload>("/api/admin/bracket", 5_000, initial);
  const now = useServerClock(b.server_now);
  const soundOn = useSoundUnlocked();
  const m = b.rounds.flatMap((r) => r.matches).find((x) => x.id === matchId);
  useTimeoutAlert(m ? [m] : [], now, soundOn);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  if (!m) {
    return (
      <main>
        <p className="muted">Match not found.</p>
        <Link href="/admin">‹ Bracket</Link>
      </main>
    );
  }
  const clock = m.state === "in_play" ? matchClock(m.started_at, m.time_limit_minutes, now) : null;
  const timedOut = clock?.timed_out ?? false;
  const starter = m.start_entry_id === m.a.entry_id ? m.a : m.start_entry_id === m.b.entry_id ? m.b : null;

  const cancelStart = () => {
    if (!confirm(`Cancel the start of ${m.label}? The clock is discarded and the match goes back to not started.`)) return;
    void run(async () => {
      await post(`/api/admin/matches/${m.id}/cancel-start`);
      router.push("/admin");
    });
  };

  return (
    <main>
      <div className="row between">
        <Link href="/admin">‹ Bracket</Link>
        <strong>{m.label} · Round {m.round}</strong>
      </div>
      <div className="center" style={{ marginTop: 16 }}>
        <div style={{ fontSize: "1.3rem" }}>{m.a.name} <span className="muted">({fmtRating(m.rating_a)})</span></div>
        <div className="muted">vs</div>
        <div style={{ fontSize: "1.3rem" }}>{m.b.name} <span className="muted">({fmtRating(m.rating_b)})</span></div>
        <div className="muted" style={{ marginTop: 4 }}>{starter ? `${starter.name} starts on ${m.start_points}` : "Level, no start"}</div>
      </div>
      <div className={`big-clock ${m.state} ${timedOut ? "timed-out" : ""}`}>
        {m.state === "in_play" && clock ? formatRemaining(clock.remaining_ms) : m.state === "finished" ? "■" : "—"}
      </div>
      <div className="center muted">
        {m.state === "in_play" && <>● IN PLAY · started {fmtTime(m.started_at)} · {m.time_limit_minutes} min limit</>}
        {m.state === "not_started" && <>○ NOT STARTED · {m.time_limit_minutes} min limit</>}
        {m.state === "finished" && <>■ FINISHED · winner {m.winner_id === m.a.entry_id ? m.a.name : m.b.name}</>}
      </div>
      {timedOut && (
        <div className="notice center">
          <strong>⚠ TIMED OUT.</strong> Player ahead on points wins; if level, a re-spotted black decides (rule 5).
        </div>
      )}
      <SoundBanner show={!soundOn && m.state === "in_play"} />
      {notice && <div className="info">{notice}</div>}
      {error && <div className="error">{error}</div>}
      {m.state === "in_play" && (
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary wide" disabled={busy} onClick={() => setDialog(true)}>Complete match</button>
          <button className="btn wide" disabled={busy} onClick={cancelStart}>⤺ Cancel start</button>
        </div>
      )}
      {m.state === "not_started" && (
        <button
          className="btn primary wide"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await post(`/api/admin/matches/${m.id}/start`);
              await refresh();
            })
          }
        >
          Start
        </button>
      )}
      {dialog && (
        <CompleteDialog
          m={m}
          b={b}
          mode="complete"
          onClose={() => setDialog(false)}
          onSaved={async (msg) => {
            setDialog(false);
            setNotice(msg);
            await refresh();
            router.push("/admin");
          }}
        />
      )}
    </main>
  );
}
