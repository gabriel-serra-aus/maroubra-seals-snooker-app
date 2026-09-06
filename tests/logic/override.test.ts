import { describe, expect, it } from "vitest";
import { closeBuybacks } from "@/lib/logic/buybacks";
import { currentRound, halfFullPairs, openSlots, positionOf, waitingEntries } from "@/lib/logic/derive";
import { startMatch } from "@/lib/logic/matchControl";
import {
  growBracket,
  overrideAddPlayer,
  overrideDeleteMatch,
  overrideGrantFreePass,
  overridePair,
  overrideRemovePlayer,
  overrideReopenBuybacks,
  overrideReplacePlayer,
  overrideResetMatch,
  overrideRevokeFreePass,
} from "@/lib/logic/override";
import { match, play, playRound, slotEntry, startNight } from "./helpers";

const ratings = (n: number) => Array.from({ length: n }, (_, i) => 20 + i);

describe("master override (O-5, spec 3.9, 5.10)", () => {
  it("reset a finished match unwinds the winner's started next-round match too, and logs it", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m9 = match(s, 9);
    startMatch(s, ctx, m9.id);
    const m1 = match(s, 1);
    const w1 = m1.winner_id!;
    overrideResetMatch(s, ctx, m1.id);
    expect(m1.state).toBe("not_started");
    expect(m1.winner_id).toBeNull();
    expect(m1.started_at).toBeNull();
    expect(s.matches.some((m) => m.number === 9)).toBe(false);
    expect(positionOf(s, w1)).toEqual({ status: "in_match", round: 1, matchId: m1.id });
    const other = match(s, 2).winner_id!;
    expect(positionOf(s, other)).toEqual({ status: "waiting", round: 2 });
    expect(ctx.log.map((l) => l.action)).toEqual(["reset_match"]);
    // Completing M1 again pairs the winner with the player left waiting in round 2.
    play(s, ctx, 1, "b");
    const r2 = s.matches.filter((m) => m.round === 2);
    expect(r2).toHaveLength(1);
    expect([r2[0].player_a_id, r2[0].player_b_id].sort()).toEqual([other, match(s, 1).winner_id].sort());
  });

  it("delete a match returns both players to waiting with their slots; pair puts them back", () => {
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

  it("pair works in round two without slots", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m9 = match(s, 9);
    overrideDeleteMatch(s, ctx, m9.id);
    const m = overridePair(s, ctx, m9.player_a_id, m9.player_b_id);
    expect(m.round).toBe(2);
    expect(m.number).toBe(9); // the deleted number is free again
  });

  it("replace a player recomputes the start and swaps slots in round one", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: [45, 20, 33] });
    const m1 = match(s, 1);
    const waiter = slotEntry(s, 3);
    const outId = m1.player_a_id;
    startMatch(s, ctx, m1.id);
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
    expect(e.slot).toBe(17);
    expect(halfFullPairs(s).map((h) => h.number)).toEqual([9]);
    expect(ctx.log.map((l) => l.action)).toEqual(["grow_bracket", "add_player"]);
    expect(() => overrideAddPlayer(s, ctx, "late")).toThrow(/already in/);
  });

  it("add a player in round two makes them a waiting player there", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    s.players.push({ id: "late", name: "Late", rating: 30, active: true });
    const e = overrideAddPlayer(s, ctx, "late");
    expect(e.joined_round).toBe(2);
    expect(positionOf(s, e.id)).toEqual({ status: "waiting", round: 2 });
    expect(openSlots(s)).toBe(11); // no slot consumed in round two? entries count does: 16 − 5
  });

  it("remove a player deletes not-started matches and voids a won match, refusing if the next has started", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    const m1 = match(s, 1);
    const winner = s.entries.find((e) => e.id === m1.winner_id)!;
    const changes = overrideRemovePlayer(s, ctx, winner.player_id);
    expect(changes).toEqual(expect.arrayContaining(["M9 deleted", "M1 voided", "entry removed"]));
    expect(s.matches.map((m) => m.number)).toEqual([2]);
    expect(s.entries.some((e) => e.id === winner.id)).toBe(false);
    // The M1 loser is waiting again in slot pair 1 and blocks the round-two draw; the M2 winner waits in round 2.
    expect(waitingEntries(s, 1)).toHaveLength(1);
    expect(waitingEntries(s, 2)).toHaveLength(1);
    // A free pass for the M1 loser unblocks it.
    overrideGrantFreePass(s, ctx, waitingEntries(s, 1)[0].id, 1);
    expect(s.matches.filter((m) => m.round === 2)).toHaveLength(1);
  });

  it("remove refuses, naming the match, when the cascade cannot go far enough", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    playRound(s, ctx);
    startMatch(s, ctx, match(s, 9).id);
    const winner = s.entries.find((e) => e.id === match(s, 1).winner_id)!;
    expect(() => overrideRemovePlayer(s, ctx, winner.player_id)).toThrow(/M9/);
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

  it("reopen buy-backs only in round one, grow bracket only from 16", () => {
    const { s, ctx } = startNight({ bracket: 16, ratings: ratings(4) });
    expect(() => overrideReopenBuybacks(s, ctx)).toThrow(/already open/);
    closeBuybacks(s, ctx);
    overrideReopenBuybacks(s, ctx);
    expect(s.competition.buybacks_closed_at).toBeNull();
    growBracket(s, ctx);
    expect(() => growBracket(s, ctx)).toThrow(/already 32/);
    playRound(s, ctx);
    expect(currentRound(s)).toBe(2);
    expect(() => overrideReopenBuybacks(s, ctx)).toThrow(/round one/);
  });
});
