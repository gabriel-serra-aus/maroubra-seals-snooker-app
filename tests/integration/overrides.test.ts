import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import { api, find, loginAs, playCurrentRound, playMatch } from "./api";

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

describe("32 bracket, Sequential Pairing, late arrival, mode switch", () => {
  let ids: string[] = [];
  let comp = "";

  it("21 players → 10 matches, M11 half-full, 11 open slots", async () => {
    ids = await club(24);
    const c = await api.createCompetition({ bracket_size: 32, buyback_mode: "sequential", default_time_limit_minutes: 20 });
    comp = c.body.competition.id;
    for (const p of ids.slice(0, 21)) await api.addEntry(comp, { player_id: p });
    const b = (await api.start(comp)).body.bracket;
    expect(find.round(b, 1).matches).toHaveLength(10);
    expect(find.round(b, 1).awaiting[0]).toMatchObject({ number: 11, slot: 21 });
    expect(b.competition?.open_slots).toBe(11);
    expect(find.match(b, 1).time_limit_minutes).toBe(20);
  });

  it("buy-backs are placed on entry and meet each other first; a late arrival joins the same way", async () => {
    let b = (await api.bracket(comp)).body;
    const r1 = await playMatch(find.match(b, 1), "b", "bought_back");
    expect(r1.buyback_match_number).toBeNull(); // slot 23, M12 half-full
    const r2 = await playMatch(find.match(b, 2), "b", "bought_back");
    expect(r2.buyback_match_number).toBe(12);
    const late = await api.addEntry(comp, { new_player: { name: "Late Larry", rating: 30 } });
    expect(late.status).toBe(201);
    expect(late.body.match_number).toBeNull(); // slot 25, M13 half-full
    b = late.body.bracket;
    expect(find.round(b, 1).awaiting.map((a) => a.number)).toEqual([11, 13]);
    // Switching to Random Draw leaves everything in place; the next buy-back stays unplaced.
    expect((await api.patchCompetition(comp, { buyback_mode: "random_draw" })).status).toBe(200);
    const r3 = await playMatch(find.match(b, 3), "b", "bought_back");
    expect(r3.buyback_match_number).toBeNull();
    b = (await api.bracket(comp)).body;
    expect(find.round(b, 1).waiting.filter((w) => w.slot === null)).toHaveLength(1);
    // Switching back places it: into M13 beside the late arrival (a buy-back), before M11 beside a first-draw player.
    const sw = await api.patchCompetition(comp, { buyback_mode: "sequential" });
    expect(sw.body.matches_created).toEqual([13]);
  });

  it("Close Buy-Backs by hand: the first-draw waiter gets a free pass; the response says so", async () => {
    const close = await api.closeBuybacks(comp);
    expect(close.status).toBe(200);
    expect(close.body.free_passes).toBe(1);
    expect(close.body.round_drawn).toBeNull(); // matches still to play
    const b = close.body.bracket;
    expect(find.round(b, 1).free_passes).toHaveLength(1);
    expect(find.round(b, 1).free_passes[0].entry.slot).toBe(21);
    // A late loser is out now (O-12).
    const r = await playMatch(find.match(b, 4), "a");
    expect(r.loser_decision).toBeNull();
    expect((await api.addEntry(comp, { player_id: ids[23] })).status).toBe(409);
  });

  it("the round draw waits for buy-back matches and then uses every free pass", async () => {
    let b = await playCurrentRound(comp);
    expect(b.competition?.current_round).toBe(2);
    // 12 round-one matches (10 draw + M12 + M13): pool = 12 winners + 1 free pass = 13 → 6 matches + 1 free pass
    expect(find.matchesInRound(b, 1)).toHaveLength(12);
    expect(find.matchesInRound(b, 2)).toHaveLength(6);
    expect(find.round(b, 2).free_passes).toHaveLength(1);
    expect(find.matchesInRound(b, 2)[0].number).toBe(17);
    while (b.competition?.status === "in_progress") b = await playCurrentRound(comp);
    expect(b.competition?.status).toBe("complete");
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
    await api.startMatch(m9.id);
    b = (await api.bracket(comp)).body;
    const m1 = find.match(b, 1);
    expect(m1.correction_blocked).toMatch(/M9 has started/);
    expect((await api.correct(m1.id, m1.a.entry_id)).status).toBe(409);
    const dry = await api.ov.reset(m1.id, { dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.dry_run).toBe(true);
    expect(dry.body.changes).toEqual(expect.arrayContaining([expect.stringMatching(/M9 .* removed/), "M1 reset to not started"]));
    expect(find.match((await api.bracket(comp)).body, 1).state).toBe("finished"); // nothing written
    const real = await api.ov.reset(m1.id);
    expect(real.status).toBe(200);
    b = real.body.bracket;
    expect(find.match(b, 1).state).toBe("not_started");
    expect(find.matchesInRound(b, 2)).toHaveLength(0);
    expect(find.round(b, 2).waiting).toHaveLength(1);
    const log = (await api.adminActions(comp)).body.actions;
    expect(log[0]).toMatchObject({ actor: "Gabriel", action: "reset_match", details: { match: "M1", from: "finished" } });
    // Replay M1: the winner is paired with the waiting round-two player.
    await playMatch(find.match(b, 1), "b");
    b = (await api.bracket(comp)).body;
    expect(find.matchesInRound(b, 2)).toHaveLength(1);
    expect(find.round(b, 2).waiting).toHaveLength(0);
  });

  it("delete, pair, replace, free pass, grow, reopen, add and remove", async () => {
    let b = (await api.bracket(comp)).body;
    const r2 = find.matchesInRound(b, 2)[0];
    const del = await api.ov.deleteMatch(r2.id);
    expect(del.status).toBe(200);
    expect(del.body.changes[0]).toMatch(/removed/);
    b = del.body.bracket;
    expect(find.round(b, 2).waiting).toHaveLength(2);
    expect(b.competition?.draw_blocked_by).toHaveLength(2);
    const [wa, wb] = find.round(b, 2).waiting;
    const pair = await api.ov.pair(comp, { entry_id_a: wa.entry_id, entry_id_b: wb.entry_id });
    expect(pair.status).toBe(200);
    b = pair.body.bracket;
    const final = find.matchesInRound(b, 2)[0];
    expect(final.origin).toBe("override");

    // Reopen buy-backs is refused in round two; grow the bracket works once.
    expect((await api.ov.reopen(comp)).status).toBe(409);
    expect((await api.ov.grow(comp)).status).toBe(200);
    expect((await api.ov.grow(comp)).status).toBe(409);

    // Add a player in round two; they wait there and block the draw until given a free pass.
    const add = await api.ov.addPlayer(comp, { new_player: { name: "Extra Eddie", rating: 33 } });
    expect(add.status).toBe(200);
    b = add.body.bracket;
    const eddie = find.round(b, 2).waiting[0];
    expect(eddie.name).toBe("Extra Eddie");
    // Replace player A of the final with Eddie; the old A goes back to waiting; start recalculated.
    const rep = await api.ov.replace(final.id, { slot: "a", entry_id: eddie.entry_id });
    expect(rep.status).toBe(200);
    b = rep.body.bracket;
    const final2 = find.matchesInRound(b, 2)[0];
    expect(final2.a.name).toBe("Extra Eddie");
    expect(final2.rating_a).toBe(33);
    expect(final2.start_points).toBe(Math.round((2 * Math.abs(33 - final2.rating_b)) / 3));
    const displaced = find.round(b, 2).waiting[0];
    expect(displaced.entry_id).toBe(final.a.entry_id);
    // Give the displaced player a free pass from round two, then finish the final → round three.
    const fp = await api.ov.freePass(comp, { entry_id: displaced.entry_id, from_round: 2 });
    expect(fp.status).toBe(200);
    b = fp.body.bracket;
    expect(find.round(b, 2).free_passes).toHaveLength(1);
    // Revoke and re-grant to exercise the delete route.
    const revoke = await api.ov.revokeFreePass(comp, find.round(b, 2).free_passes[0].id);
    expect(revoke.status).toBe(200);
    expect(find.round(revoke.body.bracket, 2).free_passes).toHaveLength(0);
    await api.ov.freePass(comp, { entry_id: displaced.entry_id, from_round: 2 });
    await playMatch(final2, "a");
    b = (await api.bracket(comp)).body;
    expect(b.competition?.current_round).toBe(3);
    expect(find.matchesInRound(b, 3)).toHaveLength(1);
    // Remove Eddie from the night: his round-3 match is deleted and his round-2 win voided.
    const rm = await api.ov.removeEntry(comp, eddie.entry_id, { dry_run: true });
    expect(rm.body.dry_run).toBe(true);
    expect(rm.body.changes.join("\n")).toMatch(/Extra Eddie.*removed from the night/);
    const rm2 = await api.ov.removeEntry(comp, eddie.entry_id);
    expect(rm2.status).toBe(200);
    b = rm2.body.bracket;
    expect(b.players.some((p) => p.name === "Extra Eddie")).toBe(false);
    expect(find.matchesInRound(b, 3)).toHaveLength(0);
  });

  it("abandon frees the live slot; the public page hides the abandoned night", async () => {
    expect((await api.abandon(comp)).status).toBe(200);
    expect((await api.abandon(comp)).status).toBe(409);
    // The public page falls back to the most recent night that was not abandoned: the completed 32 bracket.
    const pub = await api.publicBracket();
    expect(pub.body.competition?.id).not.toBe(comp);
    expect(pub.body.competition?.status).toBe("complete");
    const c = await api.createCompetition();
    expect(c.status).toBe(201);
    const log = (await api.adminActions(comp)).body.actions;
    expect(log.map((a) => a.action)).toContain("abandon");
  });
});
