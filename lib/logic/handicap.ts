// Handicap start (rules 6, spec 5.6). A rating is a golf-style handicap: lower is better, negatives are
// normal. The weaker player — the HIGHER number — starts with two thirds of the difference, rounded.

export interface Start {
  /** Points the weaker player starts on; 0 when the ratings are equal. */
  points: number;
  /** Which side receives it: "a", "b", or null when equal. */
  to: "a" | "b" | null;
}

export function handicapStart(ratingA: number, ratingB: number): Start {
  const diff = Math.abs(ratingA - ratingB);
  const points = Math.round((2 * diff) / 3);
  if (points === 0) return { points: 0, to: null };
  return { points, to: ratingA > ratingB ? "a" : "b" };
}
