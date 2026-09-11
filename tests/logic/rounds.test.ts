import { describe, expect, it } from "vitest";
import { addLateArrival, closeBuybacks } from "@/lib/logic/buybacks";
import { abandonCompetition, endCompetitionEarly } from "@/lib/logic/competition";
import { boxOf, currentRound, matchNumberFor, positionOf, roundsFor, siblingHalf, slotRangeOf } from "@/lib/logic/derive";
import { correctMatch } from "@/lib/logic/matchControl";
import { hasMatch, makeCtx, match, play, playRound, playToEnd, setupNight, slotEntry, startNight, startOn } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("bracket geometry (spec 5.4, O-14)", () => {
  it("numbers every box by position: 16 → M1–8, M9–12, M13–14, M15; 32 → up to M31", () => {
    expect(roundsFor(16)).toBe(4);
    expect(roundsFor(32)).toBe(5);
    expect(matchNumberFor(16, 1, 8)).toBe(8);
    expect(matchNumberFor(16, 2, 1)).toBe(9);
    expect(matchNumberFor(16, 3, 2)).toBe(14);
    expect(matchNumberFor(16, 4, 1)).toBe(15);
    expect(matchNumberFor(32, 2, 1)).toBe(17);
    expect(matchNumberFor(32, 5, 1)).toBe(31);
  });

  it("a slot's box in each round, and the half its opponent comes from", () => {
    expect(boxOf(9, 1)).toBe(5);
    expect(boxOf(9, 2)).toBe(3);
    expect(boxOf(9, 3)).toBe(2);
    expect(boxOf(9, 4)).toBe(1);
    expect(slotRangeOf(2, 3)).toEqual([9, 12]);
    expect(siblingHalf(9, 2)).toEqual([11, 12]);
    expect(siblingHalf(12, 2)).toEqual([9, 10]);
    expect(siblingHalf(9, 4)).toEqual([1, 8]);
  });
});

describe("the window closes only on the organiser's tap (rules 11, spec 5.3, O-15)", () => {
  it("stays open after every first-draw player's round-one match is finished; a late arrival still gets in", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    play(s, ctx, 3, "a", "declined");
    play(s, ctx, 4, "a", "declined");
    expect(s.matches.filter((m) => m.round === 1 && m.state !== "finished")).toHaveLength(0);
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(s.freePasses).toHaveLength(0);
    // The two buy-backs sit alone in two of M5..M8; a late arrival takes a third empty match (O-13).
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    expect(addLateArrival(s, ctx, "late").match).toBeNull();
    // The tap: all three lone players go through on a free pass, and the list is locked.
    const r = closeBuybacks(s, ctx);
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(r.freePasses).toHaveLength(3);
    s.players.push({ id: "later", name: "Later", rating: 30, active: true });
    expect(() => addLateArrival(s, ctx, "later")).toThrow(/closed/);
  });

  it("a waiting first-draw player waits until the tap, then gets a free pass (O-4)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(3) });
    play(s, ctx, 1, "a", "declined");
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(positionOf(s, slotEntry(s, 3).id)).toEqual({ status: "waiting", round: 1 });
    expect(hasMatch(s, 9)).toBe(false);
    closeBuybacks(s, ctx);
    expect(s.freePasses.filter((fp) => fp.from_round === 1)).toHaveLength(1);
    // The pass-holder (slot 3) and the M1 winner share round-two box 1: M9 forms at once.
    expect(currentRound(s)).toBe(2);
    expect(match(s, 9).round).toBe(2);
    expect([match(s, 9).player_a_id, match(s, 9).player_b_id]).toEqual([match(s, 1).winner_id, slotEntry(s, 3).id]);
  });
});

describe("advancement up the fixed tree (rules 4, 11; spec 5.4; O-14)", () => {
  it("a round-two match forms as soon as both feeders finish, while round one is still going", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    play(s, ctx, 1, "a", "declined");
    expect(hasMatch(s, 9)).toBe(false);
    expect(positionOf(s, match(s, 1).winner_id!)).toEqual({ status: "waiting", round: 2 });
    play(s, ctx, 2, "a", "declined");
    expect(hasMatch(s, 9)).toBe(true);
    expect(match(s, 9).origin).toBe("advance");
    expect(match(s, 9).state).toBe("not_started");
    expect([match(s, 9).player_a_id, match(s, 9).player_b_id]).toEqual([match(s, 1).winner_id, match(s, 2).winner_id]);
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(currentRound(s)).toBe(1);
  });

  it("nobody skips a round while buy-backs are open; after close a dead half gives an immediate pass", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    // M5 (slots 9, 10) finishes first: its winner's round-two opponent would come from M6, which is empty.
    const r = play(s, ctx, 5, "a", "declined");
    expect(r.winnerTo).toEqual({ kind: "awaiting", round: 2 });
    const w5 = match(s, 5).winner_id!;
    expect(positionOf(s, w5)).toEqual({ status: "waiting", round: 2 });
    expect(s.freePasses).toHaveLength(0);
    closeBuybacks(s, ctx);
    // M6 empty → pass round 2; M7/M8 empty → pass round 3; then waits in the final for the top half.
    expect(s.freePasses.filter((fp) => fp.entry_id === w5).map((fp) => fp.from_round)).toEqual([2, 3]);
    expect(positionOf(s, w5)).toEqual({ status: "waiting", round: 4 });
  });

  it("9 players, no buy-backs: slot 9 reaches the final without playing (the documented consequence of O-14)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(9) });
    const nine = slotEntry(s, 9);
    playRound(s, ctx); // M1..M4, all declined; the helper then taps No More Buy-Backs / Late Entries
    expect(s.freePasses.filter((fp) => fp.entry_id === nine.id).map((fp) => fp.from_round)).toEqual([1, 2, 3]);
    expect(positionOf(s, nine.id)).toEqual({ status: "waiting", round: 4 });
    expect(s.matches.filter((m) => m.round === 2).map((m) => m.number)).toEqual([9, 10]);
    playRound(s, ctx); // M9, M10 → M13
    expect(match(s, 13).round).toBe(3);
    playRound(s, ctx); // M13 → its winner meets slot 9 in M15
    const final = match(s, 15);
    expect(final.round).toBe(4);
    expect(final.player_b_id).toBe(nine.id);
    playRound(s, ctx);
    expect(s.competition.status).toBe("complete");
  });

  it("13 players and 3 buy-backs make a perfect 8: rounds of 4, 2, 1 with no free pass, ending in M15", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) }, makeCtx(7));
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    play(s, ctx, 3, "a", "bought_back");
    playToEnd(s, ctx);
    expect(s.freePasses).toHaveLength(0);
    for (const [round, count] of [[1, 8], [2, 4], [3, 2], [4, 1]]) expect(s.matches.filter((m) => m.round === round)).toHaveLength(count);
    expect(s.matches.map((m) => m.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(s.competition.status).toBe("complete");
    expect(s.competition.winner_entry_id).toBe(match(s, 15).winner_id);
    expect(positionOf(s, s.competition.winner_entry_id!).status).toBe("winner");
  });

  it("4 players in a 32 bracket: M1, M2, then M17, then passes through the empty rounds to the title", () => {
    const { s, ctx } = startNight({ bracket: 32, ratings: ratings(4) });
    playRound(s, ctx);
    expect(match(s, 17).round).toBe(2);
    const r = play(s, ctx, 17, "a");
    expect(r.completed).toBe(true);
    expect(r.winnerTo).toEqual({ kind: "winner" });
    expect(s.freePasses.filter((fp) => fp.entry_id === match(s, 17).winner_id).map((fp) => fp.from_round)).toEqual([3, 4, 5]);
    expect(s.competition.status).toBe("complete");
  });

  it("a correction pulls the winner out of M9 and the other player waits there until the new winner arrives", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m1 = match(s, 1);
    const other = match(s, 2).winner_id!;
    const newWinner = m1.player_a_id === m1.winner_id ? m1.player_b_id : m1.player_a_id;
    const r = correctMatch(s, ctx, m1.id, newWinner);
    expect(r.winnerTo).toEqual({ kind: "match", round: 2, number: 9 });
    expect(match(s, 9).origin).toBe("advance");
    expect([match(s, 9).player_a_id, match(s, 9).player_b_id]).toEqual([newWinner, other]);
    expect(positionOf(s, m1.winner_id === newWinner ? other : newWinner).status).not.toBe("out");
  });
});

describe("abandon (O-7, spec 5.11)", () => {
  it("marks the night abandoned, keeps everything, logs the actor", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) });
    play(s, ctx, 1, "a", "declined");
    abandonCompetition(s, ctx);
    expect(s.competition.status).toBe("abandoned");
    expect(s.competition.abandoned_at).not.toBeNull();
    expect(s.matches).toHaveLength(3);
    expect(ctx.log.map((l) => l.action)).toEqual(["abandon"]);
    expect(() => abandonCompetition(s, ctx)).toThrow(/running/);
  });
});

describe("end night here (spec 5.11)", () => {
  it("closes the night as complete with no winner, keeps every result, logs the actor", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    playRound(s, ctx);
    play(s, ctx, 9, "a");
    const finished = s.matches.filter((m) => m.state === "finished").length;
    const r = endCompetitionEarly(s, ctx);
    expect(s.competition.status).toBe("complete");
    expect(s.competition.completed_at).not.toBeNull();
    // Complete, but nobody won the final: that is what "completed (unfinished)" reads from.
    expect(s.competition.winner_entry_id).toBeNull();
    expect(s.matches.filter((m) => m.state === "finished")).toHaveLength(finished);
    expect(r.unplayed).toBe(s.matches.filter((m) => m.state !== "finished").length);
    expect(r.standing.length).toBeGreaterThan(0);
    expect(ctx.log.map((l) => l.action)).toContain("end_early");
    expect(() => endCompetitionEarly(s, ctx)).toThrow(/running/);
  });

  it("throws away the clock of a match still in play, like a cancel start (O-5)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    startOn(s, ctx, match(s, 1).id);
    startOn(s, ctx, match(s, 2).id);
    const r = endCompetitionEarly(s, ctx);
    expect(r.cancelled).toBe(2);
    expect(match(s, 1).state).toBe("not_started");
    expect(match(s, 1).started_at).toBeNull();
    expect(match(s, 2).started_at).toBeNull();
  });

  it("still names the players who were left standing", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    play(s, ctx, 1, "a", "declined");
    const winner = s.players.find((p) => p.id === s.entries.find((e) => e.id === match(s, 1).winner_id)!.player_id)!;
    const r = endCompetitionEarly(s, ctx);
    expect(r.standing).toContain(winner.name);
    // The round-one loser who declined a buy-back is out, so they are not standing.
    expect(r.standing).toHaveLength(3);
  });

  it("is refused before the competition starts", () => {
    const { s, ctx } = setupNight({ bracket: 16, ratings: ratings(4) });
    expect(() => endCompetitionEarly(s, ctx)).toThrow(/running/);
  });
});
