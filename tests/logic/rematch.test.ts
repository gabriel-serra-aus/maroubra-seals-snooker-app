import { describe, expect, it } from "vitest";
import { addLateArrival, closeBuybacks } from "@/lib/logic/buybacks";
import { boxOf } from "@/lib/logic/derive";
import { placeInSlot } from "@/lib/logic/matches";
import type { Ctx, EntryRow, Snapshot } from "@/lib/logic/types";
import { completeMatch } from "@/lib/logic/matchControl";
import { cloneSnapshot } from "@/lib/logic/types";
import { entry, makeCtx, match, nameOf, play, startNight, startOn } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

/** A late arrival put into a chosen slot, to build a bracket of a given shape. */
function lateAt(s: Snapshot, ctx: Ctx, slot: number) {
  const id = `late${slot}`;
  s.players.push({ id, name: `Late ${slot}`, rating: 30, active: true });
  const e: EntryRow = {
    id: ctx.newId(), competition_id: s.competition.id, player_id: id, source: "late", slot: null, buyback_seq: null,
    rebuy_of_entry_id: null, buyback_decision: null, rating_at_entry: 30, joined_round: 1, entered_at: ctx.now,
  };
  s.entries.push(e);
  placeInSlot(s, ctx, e, "placement", slot);
}

describe("a buy-back is kept away from their round-one opponent (spec 5.2, O-20)", () => {
  it("10 of 16: M5's loser never takes the empty M6, whose winner would meet M5's winner in round two", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) }, makeCtx(seed));
      const r = play(s, ctx, 5, "a", "bought_back");
      const slot = entry(s, r.loser.buybackEntryId!).slot!;
      expect([13, 15]).toContain(slot); // the empty M7 or M8, lower seat; never 11 (M6)
      expect(boxOf(slot, 2)).not.toBe(boxOf(9, 2));
    }
  });

  it("a seat beside a lone player elsewhere beats an empty match in the opponent's half", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(10) }, makeCtx(seed));
      lateAt(s, ctx, 13);
      lateAt(s, ctx, 14);
      lateAt(s, ctx, 15); // M6 empty (the rematch half), M7 full, M8 has one lone player
      const r = play(s, ctx, 5, "a", "bought_back");
      expect(entry(s, r.loser.buybackEntryId!).slot).toBe(16);
      expect(r.loser.buybackMatch?.number).toBe(8);
    }
  });

  it("14 of 16: the only seats are in the opponent's half, so the organiser is asked; yes places them", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(14) });
    const m7 = match(s, 7);
    const winner = nameOf(s, m7.player_a_id);
    const loser = nameOf(s, m7.player_b_id);
    startOn(s, ctx, m7.id);
    // The route's transaction rolls a refusal back; here a copy takes the throw.
    let asked: unknown;
    try {
      completeMatch(cloneSnapshot(s), ctx, m7.id, m7.player_a_id, "bought_back");
    } catch (e) {
      asked = e;
    }
    expect(asked).toMatchObject({ status: 409, extra: { code: "rematch", player: loser, opponent: winner } });
    expect((asked as Error).message).toBe(`The only open seats put ${loser} in line to meet ${winner} again in round 2`);

    const r = completeMatch(s, ctx, m7.id, m7.player_a_id, "bought_back", true);
    const bb = r.loser.buybackEntryId!;
    expect(entry(s, bb).slot).toBe(15);
    // Left alone at close, the free pass carries them into the round-two box M7's winner is in.
    closeBuybacks(s, ctx);
    expect(s.freePasses.map((fp) => fp.entry_id)).toContain(bb);
  });

  it("a late arrival has no round-one opponent and is placed as before (O-13)", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(14) });
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    expect(addLateArrival(s, ctx, "late").entry.slot).toBe(15);
  });
});
