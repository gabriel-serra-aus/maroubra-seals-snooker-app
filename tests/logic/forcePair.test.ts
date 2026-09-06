import { describe, expect, it } from "vitest";
import { forcePair } from "@/lib/logic/forcePair";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { waitingEntries } from "@/lib/logic/derive";
import { match, play, playRound, slotEntry, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("Force Pair (rules 10, spec 5.5)", () => {
  it("is a no-op under two waiting players", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    expect(waitingEntries(s, 1)).toHaveLength(1);
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2 waiting players/);
  });

  it("neither placed: both go into the lowest-numbered empty match", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "random_draw" });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    const before = structuredClone(s.matches);
    const m = forcePair(s, ctx);
    expect(m.number).toBe(6);
    expect(m.origin).toBe("force_pair");
    expect([slotEntry(s, 11).id, slotEntry(s, 12).id]).toEqual([m.player_a_id, m.player_b_id]);
    // Existing matches untouched, mode unchanged, window still open.
    expect(s.matches.filter((x) => x.id !== m.id)).toEqual(before);
    expect(s.competition.buyback_mode).toBe("random_draw");
    expect(s.competition.buybacks_closed_at).toBeNull();
  });

  it("one placed: the other takes that match's free slot", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13), mode: "random_draw" });
    const gus = slotEntry(s, 13);
    const bb = play(s, ctx, 1, "a", "bought_back").loser.buybackEntryId!;
    const m = forcePair(s, ctx);
    expect(m.number).toBe(7);
    expect(m.player_a_id).toBe(gus.id);
    expect(m.player_b_id).toBe(bb);
    expect(s.entries.find((e) => e.id === bb)!.slot).toBe(14);
  });

  it("both placed in different half-full matches: the lower match is used and the other slot released", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13), mode: "sequential" });
    const gus = slotEntry(s, 13); // M7 half-full
    const bb = play(s, ctx, 1, "a", "bought_back").loser.buybackEntryId!; // placed at 15, M8 half-full
    expect(s.entries.find((e) => e.id === bb)!.slot).toBe(15);
    const m = forcePair(s, ctx);
    expect(m.number).toBe(7);
    expect(m.player_a_id).toBe(gus.id);
    expect(s.entries.find((e) => e.id === bb)!.slot).toBe(14);
    expect(s.entries.some((e) => e.slot === 15)).toBe(false);
  });

  it("may be pressed repeatedly and never breaks a match", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "random_draw" });
    [1, 2, 3, 4].forEach((n) => play(s, ctx, n, "a", "bought_back"));
    forcePair(s, ctx);
    forcePair(s, ctx);
    expect(s.matches.filter((m) => m.origin === "force_pair").map((m) => m.number)).toEqual([6, 7]);
    expect(() => forcePair(s, ctx)).toThrow(/Needs 2/);
  });

  it("is rejected from round two", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(8) });
    closeBuybacks(s, ctx);
    playRound(s, ctx);
    expect(match(s, 9).round).toBe(2);
    expect(() => forcePair(s, ctx)).toThrow(/only available in round one/);
  });
});
