"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { serverOffsetMs } from "@/lib/timer";

/**
 * Polls a JSON URL every `intervalMs`, and again whenever the page becomes visible (a locked phone coming
 * back), so the clocks and results are current without the viewer doing anything (spec 3.8, 5.12).
 */
export function usePoll<T>(url: string, intervalMs: number, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        // Not a component, so no router: a full navigation to the login page is the honest fallback.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [url]);
  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);
  return { data, setData, refresh, error };
}

/** Server-corrected "now", ticking once a second. */
export function useServerClock(serverNowIso: string | undefined): number {
  // Recomputed whenever a response arrives; the render follows the fetch closely enough to be the receipt time.
  const offset = useMemo(() => (serverNowIso ? serverOffsetMs(serverNowIso) : 0), [serverNowIso]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now + offset;
}

/** Runs an async action with a busy flag and an error message the caller can show. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
