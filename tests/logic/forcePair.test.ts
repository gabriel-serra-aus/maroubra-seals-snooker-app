import { describe, expect, it } from "vitest";
import { forcePair } from "@/lib/logic/forcePair";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { halfFullPairs, waitingEntries } from "@/lib/logic/derive";
import { entry, match, play, playRound, slotEntry, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("Force Pair (rules 10, spec 5.5)", () => {
  it("is a no-op under two waiting players", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    expect(waitingEntries(s, 1)).toHaveLength(1);
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2 waiting players/);
  });

  it("two buy-backs alone in different matches: the lower match is kept and the other seat released", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    const a = play(s, ctx, 1, "a", "bought_back").loser.buybackEntryId!;
    const b = play(s, ctx, 2, "a", "bought_back").loser.buybackEntryId!;
    const before = structuredClone(s.matches);
    const lower = Math.min(entry(s, a).slot!, entry(s, b).slot!);
    const m = forcePair(s, ctx);
    expect(m.origin).toBe("force_pair");
    expect(m.number).toBe(Math.ceil(lower / 2));
    expect([m.player_a_id, m.player_b_id].sort()).toEqual([a, b].sort());
    expect(halfFullPairs(s)).toEqual([]);
    // Existing matches untouched, window still open.
    expect(s.matches.filter((x) => x.id !== m.id)).toEqual(before);
    expect(s.competition.buybacks_closed_at).toBeNull();
  });

  it("a first-draw waiter and a buy-back in another match: the first-draw player's match (the lower) is used", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    const gus = slotEntry(s, 13); // M7 half-full
    const bb = play(s, ctx, 1, "a", "bought_back").loser.buybackEntryId!; // placed at 15, M8 half-full
    expect(entry(s, bb).slot).toBe(15);
    const m = forcePair(s, ctx);
    expect(m.number).toBe(7);
    expect(m.player_a_id).toBe(gus.id);
    expect(entry(s, bb).slot).toBe(14);
    expect(s.entries.some((e) => e.slot === 15)).toBe(false);
  });

  it("may be pressed repeatedly and never breaks a match", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    [1, 2, 3, 4].forEach((n) => play(s, ctx, n, "a", "bought_back")); // three alone in M6..M8, the fourth joins one
    expect(waitingEntries(s, 1)).toHaveLength(2);
    forcePair(s, ctx);
    expect(s.matches.filter((m) => m.origin === "force_pair")).toHaveLength(1);
    expect(s.matches.filter((m) => m.origin === "placement")).toHaveLength(1);
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2/);
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(7);
  });

  it("only ever pairs round-one waiters: two players waiting in round two while buy-backs are open are left alone", () => {
    // 13 of 16 with M1, M2 and M3 done: the M1 and M2 winners meet in M9 at once (O-14), the M3 winner
    // waits alone in round two, and Gus waits alone in round one.
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    play(s, ctx, 1, "a", "declined");
    play(s, ctx, 2, "a", "declined");
    play(s, ctx, 3, "a", "declined");
    expect(match(s, 9).round).toBe(2);
    expect(waitingEntries(s, 2)).toHaveLength(1);
    expect(waitingEntries(s, 1)).toHaveLength(1); // Gus in M7
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2 waiting players/);
    // Even with a second round-two waiter, Force Pair never reaches past round one (rules 10).
    play(s, ctx, 5, "a", "declined");
    expect(waitingEntries(s, 2)).toHaveLength(2);
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2 waiting players/);
    expect(s.matches.filter((m) => m.origin === "force_pair")).toHaveLength(0);
  });

  it("is rejected once buy-backs are closed", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    closeBuybacks(s, ctx);
    expect(() => forcePair(s, ctx)).toThrow(/only available in round one/);
    playRound(s, ctx);
    expect(match(s, 9).round).toBe(2);
    expect(() => forcePair(s, ctx)).toThrow(/only available in round one/);
  });
});
