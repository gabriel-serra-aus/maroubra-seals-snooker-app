import { describe, expect, it } from "vitest";
import { addLateArrival, closeBuybacks, convertTo16 } from "@/lib/logic/buybacks";
import { openSlots, positionOf } from "@/lib/logic/derive";
import { cloneSnapshot } from "@/lib/logic/types";
import { match, play, slotEntry, startNight, startOn } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("Convert to 16 (O-30)", () => {
  it("9 of 32 with a buy-back and a late arrival: pairs keep their players and order, the lone three become a match and a waiting player", () => {
    const { s, ctx } = startNight({ bracket: 32, ratings: ratings(9) });
    const nine = slotEntry(s, 9);
    const r1 = play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "declined");
    expect(s.matches.some((m) => m.round === 2)).toBe(true); // M1 and M2 winners met in R2M1 of the 32
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const late = addLateArrival(s, ctx, "late");
    const before = [1, 2, 3, 4].map((n) => ({ ...match(s, n) }));

    const r = convertTo16(s, ctx);

    expect(s.competition.bracket_size).toBe(16);
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(r.kept).toBe(4);
    for (const [i, m] of before.entries()) {
      const now = s.matches.find((x) => x.id === m.id)!;
      expect(now.number).toBe(i + 1);
      expect([now.player_a_id, now.player_b_id, now.state, now.winner_id]).toEqual([m.player_a_id, m.player_b_id, m.state, m.winner_id]);
    }
    // The lone three: nine, the buy-back and the late arrival. Two play in M5, one waits in M6.
    const lone = [nine.id, r1.loser.buybackEntryId!, late.entry.id];
    expect(r.paired).toHaveLength(1);
    expect(r.paired[0].number).toBe(5);
    expect(lone).toContain(r.paired[0].player_a_id);
    expect(lone).toContain(r.paired[0].player_b_id);
    expect(lone).toContain(r.waiting);
    expect(s.entries.find((e) => e.id === r.waiting)!.slot).toBe(11);
    // Every entry sits in the 16 tree; the R2 match was rebuilt there as M9.
    expect(s.entries.every((e) => e.slot !== null && e.slot <= 16)).toBe(true);
    expect(s.matches.filter((m) => m.round === 2).map((m) => m.number)).toEqual([9]);
    expect(r.openSlots).toBe(5);
    expect(openSlots(s)).toBe(5);
    expect(ctx.log.at(-1)?.action).toBe("convert_to_16");
    // Close still works as usual: the waiting player gets a free pass (O-4).
    closeBuybacks(s, ctx);
    expect(positionOf(s, r.waiting!).round).toBeGreaterThan(1);
  });

  it("an even number of lone players leaves nobody waiting", () => {
    const { s, ctx } = startNight({ bracket: 32, ratings: ratings(11) });
    play(s, ctx, 1, "a", "bought_back");
    const r = convertTo16(s, ctx);
    expect(r.paired).toHaveLength(1);
    expect(r.waiting).toBeNull();
    expect(s.matches.filter((m) => m.round === 1).map((m) => m.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("refuses more than 16 slots used, a 16 bracket, a started round-two match and a closed window, changing nothing", () => {
    const big = startNight({ bracket: 32, ratings: ratings(17) });
    const copy = cloneSnapshot(big.s);
    expect(() => convertTo16(big.s, big.ctx)).toThrow(/17 slots are used/);
    expect(big.s).toEqual(copy);

    const small = startNight({ bracket: 16, ratings: ratings(9) });
    expect(() => convertTo16(small.s, small.ctx)).toThrow(/already 16/);

    const going = startNight({ bracket: 32, ratings: ratings(8) });
    play(going.s, going.ctx, 1, "a", "declined");
    play(going.s, going.ctx, 2, "a", "declined");
    startOn(going.s, going.ctx, going.s.matches.find((m) => m.round === 2)!.id);
    expect(() => convertTo16(going.s, going.ctx)).toThrow(/R2M1 has started/);

    const closed = startNight({ bracket: 32, ratings: ratings(8) });
    closeBuybacks(closed.s, closed.ctx);
    expect(() => convertTo16(closed.s, closed.ctx)).toThrow(/Entries are closed/);
  });
});
