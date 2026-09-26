"use client";

import { useEffect, useRef, useState } from "react";
import { matchClock } from "@/lib/timer";
import type { MatchView } from "@/lib/bracket/payload";
import { useStoredChoice } from "./hooks";

// Phones only allow sound after a tap (spec 3.6). Any tap on an admin page unlocks it; a fresh page load
// with matches already running shows a one-time "Enable sound" prompt.
//
// The alert is a tone made in the browser (Web Audio), not a voice and not a sound file (O-19): three
// bursts of three sharp beeps, loud and unlike anything else in a snooker room, so "time is up" is heard
// from across the tables. Nothing to download, nothing to host.
let ctx: AudioContext | null = null;
let unlocked = false;
const listeners = new Set<() => void>();

export function soundUnlocked() {
  return unlocked;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** Runs inside a tap: the only moment a phone lets a page start its audio. */
export function unlockSound() {
  const a = audio();
  if (!a) return; // no Web Audio: the visual warning still shows
  if (a.state === "suspended") void a.resume();
  if (unlocked) return;
  // One silent sample played inside the tap is what iOS needs before it will play anything later.
  const src = a.createBufferSource();
  src.buffer = a.createBuffer(1, 1, a.sampleRate);
  src.connect(a.destination);
  src.start();
  unlocked = true;
  listeners.forEach((l) => l());
}

/** The time-up alarm (rules 5, spec 5.12, O-19): beep-beep-beep, three times, about two seconds in all. */
export function playAlarm() {
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const t0 = a.currentTime + 0.05;
  for (let burst = 0; burst < 3; burst++) {
    for (let beep = 0; beep < 3; beep++) {
      const start = t0 + burst * 0.75 + beep * 0.18;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = "square";
      osc.frequency.value = 1320;
      // A quick rise and fall on every beep, so it is sharp but never clicks.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01);
      gain.gain.setValueAtTime(0.35, start + 0.11);
      gain.gain.linearRampToValueAtTime(0, start + 0.13);
      osc.connect(gain).connect(a.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    }
  }
}

/** Silences an alarm already playing: turning the sound off goes quiet at once. */
function stopAlarm() {
  if (!ctx) return;
  void ctx.close();
  ctx = null;
  unlocked = false;
}

/**
 * The sound switch (spec 3.6). Two things have to be true for the alarm to play: the browser has been
 * unlocked by a tap, and the organiser has not turned the sound off. The off choice is remembered on the
 * device, and while it stands no tap re-enables it.
 */
export function useSound(): { on: boolean; toggle: () => void } {
  const [pref, setPref] = useStoredChoice<"on" | "off">("sound", "on", "on");
  const [state, setState] = useState(unlocked);
  const wanted = pref === "on";
  useEffect(() => {
    if (!wanted) return;
    const l = () => setState(true);
    listeners.add(l);
    // Any tap on the page counts (pressing Start does), so listen once.
    const onTap = () => unlockSound();
    window.addEventListener("pointerdown", onTap, { once: true, passive: true });
    return () => {
      listeners.delete(l);
      window.removeEventListener("pointerdown", onTap);
    };
  }, [wanted]);
  const on = wanted && state;
  const toggle = () => {
    if (on) {
      // Turning it off mid-alarm should go quiet now, not after the beeps finish.
      stopAlarm();
      setPref("off");
    } else {
      setPref("on");
      // This runs inside the tap, which is what the browser wants.
      unlockSound();
      setState(unlocked);
    }
  };
  return { on, toggle };
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
        playAlarm();
      }
    }
  }, [matches, now, enabled]);
}
