"use client";

import { useEffect, useRef, useState } from "react";
import { matchClock } from "@/lib/timer";
import type { MatchView } from "@/lib/bracket/payload";

// Phones only allow sound after a tap (spec 3.6). Any tap on an admin page unlocks it; a fresh page load
// with matches already running shows a one-time "Enable sound" prompt.
let unlocked = false;
const listeners = new Set<() => void>();

export function soundUnlocked() {
  return unlocked;
}

export function unlockSound() {
  if (unlocked) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlocked = true;
    listeners.forEach((l) => l());
  } catch {
    // no speech support — the visual warning still shows
  }
}

/** The voice alert (rules 12): "Match timed out". */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-AU";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function useSoundUnlocked() {
  const [state, setState] = useState(unlocked);
  useEffect(() => {
    const l = () => setState(true);
    listeners.add(l);
    // Any tap on the page counts (pressing Start does), so listen once.
    const onTap = () => unlockSound();
    window.addEventListener("pointerdown", onTap, { once: true, passive: true });
    return () => {
      listeners.delete(l);
      window.removeEventListener("pointerdown", onTap);
    };
  }, []);
  return state;
}

/**
 * Plays the alert once per match per page load when its clock is seen to reach zero (spec 5.12), including
 * the first look after the phone comes back from being locked. Only on admin pages.
 */
export function useTimeoutAlert(matches: MatchView[], now: number, enabled: boolean) {
  const alerted = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    for (const m of matches) {
      if (m.state !== "in_play") continue;
      const c = matchClock(m.started_at, m.time_limit_minutes, now);
      if (c?.timed_out && !alerted.current.has(m.id)) {
        alerted.current.add(m.id);
        speak("Match timed out");
      }
    }
  }, [matches, now, enabled]);
}
