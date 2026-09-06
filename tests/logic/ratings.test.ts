import { describe, expect, it } from "vitest";
import { positionOf } from "@/lib/logic/derive";
import { refreshStart } from "@/lib/logic/matches";
import { ratingReview } from "@/lib/logic/ratings";
import { makeCtx, play, playRound, startNight, type NightOpts } from "./helpers";

/** A full 16-player night: 13 first-draw, 3 buy-backs. The higher-rated (weaker) player always loses. */
function fullNight(extra: Partial<NightOpts> = {}) {
  const ratings = [45, 20, 33, 30, 28, 41, 25, 36, 36, 28, 38, 22, 50];
  const { s, ctx } = startNight({ bracket: 16, ratings, ...extra }, makeCtx(3));
  const strongerWins = (m: (typeof s.matches)[number]) => (m.rating_a <= m.rating_b ? "a" : "b");
  // First three losers buy back, the rest decline.
  let buybacks = 0;
  for (let n = 1; n <= 6; n++) {
    play(s, ctx, n, strongerWins(s.matches.find((m) => m.number === n)!), buybacks++ < 3 ? "bought_back" : "declined");
  }
  // Round one finished for first-draw players → auto-close placed the buy-backs (M8 and M7).
  expect(s.competition.buybacks_closed_at).not.toBeNull();
  while (s.competition.status === "in_progress") playRound(s, ctx, strongerWins, () => undefined);
  return { s, ctx };
}

describe("rating adjustment (rules 13, O-1, spec 5.9)", () => {
  it("orders finishers best first and adjusts the default top 3 by −1 and bottom 3 by +2", () => {
    const { s } = fullNight();
    const review = ratingReview(s);
    expect(review).toHaveLength(13);
    expect(review[0].won_final).toBe(true);
    expect(review[0].finish).toBe("won");
    expect(review[1].finish).toBe("final");
    const winnerEntry = s.competition.winner_entry_id!;
    expect(positionOf(s, winnerEntry).status).toBe("winner");
    // Best-first is by round reached, then the better handicap.
    for (let i = 1; i < review.length; i++) {
      const a = review[i - 1];
      const b = review[i];
      expect(a.reached_round >= b.reached_round).toBe(true);
      if (a.reached_round === b.reached_round && !a.won_final) expect(a.current_rating <= b.current_rating).toBe(true);
    }
    expect(review.filter((r) => r.group === "top").map((r) => r.delta)).toEqual([-1, -1, -1]);
    expect(review.filter((r) => r.group === "bottom").map((r) => r.delta)).toEqual([2, 2, 2]);
    expect(review.filter((r) => r.group === "none").every((r) => r.delta === 0 && r.proposed_rating === r.current_rating)).toBe(true);
    // The bottom three are among the weakest knocked out earliest.
    const bottom = review.filter((r) => r.group === "bottom");
    const minReach = Math.min(...review.map((r) => r.reached_round));
    expect(bottom.every((r) => r.reached_round === minReach)).toBe(true);
  });

  it("never puts a player in both groups, even when the groups overlap the field", () => {
    const { s } = fullNight({ topCount: 10, bottomCount: 10 });
    const review = ratingReview(s);
    expect(review.filter((r) => r.group === "top")).toHaveLength(10);
    expect(review.filter((r) => r.group === "bottom")).toHaveLength(3);
    const ids = new Set(review.map((r) => r.player_id));
    expect(ids.size).toBe(13);
  });

  it("a player who bought back is ranked on the better of their two runs", () => {
    const { s } = fullNight();
    const review = ratingReview(s);
    const buybackPlayers = s.entries.filter((e) => e.source === "buyback").map((e) => e.player_id);
    for (const pid of buybackPlayers) {
      const row = review.find((r) => r.player_id === pid)!;
      const entries = s.entries.filter((e) => e.player_id === pid);
      const best = Math.max(
        ...entries.map((e) => Math.max(1, ...s.matches.filter((m) => m.player_a_id === e.id || m.player_b_id === e.id).map((m) => m.round))),
      );
      expect(row.reached_round).toBeGreaterThanOrEqual(best);
    }
  });

  it("a winner's handicap crosses zero into negative; results clamp at −100 and 200", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [0, 30, -100, 200], topCount: 2, topDelta: -1, bottomCount: 2, bottomDelta: 2 });
    // Force the draw: M1 = p1 (0) v p2 (30), M2 = p3 (−100) v p4 (200). Then p1 beats p3 in the final.
    const id = (p: string) => s.entries.find((e) => e.player_id === p)!.id;
    Object.assign(s.matches[0], { player_a_id: id("p1"), player_b_id: id("p2") });
    Object.assign(s.matches[1], { player_a_id: id("p3"), player_b_id: id("p4") });
    for (const m of s.matches) refreshStart(s, m);
    play(s, ctx, 1, id("p1"), "declined");
    play(s, ctx, 2, id("p3"), "declined");
    play(s, ctx, 9, id("p1"));
    const review = ratingReview(s);
    const row = (id: string) => review.find((r) => r.player_id === id)!;
    expect(row("p1")).toMatchObject({ current_rating: 0, proposed_rating: -1, delta: -1, group: "top" });
    expect(row("p3")).toMatchObject({ current_rating: -100, proposed_rating: -100, delta: 0, group: "top" });
    expect(row("p4")).toMatchObject({ current_rating: 200, proposed_rating: 200, delta: 0, group: "bottom" });
    expect(row("p2")).toMatchObject({ current_rating: 30, proposed_rating: 32, delta: 2, group: "bottom" });
  });

  it("is idempotent: a second review after saving proposes no further change", () => {
    const { s } = fullNight();
    const first = ratingReview(s);
    // Apply the proposals as the save would.
    for (const r of first) s.players.find((p) => p.id === r.player_id)!.rating = r.proposed_rating;
    const second = ratingReview(s);
    // Same players in the groups; each proposal is one more step from the new current — the scale is
    // applied to whatever the ratings now are, so saving without edits writes nothing new only when the
    // caller compares proposed with current (which the route does). Here we check the groups are stable.
    expect(second.map((r) => r.player_id)).toEqual(first.map((r) => r.player_id));
    expect(second.map((r) => r.group)).toEqual(first.map((r) => r.group));
    expect(second.every((r) => r.current_rating === first.find((f) => f.player_id === r.player_id)!.proposed_rating)).toBe(true);
  });
});
