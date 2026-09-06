import { describe, expect, it } from "vitest";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { currentRound, positionOf, waitingEntries } from "@/lib/logic/derive";
import {
  cancelStart,
  completeMatch,
  correctMatch,
  correctionBlockedReason,
  setMatchTimeLimit,
  startMatch,
} from "@/lib/logic/matchControl";
import { match, play, playRound, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("start, time limit, cancel start (rules 12, O-5, spec 5.8)", () => {
  it("start freezes the limit and sets started_at; cancel clears both and leaves the pairing", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    const m = match(s, 1);
    setMatchTimeLimit(s, m.id, 30);
    const before = { a: m.player_a_id, b: m.player_b_id, start: m.start_points, to: m.start_entry_id };
    startMatch(s, ctx, m.id);
    expect(m.state).toBe("in_play");
    expect(m.started_at).toEqual(ctx.now);
    expect(m.time_limit_minutes).toBe(30);
    expect(() => startMatch(s, ctx, m.id)).toThrow(/already started/);
    expect(() => setMatchTimeLimit(s, m.id, 20)).toThrow(/before a match starts/);
    cancelStart(s, ctx, m.id);
    expect(m.state).toBe("not_started");
    expect(m.started_at).toBeNull();
    expect(m.time_limit_minutes).toBeNull();
    expect({ a: m.player_a_id, b: m.player_b_id, start: m.start_points, to: m.start_entry_id }).toEqual(before);
    expect(ctx.log.map((l) => l.action)).toEqual(["cancel_start"]);
    expect(() => cancelStart(s, ctx, m.id)).toThrow(/Only a match in play/);
    // Can be started again, taking the competition default now.
    startMatch(s, ctx, m.id);
    expect(m.time_limit_minutes).toBe(25);
  });

  it("a result cannot be entered on a match that has not started", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    const m = match(s, 1);
    expect(() => completeMatch(s, ctx, m.id, m.player_a_id, "declined")).toThrow(/has not started/);
  });

  it("complete records the winner, stops the clock, and refuses a second result", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    const m = match(s, 1);
    startMatch(s, ctx, m.id);
    expect(() => completeMatch(s, ctx, m.id, "nobody", "declined")).toThrow(/must be a player/);
    completeMatch(s, ctx, m.id, m.player_a_id, "declined");
    expect(m.state).toBe("finished");
    expect(m.winner_id).toBe(m.player_a_id);
    expect(m.finished_at).toEqual(ctx.now);
    expect(() => completeMatch(s, ctx, m.id, m.player_b_id, "declined")).toThrow(/already finished/);
    expect(positionOf(s, m.player_a_id)).toEqual({ status: "waiting", round: 2 });
    expect(positionOf(s, m.player_b_id)).toEqual({ status: "out", round: 1 });
  });

  it("round two onwards asks for no buy-back decision", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m = match(s, 9);
    startMatch(s, ctx, m.id);
    expect(() => completeMatch(s, ctx, m.id, m.player_a_id, "declined")).toThrow(/No buy-back decision/);
    const r = completeMatch(s, ctx, m.id, m.player_a_id);
    expect(r.draw?.completed).toBe(true);
    expect(s.competition.status).toBe("complete");
    expect(s.competition.winner_entry_id).toBe(m.player_a_id);
  });
});

describe("correct result (rules 12, O-6, spec 5.7)", () => {
  it("pulls the previous winner out of a not-started next-round match and puts the new winner in their place", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx); // M1, M2 finished, losers declined; round 2: M9 = w1 v w2
    const m1 = match(s, 1);
    const m9 = match(s, 9);
    const w1 = m1.winner_id!;
    const other = m9.player_a_id === w1 ? m9.player_b_id : m9.player_a_id;
    const newWinner = m1.player_a_id === w1 ? m1.player_b_id : m1.player_a_id;
    expect(correctionBlockedReason(s, m1)).toBeNull();
    // Buy-backs are closed (auto), so the new loser needs no decision.
    correctMatch(s, ctx, m1.id, newWinner);
    expect(m1.winner_id).toBe(newWinner);
    expect(m1.corrected_at).toEqual(ctx.now);
    expect(s.matches.find((m) => m.id === m9.id)).toBeUndefined();
    const replacement = s.matches.find((m) => m.round === 2)!;
    expect(replacement.number).toBe(9);
    expect(replacement.origin).toBe("correction");
    expect([replacement.player_a_id, replacement.player_b_id].sort()).toEqual([other, newWinner].sort());
    expect(positionOf(s, w1)).toEqual({ status: "out", round: 1 });
    expect(waitingEntries(s, 2)).toHaveLength(0);
  });

  it("pulls the previous winner out of a free pass", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) });
    playRound(s, ctx); // 3 winners → round 2: one match + one free pass
    const fp = s.freePasses.find((f) => f.from_round === 2)!;
    const holder = fp.entry_id;
    const m1 = s.matches.find((m) => m.round === 1 && m.winner_id === holder)!;
    const newWinner = m1.player_a_id === holder ? m1.player_b_id : m1.player_a_id;
    correctMatch(s, ctx, m1.id, newWinner);
    expect(s.freePasses.some((f) => f.entry_id === holder)).toBe(false);
    // The new winner takes the free pass the old winner held (5.7 step 2).
    expect(s.freePasses.filter((f) => f.from_round === 2).map((f) => f.entry_id)).toEqual([newWinner]);
    expect(positionOf(s, newWinner)).toEqual({ status: "waiting", round: 3 });
    playRound(s, ctx);
    expect(currentRound(s)).toBe(3);
    expect(s.matches.filter((m) => m.round === 3)).toHaveLength(1);
  });

  it("is refused once the winner's next match has started", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m9 = match(s, 9);
    startMatch(s, ctx, m9.id);
    const m1 = match(s, 1);
    expect(correctionBlockedReason(s, m1)).toMatch(/Result locked: M9 has started/);
    const other = m1.player_a_id === m1.winner_id ? m1.player_b_id : m1.player_a_id;
    expect(() => correctMatch(s, ctx, m1.id, other)).toThrow(/Result locked/);
  });

  it("undoes the previous loser's not-started buy-back and takes the new loser's decision", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    const r1 = play(s, ctx, 1, "a", "bought_back");
    const r2 = play(s, ctx, 2, "a", "bought_back"); // M6: bb1 v bb2, not started
    expect(r2.loser.buybackMatch?.number).toBe(6);
    const m1 = match(s, 1);
    const prevLoser = m1.player_b_id;
    const res = correctMatch(s, ctx, m1.id, prevLoser, "bought_back");
    expect(m1.winner_id).toBe(prevLoser);
    expect(s.entries.some((e) => e.id === r1.loser.buybackEntryId)).toBe(false);
    // The old M6 (bb1 v bb2) was dissolved; bb2 kept slot 12 and waited again, and the new loser (old
    // winner) bought back and, under Sequential, was placed into slot 11 to form a new M6 with them.
    expect(res.loser.decision).toBe("bought_back");
    expect(res.loser.buybackMatch?.number).toBe(6);
    const bb2 = s.entries.find((e) => e.id === r2.loser.buybackEntryId)!;
    expect(bb2.slot).toBe(12);
    const m6 = match(s, 6);
    expect([m6.player_a_id, m6.player_b_id]).toEqual([res.loser.buybackEntryId, bb2.id]);
    expect(m6.state).toBe("not_started");
    expect(s.entries.find((e) => e.id === prevLoser)!.buyback_decision).toBeNull();
    expect(s.entries.find((e) => e.id === m1.player_a_id)!.buyback_decision).toBe("bought_back");
  });

  it("is refused when the previous loser's buy-back match has started (O-6)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    startMatch(s, ctx, match(s, 6).id);
    const m1 = match(s, 1);
    expect(correctionBlockedReason(s, m1)).toMatch(/buy-back match M6 already started/);
    expect(() => correctMatch(s, ctx, m1.id, m1.player_b_id, "declined")).toThrow(/already started/);
  });

  it("same winner: only the loser's decision changes", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    const r = play(s, ctx, 1, "a", "bought_back");
    const m1 = match(s, 1);
    correctMatch(s, ctx, m1.id, m1.player_a_id, "declined");
    expect(s.entries.some((e) => e.id === r.loser.buybackEntryId)).toBe(false);
    expect(s.entries.find((e) => e.id === m1.player_b_id)!.buyback_decision).toBe("declined");
    correctMatch(s, ctx, m1.id, m1.player_a_id, "bought_back");
    expect(s.entries.find((e) => e.id === m1.player_b_id)!.buyback_decision).toBe("bought_back");
    expect(s.entries.filter((e) => e.source === "buyback")).toHaveLength(1);
  });

  it("can correct the final, moving the night's winner", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    playRound(s, ctx);
    expect(s.competition.status).toBe("complete");
    const final = match(s, 9);
    const runnerUp = final.player_a_id === final.winner_id ? final.player_b_id : final.player_a_id;
    correctMatch(s, ctx, final.id, runnerUp);
    expect(s.competition.status).toBe("complete");
    expect(s.competition.winner_entry_id).toBe(runnerUp);
  });

  it("closeBuybacks cannot run once round two exists", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    expect(() => closeBuybacks(s, ctx)).toThrow(/round one/);
  });
});
