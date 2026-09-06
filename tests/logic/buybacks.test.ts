import { describe, expect, it } from "vitest";
import { addLateArrival, closeBuybacks, switchBuybackMode } from "@/lib/logic/buybacks";
import { completeMatch, startMatch } from "@/lib/logic/matchControl";
import { freeSlotOrder, halfFullPairs, openSlots, positionOf, waitingEntries } from "@/lib/logic/derive";
import { entryOf, match, nameOf, play, slotEntry, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("slot placement (rules 3, 9; spec 5.2)", () => {
  it("Sequential, 13 of 16: buy-backs go 15, 16 (M8: buy-back v buy-back), then 14 (M7 with the waiting first-draw player)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13), mode: "sequential" });
    const gus = slotEntry(s, 13);
    const r1 = play(s, ctx, 1, "a", "bought_back");
    expect(r1.loser.decision).toBe("bought_back");
    const bb1 = entryOf(s, match(s, 1).player_b_id === r1.loser.buybackEntryId ? "" : s.entries.find((e) => e.id === r1.loser.buybackEntryId)!.player_id, "buyback");
    expect(bb1.slot).toBe(15);
    expect(bb1.buyback_seq).toBe(1);
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([7, 8]);
    expect(openSlots(s)).toBe(2);

    const r2 = play(s, ctx, 2, "a", "bought_back");
    expect(r2.loser.buybackMatch?.number).toBe(8);
    const m8 = match(s, 8);
    expect([slotEntry(s, 15).id, slotEntry(s, 16).id]).toEqual([m8.player_a_id, m8.player_b_id]);
    expect(s.entries.find((e) => e.id === m8.player_a_id)!.source).toBe("buyback");
    expect(s.entries.find((e) => e.id === m8.player_b_id)!.source).toBe("buyback");
    expect(openSlots(s)).toBe(1);

    const r3 = play(s, ctx, 3, "a", "bought_back");
    expect(r3.loser.buybackMatch?.number).toBe(7);
    const m7 = match(s, 7);
    expect(m7.player_a_id).toBe(gus.id);
    expect(slotEntry(s, 14).id).toBe(m7.player_b_id);
    expect(openSlots(s)).toBe(0);
    expect(halfFullPairs(s)).toEqual([]);
    expect(s.matches).toHaveLength(8);
  });

  it("Sequential, 10 of 16: buy-backs pair up as they arrive into M6, M7, M8", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    const results = [1, 2, 3, 4].map((n) => play(s, ctx, n, "b", "bought_back"));
    expect(results.map((r) => r.loser.buybackMatch?.number ?? null)).toEqual([null, 6, null, 7]);
    expect(match(s, 6).state).toBe("not_started");
    expect(openSlots(s)).toBe(2);
    // A late arrival takes slot 15 while the window is still open (M5 unfinished).
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const late = addLateArrival(s, ctx, "late");
    expect(late.match).toBeNull();
    expect(late.entry.slot).toBe(15);
    expect(late.entry.rebuy_of_entry_id).toBeNull();
    // The last first-draw loser buys back into slot 16 and completes M8; the window then auto-closes.
    const r5 = play(s, ctx, 5, "b", "bought_back");
    expect(r5.loser.buybackMatch?.number).toBe(8);
    expect(openSlots(s)).toBe(0);
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    s.players.push({ id: "later", name: "Later", rating: 30, active: true });
    expect(() => addLateArrival(s, ctx, "later")).toThrow(/closed/);
  });

  it("buy-backs meet buy-backs while an empty match remains (rules 3)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(11), mode: "sequential" });
    // slot 11 waits (M6 half-full); M7, M8 empty. First two buy-backs must form M7, not join M6.
    play(s, ctx, 1, "a", "bought_back");
    expect(freeSlotOrder(s)).toEqual([14, 15, 16, 12]);
    const r = play(s, ctx, 2, "a", "bought_back");
    expect(r.loser.buybackMatch?.number).toBe(7);
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([6]);
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
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    const r1 = play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back"); // M6 forms: bb1 v bb2
    const m6 = match(s, 6);
    const loserBb = m6.player_a_id === r1.loser.buybackEntryId ? m6.player_a_id : m6.player_b_id;
    // Buy-back loser is not offered the choice: passing a decision is a 400.
    startMatch(s, ctx, m6.id);
    const winner = m6.player_a_id === loserBb ? m6.player_b_id : m6.player_a_id;
    expect(() => completeMatch(s, ctx, m6.id, winner, "bought_back")).toThrow(/No buy-back decision/);
    const r = completeMatch(s, ctx, m6.id, winner);
    expect(r.loser.decision).toBeNull();
    expect(positionOf(s, loserBb).status).toBe("out");
  });
});

describe("modes (rules 9)", () => {
  it("Random Draw leaves buy-backs unplaced until close; close places them shuffled", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "random_draw" });
    [1, 2, 3, 4].forEach((n) => play(s, ctx, n, "a", "bought_back"));
    const unplaced = waitingEntries(s, 1).filter((e) => e.slot === null);
    expect(unplaced).toHaveLength(4);
    expect(s.matches).toHaveLength(5);
    play(s, ctx, 5, "a", "declined"); // last first-draw match → auto-close
    expect(s.competition.buybacks_closed_at).not.toBeNull();
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(7);
    expect(match(s, 6).origin).toBe("close");
    expect(match(s, 7).origin).toBe("close");
    expect(waitingEntries(s, 1)).toHaveLength(0);
  });

  it("switching Random → Sequential places the waiting buy-backs at once in re-entry order", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "random_draw" });
    const a = play(s, ctx, 1, "a", "bought_back").loser.buybackEntryId!;
    const b = play(s, ctx, 2, "a", "bought_back").loser.buybackEntryId!;
    const c = play(s, ctx, 3, "a", "bought_back").loser.buybackEntryId!;
    const created = switchBuybackMode(s, ctx, "sequential");
    expect(created.map((m) => m.number)).toEqual([6]);
    expect(match(s, 6).player_a_id).toBe(a);
    expect(match(s, 6).player_b_id).toBe(b);
    expect(s.entries.find((e) => e.id === c)!.slot).toBe(13);
    expect(s.competition.buyback_mode).toBe("sequential");
    // Now buy-backs place immediately.
    const d = play(s, ctx, 4, "a", "bought_back");
    expect(d.loser.buybackMatch?.number).toBe(7);
  });

  it("switching Sequential → Random leaves existing matches alone and accumulates from then on", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10), mode: "sequential" });
    play(s, ctx, 1, "a", "bought_back");
    play(s, ctx, 2, "a", "bought_back");
    const before = structuredClone(s.matches);
    expect(switchBuybackMode(s, ctx, "random_draw")).toEqual([]);
    expect(s.matches).toEqual(before);
    const r = play(s, ctx, 3, "a", "bought_back");
    expect(r.loser.buybackMatch).toBeNull();
    expect(s.entries.find((e) => e.id === r.loser.buybackEntryId)!.slot).toBeNull();
  });

  it("the switch is refused after close", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) });
    closeBuybacks(s, ctx);
    expect(() => switchBuybackMode(s, ctx, "sequential")).toThrow(/only be switched/);
  });
});

describe("Close Buy-Backs and round-one free passes (rules 11, O-4, spec 5.3)", () => {
  function nightWith(buybacks: number) {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13), mode: "random_draw" });
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
    expect(s.freePasses).toHaveLength(passes);
    expect(s.freePasses.every((fp) => fp.from_round === 1)).toBe(true);
    expect(s.competition.buybacks_closed_at).not.toBeNull();
  });

  it("with 1 buy-back both the first-draw waiter (M7) and the buy-back (M8) go through", () => {
    const { s } = nightWith(1);
    const gus = slotEntry(s, 13);
    const bb = s.entries.find((e) => e.source === "buyback")!;
    expect(bb.slot).toBe(15);
    expect(s.freePasses.map((fp) => fp.entry_id).sort()).toEqual([gus.id, bb.id].sort());
    expect(s.matches).toHaveLength(6);
  });

  it("with 2 buy-backs M8 is created and only the first-draw waiter goes through", () => {
    const { s } = nightWith(2);
    expect(match(s, 8).origin).toBe("close");
    expect(s.freePasses.map((fp) => nameOf(s, fp.entry_id))).toEqual([nameOf(s, slotEntry(s, 13).id)]);
  });

  it("closing twice or in round two is refused", () => {
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
