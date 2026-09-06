import { describe, expect, it } from "vitest";
import { addDrawEntry, startCompetition } from "@/lib/logic/competition";
import { halfFullPairs, openSlots, pickFreeSlot } from "@/lib/logic/derive";
import { seededRng } from "@/lib/logic/random";
import { makeCtx, setupNight, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("round-one fill (rules 8.2, spec 5.1)", () => {
  it.each([
    [16, 16, 8, null, [], 0],
    [16, 13, 6, 7, [8], 3],
    [16, 10, 5, null, [6, 7, 8], 6],
    [32, 32, 16, null, [], 0],
    [32, 21, 10, 11, [12, 13, 14, 15, 16], 11],
    [32, 17, 8, 9, [10, 11, 12, 13, 14, 15, 16], 15],
  ] as const)("bracket %d with %d players", (bracket, n, matches, halfFull, empty, open) => {
    const { s } = startNight({ bracket, ratings: ratings(n) });
    expect(s.competition.status).toBe("in_progress");
    expect(s.matches).toHaveLength(matches);
    expect(s.matches.map((m) => m.number).sort((a, b) => a - b)).toEqual(Array.from({ length: matches }, (_, i) => i + 1));
    expect(s.matches.every((m) => m.state === "not_started" && m.round === 1 && m.origin === "draw")).toBe(true);
    // Slots 1..N top to bottom, no gaps.
    expect(s.entries.map((e) => e.slot).sort((a, b) => a! - b!)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    const half = halfFullPairs(s);
    expect(half.map((h) => h.number)).toEqual(halfFull ? [halfFull] : []);
    if (halfFull) expect(half[0].slot).toBe(n);
    const emptyPairs = [];
    for (let k = 1; k <= bracket / 2; k++) {
      if (!s.entries.some((e) => e.slot === 2 * k - 1 || e.slot === 2 * k)) emptyPairs.push(k);
    }
    expect(emptyPairs).toEqual([...empty]);
    expect(openSlots(s)).toBe(open);
  });

  it("shuffles: two seeds give different slot orders", () => {
    const a = startNight({ bracket: 16, ratings: ratings(16) }, makeCtx(1));
    const b = startNight({ bracket: 16, ratings: ratings(16) }, makeCtx(2));
    const order = (s: typeof a.s) => s.entries.slice().sort((x, y) => x.slot! - y.slot!).map((e) => e.player_id);
    expect(order(a.s)).not.toEqual(order(b.s));
    expect(order(a.s).slice().sort()).toEqual(order(b.s).slice().sort());
  });

  it("snapshots ratings and the start on each match (5.6)", () => {
    const { s } = startNight({ bracket: 16, ratings: [45, 20] });
    const [m] = s.matches;
    expect(m.start_points).toBe(17);
    const weaker = s.entries.find((e) => e.player_id === "p1")!;
    expect(m.start_entry_id).toBe(weaker.id);
    expect([m.rating_a, m.rating_b].sort()).toEqual([20, 45]);
  });

  it("rejects fewer than 2 players and more than the bracket", () => {
    const one = setupNight({ bracket: 16, ratings: [10] });
    expect(() => startCompetition(one.s, one.ctx)).toThrow(/At least 2/);
    const full = setupNight({ bracket: 16, ratings: ratings(16) });
    full.s.players.push({ id: "extra", name: "Extra", rating: 1, active: true });
    expect(() => addDrawEntry(full.s, full.ctx, "extra")).toThrow(/32 bracket/);
  });

  it("cannot be started twice and refuses new draw entries after start", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    expect(() => startCompetition(s, ctx)).toThrow(/already started/);
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    expect(() => addDrawEntry(s, ctx, "late")).toThrow(/before the competition starts/);
  });

  it("placement picks the one empty match before the seat beside the lone first-draw player: 13 of 16 → slot 15 (5.2, O-13)", () => {
    const { s } = startNight({ bracket: 16, ratings: ratings(13) });
    for (let seed = 1; seed <= 10; seed++) expect(pickFreeSlot(s, seededRng(seed))).toBe(15);
  });

  it("placement for 10 of 16 is a random empty match: the lower slot of M6, M7 or M8, and not always the same one", () => {
    const { s } = startNight({ bracket: 16, ratings: ratings(10) });
    const picks = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const slot = pickFreeSlot(s, seededRng(seed))!;
      expect([11, 13, 15]).toContain(slot);
      picks.add(slot);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("a full bracket has nowhere to place", () => {
    const { s } = startNight({ bracket: 16, ratings: ratings(16) });
    expect(pickFreeSlot(s, seededRng(1))).toBeUndefined();
  });
});
