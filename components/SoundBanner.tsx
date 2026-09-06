"use client";

import { unlockSound } from "./client/sound";

/** One-time "Enable sound" prompt when the admin page is opened fresh while matches run (spec 3.6). */
export function SoundBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="notice row between">
      <span>Tap to enable the &quot;Match timed out&quot; voice alert.</span>
      <button className="btn sm" onClick={unlockSound}>Enable sound</button>
    </div>
  );
}
