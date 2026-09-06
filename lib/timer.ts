// Timer arithmetic (rules 12, spec 5.12). Nothing is stored but started_at and the limit; everything else
// is subtraction, done on whichever device is looking.

export interface Clock {
  ends_at: number;
  remaining_ms: number;
  timed_out: boolean;
}

export function matchClock(startedAtIso: string | null, limitMinutes: number, nowMs: number): Clock | null {
  if (!startedAtIso) return null;
  const started = Date.parse(startedAtIso);
  const ends_at = started + limitMinutes * 60_000;
  const remaining_ms = Math.max(0, ends_at - nowMs);
  return { ends_at, remaining_ms, timed_out: nowMs >= ends_at };
}

/** mm:ss, never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** The phone's clock may be wrong: offset it by the server time sent in the same response. */
export function serverOffsetMs(serverNowIso: string, clientNowMs = Date.now()): number {
  return Date.parse(serverNowIso) - clientNowMs;
}
