import { describe, expect, it } from "vitest";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { endCompetitionEarly } from "@/lib/logic/competition";
import { refreshPlayerStarts } from "@/lib/logic/matches";
import { ratingReview } from "@/lib/logic/ratings";
import { unplayedFinal } from "@/lib/logic/derive";
import { cancelStart } from "@/lib/logic/matchControl";
import { makeCtx, match, play, playRound, startNight, startOn } from "./helpers";

const RATINGS = [45, 20, 33, 30, 28, 41, 25, 36, 37, 29, 38, 22, 50, 10];

/**
 * 14 players in a 16 bracket: seven round-one matches and an empty M8. The losers of M1 and M2 buy back,
 * so both land in M8 and meet there (5.2); the rest decline. Player A always wins.
 */
function buybackNight() {
  const { s, ctx } = startNight({ bracket: 16, ratings: RATINGS }, makeCtx(5));
  const loserOf = (n: number) => match(s, n).player_b_id;
  const firstLosers = [loserOf(1), loserOf(2)];
  play(s, ctx, 1, "a", "bought_back");
  play(s, ctx, 2, "a", "bought_back");
  for (let n = 3; n <= 7; n++) play(s, ctx, n, "a", "declined");
  const m8 = match(s, 8);
  const lostAgain = s.entries.find((e) => e.id === m8.player_b_id)!.player_id;
  play(s, ctx, 8, "a");
  return { s, ctx, firstLosers, lostAgain };
}

const playerOf = (s: ReturnType<typeof buybackNight>["s"], entryId: string) => s.entries.find((e) => e.id === entryId)!.player_id;

describe("rating change by finishing position (O-24, spec 5.9)", () => {
  it("final −3 for both finalists, lost semi −2, bought back and lost again +2, everyone else +1", () => {
    const { s, ctx, lostAgain } = buybackNight();
    while (s.competition.status === "in_progress") playRound(s, ctx);
    const review = ratingReview(s);
    expect(review).toHaveLength(14);
    const final = match(s, 15);
    const finalists = [playerOf(s, final.player_a_id), playerOf(s, final.player_b_id)];
    const semiLosers = [13, 14].map((n) => match(s, n)).map((m) => playerOf(s, m.player_a_id === m.winner_id ? m.player_b_id : m.player_a_id));
    const row = (id: string) => review.find((r) => r.player_id === id)!;
    for (const id of finalists) expect(row(id)).toMatchObject({ group: "final", delta: -3, proposed_rating: row(id).current_rating - 3 });
    for (const id of semiLosers) expect(row(id)).toMatchObject({ group: "semi", delta: -2 });
    expect(row(lostAgain)).toMatchObject({ group: "buyback_lost", delta: 2, bought_back: true });
    expect(row(lostAgain).story).toMatch(/^Lost R1M\d to .+ → bought back → Lost R1M8 to .+$/);
    const others = review.filter((r) => r.group === "other");
    expect(others).toHaveLength(9);
    expect(others.every((r) => r.delta === 1)).toBe(true);
    // Shown in group order (spec 3.7).
    expect(review.map((r) => r.group)).toEqual([...Array(2).fill("final"), ...Array(2).fill("semi"), "buyback_lost", ...Array(9).fill("other")]);
    // The final being played makes no difference: winner and runner-up alike.
    expect(review.filter((r) => r.group === "final").map((r) => r.story).sort()[1]).toMatch(/^Won the Final v /);
  });

  it("a buy-back who wins their buy-back match is not 'lost again'", () => {
    const { s, ctx, firstLosers } = buybackNight();
    while (s.competition.status === "in_progress") playRound(s, ctx);
    const review = ratingReview(s);
    const won8 = playerOf(s, match(s, 8).winner_id!);
    expect(firstLosers.map((e) => playerOf(s, e))).toContain(won8);
    expect(review.find((r) => r.player_id === won8)!.group).not.toBe("buyback_lost");
  });

  it("a buy-back who goes up on a free pass and loses in round two is not 'lost again' (round one only)", () => {
    // 14 of 16: M1's loser buys back into the empty M8; nobody else does, so at close they pass to R2M4.
    const { s, ctx } = startNight({ bracket: 16, ratings: RATINGS }, makeCtx(5));
    play(s, ctx, 1, "a", "bought_back");
    const bb = s.entries.find((e) => e.source === "buyback")!;
    for (let n = 2; n <= 7; n++) play(s, ctx, n, "a", "declined");
    closeBuybacks(s, ctx);
    expect(s.freePasses.map((fp) => fp.entry_id)).toContain(bb.id);
    const r2 = s.matches.find((m) => m.round === 2 && (m.player_a_id === bb.id || m.player_b_id === bb.id))!;
    play(s, ctx, r2.number, r2.player_a_id === bb.id ? "b" : "a");
    const row = ratingReview(s).find((r) => r.player_id === bb.player_id)!;
    expect(row).toMatchObject({ group: "other", delta: 1, bought_back: true });
  });

  it("a night ended early labels by the round reached: winners waiting in the semi-final round get −2 (O-16)", () => {
    const { s, ctx } = buybackNight();
    closeBuybacks(s, ctx); // round one is played out: the organiser closes the window
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    play(s, ctx, 9, "a");
    play(s, ctx, 10, "a");
    play(s, ctx, 11, "a");
    startOn(s, ctx, match(s, 12).id);
    endCompetitionEarly(s, ctx);
    const review = ratingReview(s);
    const semi = review.filter((r) => r.group === "semi");
    // R2M1 and R2M2 winners meet in R3M1, never played; the R2M3 winner waits alone in R3.
    expect(semi.map((r) => r.player_id).sort()).toEqual([9, 10, 11].map((n) => playerOf(s, match(s, n).winner_id!)).sort());
    expect(semi.every((r) => r.delta === -2)).toBe(true);
    expect(review.some((r) => r.group === "final")).toBe(false);
    expect(unplayedFinal(s)).toBeNull();
    const r3m1 = match(s, 13);
    expect(review.find((r) => r.player_id === playerOf(s, r3m1.player_a_id))!.story).toMatch(/^In R3M1 v .+ when the night ended$/);
    expect(review.find((r) => r.player_id === playerOf(s, match(s, 11).winner_id!))!.story).toBe("Through to R3 when the night ended");
    // The R2M4 players were mid-match: everyone else, +1.
    const m12 = match(s, 12);
    for (const e of [m12.player_a_id, m12.player_b_id]) expect(review.find((r) => r.player_id === playerOf(s, e))!).toMatchObject({ group: "other", delta: 1 });
  });

  it("an unplayed final at the end of the night: both finalists −3", () => {
    const { s, ctx } = buybackNight();
    while (!s.matches.some((m) => m.number === 15)) playRound(s, ctx);
    endCompetitionEarly(s, ctx);
    const finalists = review(s).filter((r) => r.group === "final");
    expect(finalists).toHaveLength(2);
    expect(finalists.every((r) => r.delta === -3 && /^Reached the Final v /.test(r.story))).toBe(true);
    // Both semis decided and the final set: a finished night, so both read "final" (O-29).
    expect(finalists.every((r) => r.finish === "final")).toBe(true);
    expect(unplayedFinal(s)).not.toBeNull();
  });

  it("clamps at the −100 floor and the 200 ceiling", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [-99, 200, -100, 199] });
    while (s.competition.status === "in_progress") playRound(s, ctx, (m) => (m.rating_a <= m.rating_b ? "a" : "b"));
    const r = ratingReview(s);
    // The draw is random, so check every row against the rule: current + its group's change, kept in −100..200.
    const step = { final: -3, semi: -2, buyback_lost: 2, other: 1 } as Record<string, number>;
    for (const x of r) expect(x.proposed_rating).toBe(Math.max(-100, Math.min(200, x.current_rating + step[x.group])));
    expect(r.some((x) => x.proposed_rating !== x.current_rating + step[x.group])).toBe(true);
  });
});

function review(s: ReturnType<typeof buybackNight>["s"]) {
  return ratingReview(s);
}

describe("a rating changed during the night (O-26, spec 5.6)", () => {
  it("recalculates the start of every unfinished match of theirs and leaves finished ones as played", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [45, 20, 33, 30, 28, 41, 25, 36] });
    const m1 = match(s, 1);
    const m2 = match(s, 2);
    play(s, ctx, 1, "a", "declined");
    const winner = playerOf(s, m1.player_a_id);
    const frozen = { ...m1 };
    // The winner waits in round two; give them a match by playing M2.
    play(s, ctx, 2, "a", "declined");
    const r2 = s.matches.find((m) => m.round === 2)!;
    startOn(s, ctx, r2.id);
    const before = r2.start_points;
    s.players.find((p) => p.id === winner)!.rating = -50;
    const notes = refreshPlayerStarts(s, winner);
    expect(m1).toMatchObject({ rating_a: frozen.rating_a, rating_b: frozen.rating_b, start_points: frozen.start_points });
    const mine = r2.player_a_id === m1.player_a_id ? "a" : "b";
    expect(mine === "a" ? r2.rating_a : r2.rating_b).toBe(-50);
    expect(r2.start_points).not.toBe(before);
    expect(r2.state).toBe("in_play"); // the clock is left alone
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^R2M1: .+ now starts on \d+ \(was /);
    void m2;
  });

  it("works on a not-started match, and says nothing when the start does not move", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [30, 30] });
    const m = match(s, 1);
    expect(m.start_points).toBe(0);
    const pa = playerOf(s, m.player_a_id);
    s.players.find((p) => p.id === pa)!.rating = 30;
    expect(refreshPlayerStarts(s, pa)).toEqual([]);
    s.players.find((p) => p.id === pa)!.rating = 15;
    expect(refreshPlayerStarts(s, pa)).toEqual([`R1M1: ${s.players.find((p) => p.id === playerOf(s, m.player_b_id))!.name} now starts on 10 (was level)`]);
    startOn(s, ctx, m.id);
    cancelStart(s, ctx, m.id);
    expect(m.start_points).toBe(10);
  });
});
