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
import { entry, match, play, playRound, startNight } from "./helpers";

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
    const r = completeMatch(s, ctx, m.id, m.player_a_id, "declined");
    expect(m.state).toBe("finished");
    expect(m.winner_id).toBe(m.player_a_id);
    expect(m.finished_at).toEqual(ctx.now);
    expect(r.winnerTo).toEqual({ kind: "awaiting", round: 2 });
    expect(() => completeMatch(s, ctx, m.id, m.player_b_id, "declined")).toThrow(/already finished/);
    expect(positionOf(s, m.player_a_id)).toEqual({ status: "waiting", round: 2 });
    expect(positionOf(s, m.player_b_id)).toEqual({ status: "out", round: 1 });
  });

  it("round two onwards asks for no buy-back decision; the last match decides the night", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m = match(s, 9);
    startMatch(s, ctx, m.id);
    expect(() => completeMatch(s, ctx, m.id, m.player_a_id, "declined")).toThrow(/No buy-back decision/);
    const r = completeMatch(s, ctx, m.id, m.player_a_id);
    expect(r.completed).toBe(true);
    expect(r.winnerTo).toEqual({ kind: "winner" });
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
    expect(replacement.origin).toBe("advance");
    expect([replacement.player_a_id, replacement.player_b_id].sort()).toEqual([other, newWinner].sort());
    expect(positionOf(s, w1)).toEqual({ status: "out", round: 1 });
    expect(waitingEntries(s, 2)).toHaveLength(0);
  });

  it("pulls the previous winner out of a free pass, which the new winner then receives", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) });
    playRound(s, ctx); // M1, M2 → M9; M3's winner is alone in box 2 of round 2 and passes to round 3
    const fp = s.freePasses.find((f) => f.from_round === 2)!;
    const holder = fp.entry_id;
    const m3 = match(s, 3);
    expect(m3.winner_id).toBe(holder);
    const newWinner = m3.player_a_id === holder ? m3.player_b_id : m3.player_a_id;
    correctMatch(s, ctx, m3.id, newWinner);
    expect(s.freePasses.some((f) => f.entry_id === holder)).toBe(false);
    expect(s.freePasses.filter((f) => f.from_round === 2).map((f) => f.entry_id)).toEqual([newWinner]);
    expect(positionOf(s, newWinner)).toEqual({ status: "waiting", round: 3 });
    playRound(s, ctx); // M9 → its winner meets the pass-holder in M13
    expect(currentRound(s)).toBe(3);
    expect(match(s, 13).player_b_id).toBe(newWinner);
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
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    const r1 = play(s, ctx, 1, "a", "bought_back");
    const bb1 = r1.loser.buybackEntryId!;
    const bb1Slot = entry(s, bb1).slot!;
    const m1 = match(s, 1);
    const prevLoser = m1.player_b_id;
    const res = correctMatch(s, ctx, m1.id, prevLoser, "bought_back");
    expect(m1.winner_id).toBe(prevLoser);
    // The old buy-back entry is gone, its seat is free again, and the new loser has bought back into an empty match.
    expect(s.entries.some((e) => e.id === bb1)).toBe(false);
    expect(res.loser.decision).toBe("bought_back");
    expect(res.loser.buybackMatch).toBeNull();
    const bb2 = entry(s, res.loser.buybackEntryId!);
    expect(bb2.player_id).toBe(entry(s, m1.player_a_id).player_id);
    expect([11, 13, 15]).toContain(bb2.slot);
    expect(s.entries.some((e) => e.slot === bb1Slot && e.id !== bb2.id)).toBe(false);
    expect(entry(s, prevLoser).buyback_decision).toBeNull();
    expect(entry(s, m1.player_a_id).buyback_decision).toBe("bought_back");
  });

  it("is refused when the previous loser's buy-back match has started (O-6)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(15) });
    const r = play(s, ctx, 1, "a", "bought_back"); // the only free seat is beside the lone player in M8
    expect(r.loser.buybackMatch?.number).toBe(8);
    startMatch(s, ctx, match(s, 8).id);
    const m1 = match(s, 1);
    expect(correctionBlockedReason(s, m1)).toMatch(/buy-back match M8 already started/);
    expect(() => correctMatch(s, ctx, m1.id, m1.player_b_id, "declined")).toThrow(/already started/);
  });

  it("same winner: only the loser's decision changes", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    const r = play(s, ctx, 1, "a", "bought_back");
    const m1 = match(s, 1);
    correctMatch(s, ctx, m1.id, m1.player_a_id, "declined");
    expect(s.entries.some((e) => e.id === r.loser.buybackEntryId)).toBe(false);
    expect(entry(s, m1.player_b_id).buyback_decision).toBe("declined");
    correctMatch(s, ctx, m1.id, m1.player_a_id, "bought_back");
    expect(entry(s, m1.player_b_id).buyback_decision).toBe("bought_back");
    expect(s.entries.filter((e) => e.source === "buyback")).toHaveLength(1);
  });

  it("can correct the final, moving the night's winner", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    playRound(s, ctx);
    expect(s.competition.status).toBe("complete");
    const final = match(s, 9);
    const runnerUp = final.player_a_id === final.winner_id ? final.player_b_id : final.player_a_id;
    const r = correctMatch(s, ctx, final.id, runnerUp);
    expect(r.completed).toBe(true);
    expect(s.competition.status).toBe("complete");
    expect(s.competition.winner_entry_id).toBe(runnerUp);
    expect(s.freePasses.every((fp) => fp.entry_id === runnerUp)).toBe(true);
  });

  it("closeBuybacks is refused once the window has closed by itself", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    expect(() => closeBuybacks(s, ctx)).toThrow(/already closed/);
  });
});
