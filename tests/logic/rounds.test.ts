import { describe, expect, it } from "vitest";
import { autoCloseDue, closeBuybacks } from "@/lib/logic/buybacks";
import { abandonCompetition } from "@/lib/logic/competition";
import { currentRound, positionOf } from "@/lib/logic/derive";
import { makeCtx, match, play, playRound, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("auto-close (rules 11, spec 5.3)", () => {
  it("closes once every first-draw player's round-one match is finished and decided", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8), mode: "sequential" });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back"); // M5: buy-back v buy-back
    play(s, ctx, 3, "a", "declined");
    expect(autoCloseDue(s)).toBe(false);
    const r = play(s, ctx, 4, "a", "declined");
    expect(r.autoClose).not.toBeNull();
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    // The buy-back match M5 does not hold the window open and is still to be played.
    expect(match(s, 5).state).toBe("not_started");
    expect(r.draw).toBeNull();
  });

  it("a waiting first-draw player does not hold the window open; they get a free pass (O-4)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(3) });
    play(s, ctx, 1, "a", "declined");
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(s.freePasses).toHaveLength(1);
    // Round 1 done → round 2 drawn: winner v free-pass holder as M9.
    expect(currentRound(s)).toBe(2);
    expect(match(s, 9).round).toBe(2);
  });
});

describe("round draw (rules 4, 11; spec 5.4)", () => {
  it("draws round two from winners plus every round-one free pass, numbered from B/2+1", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    play(s, ctx, 1, "a", "bought_back");
    closeBuybacks(s, ctx); // 2 free passes (M7 waiter, the buy-back in M8)
    expect(s.freePasses).toHaveLength(2);
    playRound(s, ctx);
    expect(currentRound(s)).toBe(2);
    const r2 = s.matches.filter((m) => m.round === 2);
    // pool = 6 winners + 2 free passes = 8 → 4 matches, no free pass
    expect(r2).toHaveLength(4);
    expect(r2.map((m) => m.number).sort((a, b) => a - b)).toEqual([9, 10, 11, 12]);
    expect(r2.every((m) => m.origin === "round_draw" && m.state === "not_started")).toBe(true);
    expect(s.freePasses.filter((fp) => fp.from_round === 2)).toHaveLength(0);
  });

  it("rounds two onwards never give more than one free pass, and the night ends with one winner", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) }, makeCtx(7));
    // 3 buy-backs → 8 round-one matches; pool 8 → 4 → 2 → 1
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    play(s, ctx, 3, "a", "bought_back");
    playRound(s, ctx); // finishes round 1 (auto-closes), draws round 2
    while (s.competition.status === "in_progress") {
      const r = currentRound(s);
      expect(s.freePasses.filter((fp) => fp.from_round === r).length).toBeLessThanOrEqual(1);
      playRound(s, ctx);
    }
    expect(s.competition.status).toBe("complete");
    expect(s.competition.winner_entry_id).not.toBeNull();
    expect(positionOf(s, s.competition.winner_entry_id!).status).toBe("winner");
    expect(s.matches.filter((m) => m.round === 4)).toHaveLength(1);
  });

  it("an odd pool leaves one random free pass which is used in the next draw", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    playRound(s, ctx); // 5 winners, 5 declined, auto-close → round 2: 2 matches + 1 free pass
    expect(currentRound(s)).toBe(2);
    expect(s.matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(s.freePasses.filter((fp) => fp.from_round === 2)).toHaveLength(1);
    playRound(s, ctx); // pool 3 → 1 match + 1 free pass
    expect(currentRound(s)).toBe(3);
    expect(s.matches.filter((m) => m.round === 3)).toHaveLength(1);
    expect(s.freePasses.filter((fp) => fp.from_round === 3)).toHaveLength(1);
    playRound(s, ctx); // pool 2 → final
    playRound(s, ctx);
    expect(s.competition.status).toBe("complete");
  });

  it("does not draw round two while buy-backs are open, even with every match finished", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4), mode: "sequential" });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back"); // M3 bb v bb; window auto-closes now (no first-draw left unfinished)
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(currentRound(s)).toBe(1);
    play(s, ctx, 3, "a");
    expect(currentRound(s)).toBe(2);
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
