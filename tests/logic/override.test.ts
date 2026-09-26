import { describe, expect, it } from "vitest";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { currentRound, halfFullPairs, openSlots, positionOf, waitingEntries } from "@/lib/logic/derive";
import {
  growBracket,
  openPlaces,
  overrideAddPlayer,
  overrideDeleteMatch,
  overrideGrantFreePass,
  overrideMovePlayer,
  overridePair,
  overrideRemovePlayer,
  overrideReopenBuybacks,
  overrideReplacePlayer,
  overrideResetMatch,
  overrideRevokeFreePass,
} from "@/lib/logic/override";
import { hasMatch, match, play, playRound, slotEntry, startNight, startOn } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("master override (O-5, spec 3.9, 5.10)", () => {
  it("reset a finished match unwinds the winner's started next-round match too, and logs it", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m9 = match(s, 9);
    startOn(s, ctx, m9.id);
    const m1 = match(s, 1);
    const w1 = m1.winner_id!;
    overrideResetMatch(s, ctx, m1.id);
    expect(m1.state).toBe("not_started");
    expect(m1.winner_id).toBeNull();
    expect(m1.started_at).toBeNull();
    expect(hasMatch(s, 9)).toBe(false);
    expect(positionOf(s, w1)).toEqual({ status: "in_match", round: 1, matchId: m1.id });
    const other = match(s, 2).winner_id!;
    expect(positionOf(s, other)).toEqual({ status: "waiting", round: 2 });
    expect(ctx.log.map((l) => l.action)).toEqual(["reset_match"]);
    // Completing M1 again puts its winner back into M9 with the player left waiting there.
    play(s, ctx, 1, "b");
    const r2 = s.matches.filter((m) => m.round === 2);
    expect(r2).toHaveLength(1);
    expect(r2[0].number).toBe(9);
    expect([r2[0].player_a_id, r2[0].player_b_id].sort()).toEqual([other, match(s, 1).winner_id].sort());
  });

  it("delete a round-one match returns both players to waiting with their slots; pair puts them back", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    const m1 = match(s, 1);
    const [a, b] = [m1.player_a_id, m1.player_b_id];
    overrideDeleteMatch(s, ctx, m1.id);
    expect(s.matches).toHaveLength(1);
    expect(waitingEntries(s, 1).map((e) => e.id).sort()).toEqual([a, b].sort());
    expect(slotEntry(s, 1).id).toBe(a);
    const m = overridePair(s, ctx, a, b);
    expect(m.number).toBe(1);
    expect(m.origin).toBe("override");
  });

  it("delete is refused from round two; pair from round two needs the same box of the tree", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) });
    play(s, ctx, 1, "a", "declined");
    play(s, ctx, 3, "a", "declined"); // winners of M1 (box 1) and M3 (box 2) both wait in round two
    const w1 = match(s, 1).winner_id!;
    const w3 = match(s, 3).winner_id!;
    expect(() => overridePair(s, ctx, w1, w3)).toThrow(/different parts of the bracket/);
    play(s, ctx, 2, "a", "declined"); // → M9 forms while the window is still open
    expect(() => overrideDeleteMatch(s, ctx, match(s, 9).id)).toThrow(/round-one match/);
  });

  it("replace a player recomputes the start and swaps slots in round one", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [45, 20, 33] });
    const m1 = match(s, 1);
    const waiter = slotEntry(s, 3);
    const outId = m1.player_a_id;
    startOn(s, ctx, m1.id);
    overrideReplacePlayer(s, ctx, m1.id, "a", waiter.id);
    expect(m1.player_a_id).toBe(waiter.id);
    expect(m1.state).toBe("in_play");
    expect(waiter.slot).toBe(1);
    expect(s.entries.find((e) => e.id === outId)!.slot).toBe(3);
    const ra = s.players.find((p) => p.id === waiter.player_id)!.rating;
    const rb = m1.rating_b;
    expect(m1.start_points).toBe(Math.round((2 * Math.abs(ra - rb)) / 3));
    expect(() => overrideReplacePlayer(s, ctx, m1.id, "b", outId)).not.toThrow();
  });

  it("add a player after close in round one places them at once; grows 16 → 32 when full", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(16) });
    closeBuybacks(s, ctx);
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const e = overrideAddPlayer(s, ctx, "late");
    expect(s.competition.bracket_size).toBe(32);
    // A random empty match of the new bottom half (O-13 applies to the override too), its lower seat.
    expect(e.slot).toBeGreaterThanOrEqual(17);
    expect(e.slot! % 2).toBe(1);
    // Buy-backs are closed, so the newcomer is alone in their match and climbs the empty bottom half to the final.
    expect(halfFullPairs(s)).toEqual([]);
    expect(s.freePasses.filter((fp) => fp.entry_id === e.id).map((fp) => fp.from_round)).toEqual([1, 2, 3, 4]);
    expect(positionOf(s, e.id)).toEqual({ status: "waiting", round: 5 });
    expect(ctx.log.map((l) => l.action)).toEqual(["grow_bracket", "add_player"]);
    expect(() => overrideAddPlayer(s, ctx, "late")).toThrow(/already in/);
  });

  it("add a player once round two exists: they take an open place and climb until they meet someone", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx); // M9 exists; slots 1–4 are spoken for
    expect(openPlaces(s)).toEqual(Array.from({ length: 12 }, (_, i) => i + 5));
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const e = overrideAddPlayer(s, ctx, "late");
    expect(e.slot).toBe(5);
    expect(e.joined_round).toBe(1);
    // Alone in M3, then M10 (M4 empty), so passes rounds 1 and 2 and waits in M13 for M9's winner.
    expect(s.freePasses.filter((fp) => fp.entry_id === e.id).map((fp) => fp.from_round)).toEqual([1, 2]);
    expect(positionOf(s, e.id)).toEqual({ status: "waiting", round: 3 });
    expect(openSlots(s)).toBe(11);
    play(s, ctx, 9, "a");
    expect(match(s, 13).player_b_id).toBe(e.id);
  });

  it("grow bracket renumbers later rounds by position: M9 becomes M17", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    expect(hasMatch(s, 9)).toBe(true);
    growBracket(s, ctx);
    expect(hasMatch(s, 9)).toBe(false);
    expect(match(s, 17).round).toBe(2);
    expect(() => growBracket(s, ctx)).toThrow(/already 32/);
  });

  it("remove a player deletes not-started matches and voids a won match, refusing if the next has started", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m1 = match(s, 1);
    const winner = s.entries.find((e) => e.id === m1.winner_id)!;
    const changes = overrideRemovePlayer(s, ctx, winner.player_id);
    expect(changes).toEqual(expect.arrayContaining(["R2M1 deleted", "R1M1 voided", "entry removed"]));
    expect(s.matches.filter((m) => m.round === 1).map((m) => m.number)).toEqual([2]);
    expect(s.entries.some((e) => e.id === winner.id)).toBe(false);
    // Round one is closed, so the M1 loser, now without an opponent, goes through (O-4) into M9 with M2's winner.
    expect(waitingEntries(s, 1)).toHaveLength(0);
    expect(s.freePasses.filter((fp) => fp.from_round === 1)).toHaveLength(1);
    expect(s.matches.filter((m) => m.round === 2)).toHaveLength(1);
  });

  it("remove refuses, naming the match, when the cascade cannot go far enough", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    startOn(s, ctx, match(s, 9).id);
    const winner = s.entries.find((e) => e.id === match(s, 1).winner_id)!;
    expect(() => overrideRemovePlayer(s, ctx, winner.player_id)).toThrow(/R2M1/);
  });

  it("a removed loser's finished match stays as history", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    play(s, ctx, 1, "a", "declined");
    const loser = s.entries.find((e) => e.id === match(s, 1).player_b_id)!;
    overrideRemovePlayer(s, ctx, loser.player_id);
    expect(match(s, 1).state).toBe("finished");
    expect(s.entries.some((e) => e.id === loser.id)).toBe(true);
  });

  it("grant and revoke a free pass", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(3) });
    const gus = slotEntry(s, 3);
    const fp = overrideGrantFreePass(s, ctx, gus.id, 1);
    expect(positionOf(s, gus.id)).toEqual({ status: "waiting", round: 2 });
    expect(() => overrideGrantFreePass(s, ctx, gus.id, 1)).toThrow(/not waiting in round 1/);
    overrideRevokeFreePass(s, ctx, fp.id);
    expect(positionOf(s, gus.id)).toEqual({ status: "waiting", round: 1 });
    expect(ctx.log.map((l) => l.action)).toEqual(["grant_free_pass", "revoke_free_pass"]);
  });

  it("reopen buy-backs takes back the free passes the close gave, unless a match reached through one has started", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(3) });
    expect(() => overrideReopenBuybacks(s, ctx)).toThrow(/already open/);
    const gus = slotEntry(s, 3);
    play(s, ctx, 1, "a", "declined");
    closeBuybacks(s, ctx); // Gus passes into M9 against the M1 winner
    expect(hasMatch(s, 9)).toBe(true);
    overrideReopenBuybacks(s, ctx);
    expect(s.competition.buybacks_closed_at).toBeNull();
    expect(s.freePasses).toHaveLength(0);
    expect(hasMatch(s, 9)).toBe(false);
    expect(positionOf(s, gus.id)).toEqual({ status: "waiting", round: 1 });
    expect(currentRound(s)).toBe(1);
    closeBuybacks(s, ctx);
    startOn(s, ctx, match(s, 9).id);
    expect(() => overrideReopenBuybacks(s, ctx)).toThrow(/R2M1 has started/);
  });
});

describe("override add player follows the placement rule (spec 5.2, O-13)", () => {
  it("13 of 16: an added player takes the empty M8, not the seat beside the lone first-draw player in M7", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(13) });
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const e = overrideAddPlayer(s, ctx, "late");
    expect(e.slot).toBe(15);
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([7, 8]);
    // Nothing empty is left now: the next one sits beside a lone player, at random.
    s.players.push({ id: "later", name: "Later", rating: 30, active: true });
    const e2 = overrideAddPlayer(s, ctx, "later");
    expect([14, 16]).toContain(e2.slot);
    expect(halfFullPairs(s)).toHaveLength(1);
  });

  describe("move a player who has not played (spec 5.10, O-17)", () => {
    it("a waiting player moves to an empty pair; beside a lone waiter they pair at once", () => {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) }); // M1, M2, M3; slots 7–16 open
      overrideDeleteMatch(s, ctx, match(s, 3).id); // slots 5 and 6 both waiting
      const five = slotEntry(s, 5);
      const six = slotEntry(s, 6);
      overrideMovePlayer(s, ctx, five.id, 9);
      expect(five.slot).toBe(9);
      expect(hasMatch(s, 5)).toBe(false);
      overrideMovePlayer(s, ctx, six.id, 10);
      expect(six.slot).toBe(10);
      const m5 = match(s, 5);
      expect([m5.player_a_id, m5.player_b_id]).toEqual([five.id, six.id]);
      expect(m5.origin).toBe("override");
      expect(ctx.log.map((l) => l.action)).toEqual(["delete_match", "move_player", "move_player"]);
    });

    it("a player in a not-started match leaves it: the match goes and the seat-mate waits", () => {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
      const m2 = match(s, 2);
      const [a, b] = [m2.player_a_id, m2.player_b_id];
      overrideMovePlayer(s, ctx, a, 7);
      expect(hasMatch(s, 2)).toBe(false);
      expect(positionOf(s, b)).toEqual({ status: "waiting", round: 1 });
      expect(positionOf(s, a)).toEqual({ status: "waiting", round: 1 });
      expect(ctx.log[0].details).toMatchObject({ from: 3, to: 7, deleted: "R1M2" });
    });

    it("after close the move runs the automatic step: both halves get their free passes", () => {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
      closeBuybacks(s, ctx);
      const a = match(s, 2).player_a_id;
      const b = match(s, 2).player_b_id;
      overrideMovePlayer(s, ctx, a, 7);
      expect(s.freePasses.some((fp) => fp.entry_id === b && fp.from_round === 1)).toBe(true);
      expect(s.freePasses.some((fp) => fp.entry_id === a && fp.from_round === 1)).toBe(true);
    });

    it("refuses a started or finished match, a later round, a taken slot and a decided box", () => {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(6) });
      const m1 = match(s, 1);
      startOn(s, ctx, m1.id);
      expect(() => overrideMovePlayer(s, ctx, m1.player_a_id, 9)).toThrow(/has already played/);
      play(s, ctx, 1, "a", "declined");
      expect(() => overrideMovePlayer(s, ctx, m1.player_b_id, 9)).toThrow(/has already played/);
      expect(() => overrideMovePlayer(s, ctx, m1.winner_id!, 9)).toThrow(/has already played/);
      const m3 = match(s, 3);
      expect(() => overrideMovePlayer(s, ctx, m3.player_a_id, 3)).toThrow(/Slot 3 is taken/);
      expect(() => overrideMovePlayer(s, ctx, m3.player_a_id, 17)).toThrow(/no slot 17/);
    });

    it("refuses an empty seat beside a free-pass holder", () => {
      const { s, ctx } = startNight({ bracket: 16, ratings: ratings(5) }); // slot 5 alone
      closeBuybacks(s, ctx); // slot 5 passes; slot 6 sits under that decided box
      expect(() => overrideMovePlayer(s, ctx, match(s, 1).player_a_id, 6)).toThrow(/under a box already decided/);
      expect(() => overrideMovePlayer(s, ctx, slotEntry(s, 5).id, 9)).toThrow(/has already played/);
    });
  });
});
