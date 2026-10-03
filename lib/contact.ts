// A player's contact details (spec 3.2, O-23): an optional Australian phone number and email, for the
// organiser's screens only. Stored in one tidy form so the same number never reads two ways.

/**
 * An Australian mobile (04…) or landline (02, 03, 07, 08), typed with or without +61, spaces, dashes,
 * dots or brackets. Returns "0412 345 678" or "02 9123 4567", or null if it isn't one.
 */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/[\s\-.()]/g, "");
  if (/^\+?61/.test(d)) d = "0" + d.replace(/^\+?61/, "").replace(/^0/, "");
  if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return null;
}

/** A plausible email address, lower-cased; null if it isn't one. Deliverability is not checked. */
export function normaliseEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
