const timeFmt = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
const dateTimeFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

export const fmtTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : "");
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "");

/** Ratings show their sign when negative; 0 stays 0. */
export const fmtRating = (r: number) => (r < 0 ? `−${Math.abs(r)}` : String(r));

export const fmtDelta = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");

export const STATE_LABEL = { not_started: "NOT STARTED", in_play: "IN PLAY", finished: "FINISHED" } as const;
export const DECISION_LABEL = { bought_back: "bought back", declined: "declined", no_slots: "out — no slots left" } as const;

/** What a Complete / Correct / Close reply says about where the winner went (spec 3.5). */
export interface WinnerTo {
  kind: "match" | "awaiting" | "free_pass" | "winner" | "out";
  round: number | null;
  match_number: number | null;
}

export function describeWinnerTo(name: string, w: WinnerTo | undefined): string | null {
  if (!w) return null;
  switch (w.kind) {
    case "match":
      return `${name} goes to M${w.match_number}.`;
    case "awaiting":
      return `${name} waits in round ${w.round} for an opponent.`;
    case "free_pass":
      return `${name} has a free pass to round ${w.round}.`;
    case "winner":
      return `${name} is the winner of the night.`;
    default:
      return null;
  }
}
