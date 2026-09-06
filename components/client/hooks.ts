"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { serverOffsetMs } from "@/lib/timer";

/**
 * Polls a JSON URL every `intervalMs`, and again whenever the page becomes visible (a locked phone coming
 * back), so the clocks and results are current without the viewer doing anything (spec 3.8, 5.12).
 * `setData` lets an action drop in the bracket its own reply carried, so nothing waits for a second fetch.
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

/**
 * A per-viewer preference kept in localStorage, which may be missing or blocked (private mode, a
 * thumbnail render): a module-level cache keeps the choice working for the session either way, and the
 * server render always sees the fallback so hydration matches.
 */
const choiceCache = new Map<string, string>();
const choiceListeners = new Set<() => void>();
function subscribeChoice(cb: () => void) {
  choiceListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    choiceListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useStoredChoice<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const read = useCallback((): T => {
    const cached = choiceCache.get(key);
    if (cached) return cached as T;
    try {
      return (window.localStorage.getItem(key) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribeChoice, read, () => fallback);
  const set = useCallback(
    (v: T) => {
      choiceCache.set(key, v);
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* storage blocked: the cache carries it for this visit */
      }
      for (const l of choiceListeners) l();
    },
    [key],
  );
  return [value, set];
}
