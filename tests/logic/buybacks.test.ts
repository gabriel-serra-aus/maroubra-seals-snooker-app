import { describe, expect, it } from "vitest";
import { addLateArrival, closeBuybacks } from "@/lib/logic/buybacks";
import { completeMatch, startMatch } from "@/lib/logic/matchControl";
import { halfFullPairs, matchNumberForSlot, mateSlot, openSlots, positionOf, waitingEntries } from "@/lib/logic/derive";
import { entry, hasMatch, makeCtx, match, nameOf, play, slotEntry, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("placement on entry (rules 3, 9; spec 5.2; O-13)", () => {
  it("13 of 16: the first buy-back takes the empty M8, the next two fill the seats beside a lone player, no free pass at close", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    const gus = slotEntry(s, 13);
    const r1 = play(s, ctx, 1, "a", "bought_back");
    expect(r1.loser.decision).toBe("bought_back");
    const bb1 = entry(s, r1.loser.buybackEntryId!);
    expect(bb1.slot).toBe(15);
    expect(bb1.buyback_seq).toBe(1);
    expect(r1.loser.buybackMatch).toBeNull();
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([7, 8]);
    expect(openSlots(s)).toBe(2);

    // Nothing empty is left: the seat beside Gus (14) or beside the buy-back (16), at random.
    const r2 = play(s, ctx, 2, "a", "bought_back");
    const bb2 = entry(s, r2.loser.buybackEntryId!);
    expect([14, 16]).toContain(bb2.slot);
    expect(r2.loser.buybackMatch?.number).toBe(matchNumberForSlot(bb2.slot!));
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([bb2.slot === 14 ? 8 : 7]);

    const r3 = play(s, ctx, 3, "a", "bought_back");
    const bb3 = entry(s, r3.loser.buybackEntryId!);
    expect(bb3.slot).toBe(mateSlot(bb2.slot === 14 ? 15 : 13));
    expect(openSlots(s)).toBe(0);
    expect(halfFullPairs(s)).toEqual([]);
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(8);
    expect(hasMatch(s, 9)).toBe(true); // M1 and M2 winners have already moved up
    expect(match(s, 7).player_a_id).toBe(gus.id);
    expect(s.matches.filter((m) => m.origin === "placement")).toHaveLength(2);
  });

  it("10 of 16: the first three buy-backs each take a different empty match; the fourth joins one of them", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    const results = [1, 2, 3].map((n) => play(s, ctx, n, "b", "bought_back"));
    expect(results.map((r) => r.loser.buybackMatch)).toEqual([null, null, null]);
    const slots = results.map((r) => entry(s, r.loser.buybackEntryId!).slot!);
    expect(slots.map(matchNumberForSlot).sort()).toEqual([6, 7, 8]);
    expect(slots.every((x) => x % 2 === 1)).toBe(true); // the lower seat of each empty pair
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([6, 7, 8]);
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(5);
    // A late arrival now has no empty match: they sit down beside one of the three.
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const late = addLateArrival(s, ctx, "late");
    expect(late.match).not.toBeNull();
    expect([12, 14, 16]).toContain(late.entry.slot);
    expect(late.entry.rebuy_of_entry_id).toBeNull();
    expect(late.match!.origin).toBe("placement");
    expect(halfFullPairs(s)).toHaveLength(2);
    expect(openSlots(s)).toBe(2);
    // The last two first-draw results: one declines, one buys back beside a lone player; the window
    // auto-closes and the last lone player goes through.
    play(s, ctx, 4, "b", "declined");
    expect(s.competition.buybacks_closed_at).toBeNull();
    const r5 = play(s, ctx, 5, "b", "bought_back");
    expect(r5.loser.buybackMatch).not.toBeNull();
    expect(openSlots(s)).toBe(1);
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(r5.autoClose?.freePasses).toHaveLength(1);
    s.players.push({ id: "later", name: "Later", rating: 30, active: true });
    expect(() => addLateArrival(s, ctx, "later")).toThrow(/closed/);
  });

  it("the organiser's example: 5 players, a buy-back takes an empty match even though a first-draw player is waiting; the next pairs with a random lone player", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(5) }, makeCtx(3));
    const p5 = slotEntry(s, 5);
    const r1 = play(s, ctx, 1, "a", "bought_back");
    const bb1 = entry(s, r1.loser.buybackEntryId!);
    expect(bb1.slot).toBeGreaterThanOrEqual(7); // M4..M8, not M3 beside P5
    expect(r1.loser.buybackMatch).toBeNull();
    // Fill the remaining empty matches with late arrivals, then one more must pair up.
    for (let i = 0; i < 4; i++) {
      s.players.push({ id: `late${i}`, name: `Late${i}`, rating: 30, active: true });
      expect(addLateArrival(s, ctx, `late${i}`).match).toBeNull();
    }
    expect(halfFullPairs(s)).toHaveLength(6); // P5 + bb1 + 4 late arrivals, each alone
    const r2 = play(s, ctx, 2, "a", "bought_back");
    const bb2 = entry(s, r2.loser.buybackEntryId!);
    expect(r2.loser.buybackMatch).not.toBeNull();
    const partner = entry(s, r2.loser.buybackMatch!.player_a_id === bb2.id ? r2.loser.buybackMatch!.player_b_id : r2.loser.buybackMatch!.player_a_id);
    expect([p5.id, bb1.id, ...s.entries.filter((e) => e.player_id.startsWith("late")).map((e) => e.id)]).toContain(partner.id);
  });
});

describe("capacity (O-3)", () => {
  it("a full 16 bracket accepts no buy-backs: the loser gets no_slots", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(16) });
    const r = play(s, ctx, 1, "a", "bought_back");
    expect(r.loser.decision).toBe("no_slots");
    expect(s.entries).toHaveLength(16);
    expect(s.entries.find((e) => e.id === match(s, 1).player_b_id)!.buyback_decision).toBe("no_slots");
  });

  it("13 of 16 accepts exactly three, first come first served", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    const decisions = [1, 2, 3, 4, 5].map((n) => play(s, ctx, n, "a", "bought_back").loser.decision);
    expect(decisions).toEqual(["bought_back", "bought_back", "bought_back", "no_slots", "no_slots"]);
    expect(openSlots(s)).toBe(0);
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    expect(() => addLateArrival(s, ctx, "late")).toThrow(/No open slots/);
  });

  it("a player can buy back once only", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(15) });
    // 15 of 16: the single free seat is beside the lone first-draw player in M8.
    const r1 = play(s, ctx, 1, "a", "bought_back");
    const m8 = r1.loser.buybackMatch!;
    expect(m8.number).toBe(8);
    const loserBb = r1.loser.buybackEntryId!;
    // Buy-back loser is not offered the choice: passing a decision is a 400.
    startMatch(s, ctx, m8.id);
    const winner = m8.player_a_id === loserBb ? m8.player_b_id : m8.player_a_id;
    expect(() => completeMatch(s, ctx, m8.id, winner, "bought_back")).toThrow(/No buy-back decision/);
    const r = completeMatch(s, ctx, m8.id, winner);
    expect(r.loser.decision).toBeNull();
    expect(positionOf(s, loserBb).status).toBe("out");
  });
});

describe("Close Buy-Backs and round-one free passes (rules 11, O-4, spec 5.3)", () => {
  function nightWith(buybacks: number) {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    // Only play some matches, so the window stays open until we close it by hand.
    for (let n = 1; n <= buybacks; n++) play(s, ctx, n, "a", "bought_back");
    const result = closeBuybacks(s, ctx);
    return { s, ctx, result };
  }

  it.each([
    [3, 0],
    [2, 1],
    [1, 2],
    [0, 1],
  ])("13 of 16 with %d buy-backs at close → %d free passes", (buybacks, passes) => {
    const { s, result } = nightWith(buybacks);
    expect(result.freePasses).toHaveLength(passes);
    expect(s.freePasses.filter((fp) => fp.from_round === 1)).toHaveLength(passes);
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(waitingEntries(s, 1)).toHaveLength(0);
  });

  it("with 1 buy-back both the first-draw waiter (M7) and the buy-back (M8) go through, and meet in M12", () => {
    const { s } = nightWith(1);
    const gus = slotEntry(s, 13);
    const bb = s.entries.find((e) => e.source === "buyback")!;
    expect(bb.slot).toBe(15);
    expect(s.freePasses.filter((fp) => fp.from_round === 1).map((fp) => fp.entry_id).sort()).toEqual([gus.id, bb.id].sort());
    // M7 and M8 feed round-two box 4 = M12: the two pass-holders play each other there at once.
    expect(hasMatch(s, 12)).toBe(true);
    expect([match(s, 12).player_a_id, match(s, 12).player_b_id]).toEqual([gus.id, bb.id]);
    expect(match(s, 12).origin).toBe("advance");
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(6);
  });

  it("with 2 buy-backs only one player is alone and goes through", () => {
    const { s } = nightWith(2);
    const lone = s.freePasses.filter((fp) => fp.from_round === 1);
    expect(lone).toHaveLength(1);
    expect([nameOf(s, slotEntry(s, 13).id), nameOf(s, slotEntry(s, 15).id)]).toContain(nameOf(s, lone[0].entry_id));
  });

  it("closing twice is refused", () => {
    const { s, ctx } = nightWith(3);
    expect(() => closeBuybacks(s, ctx)).toThrow(/already closed/);
  });

  it("after close a loser is out however willing (O-12)", () => {
    const { s, ctx } = nightWith(0);
    expect(() => play(s, ctx, 1, "a", "bought_back")).toThrow(/No buy-back decision/);
    const r = play(s, ctx, 1, "a");
    expect(r.loser.decision).toBeNull();
  });
});
