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
export const MODE_LABEL = { random_draw: "Random Draw", sequential: "Sequential Pairing" } as const;
export const DECISION_LABEL = { bought_back: "bought back", declined: "declined", no_slots: "out — no slots left" } as const;
