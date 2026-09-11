import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import { api, find, loginAs, playCurrentRound, playMatch, freeTable } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

async function club(n: number, prefix = "Player") {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await api.createPlayer(`${prefix} ${i + 1}`, 20 + i);
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
    ids.push(r.body.player.id);
  }
  return ids;
}

async function night(playerIds: string[], body: Record<string, unknown> = {}) {
  const c = await api.createCompetition({ bracket_size: 16, ...body });
  const id = c.body.competition.id;
  for (const p of playerIds) await api.addEntry(id, { player_id: p });
  const s = await api.start(id);
  expect(s.status).toBe(200);
  return { id, bracket: s.body.bracket };
}

describe("32 bracket, buy-backs and a late arrival placed at once, manual close", () => {
  let ids: string[] = [];
  let comp = "";

  it("21 players → 10 matches, M11 half-full, 11 open slots", async () => {
    ids = await club(24);
    const c = await api.createCompetition({ bracket_size: 32, default_time_limit_minutes: 20 });
    comp = c.body.competition.id;
    for (const p of ids.slice(0, 21)) await api.addEntry(comp, { player_id: p });
    const b = (await api.start(comp)).body.bracket;
    expect(find.round(b, 1).matches).toHaveLength(10);
    expect(find.round(b, 1).awaiting[0]).toMatchObject({ number: 11, slot: 21 });
    expect(b.competition?.open_slots).toBe(11);
    expect(b.competition?.rounds_total).toBe(5);
    expect(find.match(b, 1).time_limit_minutes).toBe(20);
  });

  it("buy-backs and a late arrival each take a random empty match while one exists (O-13)", async () => {
    let b = (await api.bracket(comp)).body;
    const r1 = await playMatch(find.match(b, 1), "b", "bought_back");
    expect(r1.buyback_match_number).toBeNull();
    const r2 = await playMatch(find.match(b, 2), "b", "bought_back");
    expect(r2.buyback_match_number).toBeNull();
    expect(r2.winner_to).toEqual({ kind: "match", round: 2, match_number: 17 });
    const late = await api.addEntry(comp, { new_player: { name: "Late Larry", rating: 30 } });
    expect(late.status).toBe(201);
    expect(late.body.match_number).toBeNull();
    expect(late.body.awaiting_in).toBeGreaterThanOrEqual(12);
    b = late.body.bracket;
    // Flagged as a late arrival, not a buy-back (rules 3): no sequence, and still entitled to one buy-back.
    const larry = b.entries.find((e) => e.name === "Late Larry")!;
    expect(larry.source).toBe("late");
    expect(larry.buyback_seq).toBeNull();
    expect(larry.has_buyback_entry).toBe(false);
    const awaiting = find.round(b, 1).awaiting.map((a) => a.number);
    expect(awaiting).toHaveLength(4);
    expect(awaiting[0]).toBe(11);
    expect(new Set(awaiting).size).toBe(4); // four different matches
    expect(b.competition?.open_slots).toBe(8);
  });

  it("Close Buy-Backs by hand: every lone player gets a free pass; the response says so", async () => {
    const close = await api.closeBuybacks(comp);
    expect(close.status).toBe(200);
    expect(close.body.free_passes).toBe(4);
    expect(close.body.free_pass_names).toContain("Late Larry");
    expect(close.body.completed).toBe(false);
    const b = close.body.bracket;
    expect(find.round(b, 1).free_passes).toHaveLength(4);
    expect(find.round(b, 1).free_passes.map((fp) => fp.entry.slot)).toContain(21);
    // A late loser is out now (O-12).
    const r = await playMatch(find.match(b, 4), "a");
    expect(r.loser_decision).toBeNull();
    expect((await api.addEntry(comp, { player_id: ids[23] })).status).toBe(409);
  });

  it("the night plays up the tree to the final, M31", async () => {
    let b = await playCurrentRound(comp);
    expect(find.matchesInRound(b, 1)).toHaveLength(10);
    expect(find.matchesInRound(b, 2)[0].number).toBe(17);
    let guard = 0;
    while (b.competition?.status === "in_progress" && guard++ < 10) b = await playCurrentRound(comp);
    expect(b.competition?.status).toBe("complete");
    expect(find.match(b, 31).round).toBe(5);
    expect(b.competition?.winner?.entry_id).toBe(find.match(b, 31).winner_id);
  });
});

describe("master override routes (spec 7.6) with dry runs", () => {
  let ids: string[] = [];
  let comp = "";

  it("dry run describes without writing; reset unwinds a started next-round match", async () => {
    ids = await club(4, "Four");
    const n = await night(ids.slice(0, 4));
    comp = n.id;
    let b = await playCurrentRound(comp);
    const m9 = find.match(b, 9);
    await api.startMatch(m9.id, { table: freeTable(b) });
    b = (await api.bracket(comp)).body;
    const m1 = find.match(b, 1);
    expect(m1.correction_blocked).toMatch(/R2M1 has started/);
    expect((await api.correct(m1.id, m1.a.entry_id)).status).toBe(409);
    const dry = await api.ov.reset(m1.id, { dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.dry_run).toBe(true);
    expect(dry.body.changes).toEqual(expect.arrayContaining([expect.stringMatching(/R2M1 .* removed/), "R1M1 reset to not started"]));
    expect(find.match((await api.bracket(comp)).body, 1).state).toBe("finished"); // nothing written
    const real = await api.ov.reset(m1.id);
    expect(real.status).toBe(200);
    b = real.body.bracket;
    expect(find.match(b, 1).state).toBe("not_started");
    expect(find.matchesInRound(b, 2)).toHaveLength(0);
    expect(find.round(b, 2).waiting).toHaveLength(1);
    expect(find.round(b, 2).awaiting[0].number).toBe(9);
    const log = (await api.adminActions(comp)).body.actions;
    expect(log[0]).toMatchObject({ actor: "Gabriel", action: "reset_match", details: { match: "R1M1", from: "finished" } });
    // Replay M1: the winner goes back into M9 with the waiting round-two player.
    await playMatch(find.match(b, 1), "b");
    b = (await api.bracket(comp)).body;
    expect(find.matchesInRound(b, 2)).toHaveLength(1);
    expect(find.round(b, 2).waiting).toHaveLength(0);
  });

  it("delete (round one only), reopen, add, grow, replace, free pass and remove", async () => {
    let b = (await api.bracket(comp)).body;
    const m9 = find.matchesInRound(b, 2)[0];
    const del = await api.ov.deleteMatch(m9.id);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/round-one match/);

    // Reopen buy-backs (nothing to unwind: no free pass was given) and add a late arrival the normal way.
    const reopen = await api.ov.reopen(comp);
    expect(reopen.status).toBe(200);
    expect(reopen.body.bracket.competition?.buybacks_open).toBe(true);
    const late = await api.addEntry(comp, { new_player: { name: "Late Lucy", rating: 30 } });
    expect(late.status).toBe(201);
    expect(late.body.match_number).toBeNull();
    // Closing again: Larry is alone, passes round one and climbs until someone is waiting for him.
    const close = await api.closeBuybacks(comp);
    expect(close.status).toBe(200);
    expect(close.body.free_pass_names).toEqual(["Late Lucy"]);
    b = close.body.bracket;
    const larry = b.entries.find((e) => e.name === "Late Lucy")!;
    expect(larry.position.status).toBe("waiting");
    expect(larry.position.round).toBeGreaterThanOrEqual(3);

    // Grow the bracket: M9 is renumbered by its position in the 32 tree.
    expect((await api.ov.grow(comp)).status).toBe(200);
    expect((await api.ov.grow(comp)).status).toBe(409);
    b = (await api.bracket(comp)).body;
    expect(find.matchesInRound(b, 2)[0].number).toBe(17);
    expect(b.competition?.rounds_total).toBe(5);

    // Add a player through the override: an open place in the tree, then climbs.
    const add = await api.ov.addPlayer(comp, { new_player: { name: "Extra Eddie", rating: 33 } });
    expect(add.status).toBe(200);
    b = add.body.bracket;
    const eddie = b.entries.find((e) => e.name === "Extra Eddie")!;
    expect(eddie.position.status).toBe("waiting");
    expect(eddie.slot).not.toBeNull();
    // Replace in M17 needs someone waiting in round two; Eddie is further up the tree.
    const rep = await api.ov.replace(find.match(b, 17).id, { slot: "a", entry_id: eddie.entry_id });
    expect(rep.status).toBe(409);
    // Grant a free pass to Eddie from wherever he waits; he moves up and may meet Lucy there.
    const fp = await api.ov.freePass(comp, { entry_id: eddie.entry_id, from_round: eddie.position.round });
    expect(fp.status).toBe(200);
    const granted = find.round(fp.body.bracket, eddie.position.round).free_passes.find((x) => x.entry.entry_id === eddie.entry_id)!;
    expect(granted).toBeDefined();
    const eddieAfter = fp.body.bracket.entries.find((e) => e.entry_id === eddie.entry_id)!;
    const revoke = await api.ov.revokeFreePass(comp, granted.id);
    if (eddieAfter.position.status === "in_match") {
      // Already paired through the pass: the revoke is refused, naming the match.
      expect(revoke.status).toBe(409);
      expect(revoke.body.error).toMatch(/already in (R\d+M\d+|Final)/);
    } else {
      expect(revoke.status).toBe(200);
      expect(find.round(revoke.body.bracket, eddie.position.round).free_passes.some((x) => x.entry.entry_id === eddie.entry_id)).toBe(false);
    }
    // Remove Eddie from the night: a dry run first, then for real.
    const rm = await api.ov.removeEntry(comp, eddie.entry_id, { dry_run: true });
    expect(rm.body.dry_run).toBe(true);
    expect(rm.body.changes.join("\n")).toMatch(/Extra Eddie.*removed from the night/);
    const rm2 = await api.ov.removeEntry(comp, eddie.entry_id);
    expect(rm2.status).toBe(200);
    b = rm2.body.bracket;
    expect(b.players.some((p) => p.name === "Extra Eddie")).toBe(false);
    // Finish the night: M17's winner meets Larry somewhere up the tree, then the title.
    let guard = 0;
    while (b.competition?.status === "in_progress" && guard++ < 10) b = await playCurrentRound(comp);
    expect(b.competition?.status).toBe("complete");
  });

  it("End night here closes an unfinished night as complete with no winner (spec 5.11)", async () => {
    const players = await club(8, "Early");
    const { id } = await night(players);
    let b = await playCurrentRound(id);
    expect(b.competition?.status).toBe("in_progress");
    // Round two is under way, one match on the clock, when the club runs out of time.
    const m9 = find.match(b, 9);
    expect((await api.startMatch(m9.id, { table: freeTable(b) })).status).toBe(200);
    const dry = await api.endNight(id, { dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.clocks_cancelled).toBe(1);
    expect(dry.body.still_in).toHaveLength(4);
    expect(dry.body.bracket).toBeUndefined();
    // The dry run wrote nothing: the night is still running with its clock.
    expect((await api.bracket(id)).body.competition?.status).toBe("in_progress");
    const r = await api.endNight(id);
    expect(r.status).toBe(200);
    expect(r.body.unplayed).toBe(2);
    b = r.body.bracket!;
    expect(b.competition?.status).toBe("complete");
    expect(b.competition?.winner).toBeNull();
    expect(b.competition?.ended_early).toBe(true);
    // Every result is kept, and the clock that was running is thrown away (O-5).
    expect(find.matchesInRound(b, 1).every((m) => m.state === "finished")).toBe(true);
    expect(find.match(b, 9).state).toBe("not_started");
    // It counts: it reaches the rating review, which ranks on the round each player reached.
    const review = await api.ratingReview(id);
    expect(review.status).toBe(200);
    expect(review.body.rows).toHaveLength(8);
    expect(review.body.rows[0].finish).toBe("R2");
    expect(review.body.rows.some((x) => x.finish === "won")).toBe(false);
    expect((await api.adminActions(id)).body.actions.map((a) => a.action)).toContain("end_early");
    // Over is over: a second tap is refused, and the live slot is free for a new night.
    expect((await api.endNight(id)).status).toBe(409);
    const next = await api.createCompetition();
    expect(next.status).toBe(201);
    expect((await api.abandon(next.body.competition.id)).status).toBe(200);
  });

  it("abandon frees the live slot; the public page hides the abandoned night", async () => {
    // Abandon a fresh setup so the completed nights stay on the public page.
    const c0 = await api.createCompetition();
    expect(c0.status).toBe(201);
    const fresh = c0.body.competition.id;
    expect((await api.abandon(fresh)).status).toBe(200);
    expect((await api.abandon(fresh)).status).toBe(409);
    const pub = await api.publicBracket();
    expect(pub.body.competition?.id).not.toBe(fresh);
    expect(pub.body.competition?.status).toBe("complete");
    const c = await api.createCompetition();
    expect(c.status).toBe(201);
    const log = (await api.adminActions(fresh)).body.actions;
    expect(log.map((a) => a.action)).toContain("abandon");
  });
});
