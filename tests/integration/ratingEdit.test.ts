import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { api, find, freeTable, loginAs, playCurrentRound, playMatch } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

/** Editing a player during the night (O-26): the club list locks the rating, the bracket changes it. */
describe("a rating changed during the night (O-26, spec 3.2, 5.6, 7.3)", () => {
  const ids: Record<string, string> = {};
  let comp = "";

  it("sets up four players in a 16 bracket", async () => {
    for (const [name, rating] of [["Ann", 10], ["Ben", 30], ["Cal", 20], ["Dot", 40], ["Eli", 5]] as const) {
      ids[name] = (await api.createPlayer(name, rating)).body.player.id;
    }
    comp = (await api.createCompetition({ bracket_size: 16 })).body.competition.id;
    await api.addEntries(comp, [ids.Ann, ids.Ben, ids.Cal, ids.Dot]);
    // Before Start the club list may still change a rating: nothing is drawn yet.
    expect((await api.patchPlayer(ids.Ann, { rating: 11 })).status).toBe(200);
    expect((await api.start(comp)).status).toBe(200);
  });

  it("the club list refuses a rating change for a player in the night, but allows the rest", async () => {
    const r = await api.patchPlayer(ids.Ann, { rating: 9 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "playing_tonight", error: "Ann is playing tonight — change the handicap from the competition tree." });
    expect((await api.patchPlayer(ids.Ann, { name: "Ann Lee" })).status).toBe(200);
    // Sending the same rating is not a change.
    expect((await api.patchPlayer(ids.Ann, { rating: 11, phone: "0412345678" })).status).toBe(200);
    // A player not in tonight's night is edited as usual.
    expect((await api.patchPlayer(ids.Eli, { rating: 6 })).status).toBe(200);
    expect((await api.getPlayer(ids.Ann)).body.player).toMatchObject({ name: "Ann Lee", rating: 11 });
  });

  it("from the bracket: recalculates the unfinished match, leaves the finished one, and records it against the night", async () => {
    let b = (await api.bracket(comp)).body;
    const [m1, m2] = find.matchesInRound(b, 1);
    await playMatch(m1, "a", "declined");
    b = (await api.bracket(comp)).body;
    expect((await api.startMatch(m2.id, { table: freeTable(b) })).status).toBe(200);
    const done = find.matchesInRound((await api.bracket(comp)).body, 1)[0];

    // A player of the finished match: their result stays as played.
    const finishedPlayer = done.a.player_id;
    const r1 = await api.patchNightPlayer(comp, finishedPlayer, { rating: -20 });
    expect(r1.status).toBe(200);
    expect(r1.body.notes).toEqual([]);
    expect(find.matchesInRound(r1.body.bracket, 1)[0]).toMatchObject({ rating_a: done.rating_a, rating_b: done.rating_b, start_points: done.start_points });

    // A player of the match in play: its start follows the new rating, the clock is untouched.
    const live = find.matchesInRound(r1.body.bracket, 1)[1];
    const r2 = await api.patchNightPlayer(comp, live.a.player_id, { rating: live.rating_a + 30 });
    expect(r2.status).toBe(200);
    const after = find.matchesInRound(r2.body.bracket, 1)[1];
    expect(after).toMatchObject({ state: "in_play", started_at: live.started_at, rating_a: live.rating_a + 30 });
    expect(after.start_points).toBe(Math.round((2 * Math.abs(after.rating_a - after.rating_b)) / 3));
    expect(r2.body.notes).toHaveLength(1);
    expect(r2.body.notes[0]).toMatch(/^R1M2: .+ now starts on \d+ \(was /);

    const db = await getDb();
    const rows = await db.query<{ competition_id: string | null; changed_by: string }>(
      "select competition_id, changed_by from rating_changes where player_id = $1 order by changed_at desc limit 1",
      [live.a.player_id],
    );
    expect(rows[0]).toEqual({ competition_id: comp, changed_by: "Gabriel" });
  });

  it("refuses a player not in the night, and an edit made from an out-of-date card", async () => {
    expect((await api.patchNightPlayer(comp, ids.Eli, { rating: 1 })).status).toBe(400);
    expect((await api.getPlayer(ids.Eli)).body.player.rating).toBe(6); // rolled back with the refusal
    const stale = await api.patchNightPlayer(comp, ids.Ben, { rating: 1, expected_updated_at: "2020-01-01T00:00:00.000Z" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("stale");
  });

  it("the review starts from the edited rating and shows the change made during the night", async () => {
    const before = (await api.bracket(comp)).body;
    const edited = before.players.find((p) => p.rating === -20)!;
    let b = before;
    for (let guard = 0; b.competition!.status === "in_progress" && guard < 10; guard++) b = await playCurrentRound(comp);
    expect(b.competition!.status).toBe("complete");
    const rv = await api.ratingReview(comp);
    const row = rv.body.rows.find((r) => r.player_id === edited.id)!;
    expect(row.current_rating).toBe(-20);
    expect(row.proposed_rating).toBe(-20 + row.delta);
    expect(row.tonight_change).toEqual({ from: expect.any(Number), to: -20 });
    // Only the two players edited from the bracket; the club-list edit before Start is not "during the night".
    expect(rv.body.rows.filter((r) => r.tonight_change !== null)).toHaveLength(2);
  });

  it("once the night is complete the lock lifts and the bracket route refuses", async () => {
    expect((await api.patchPlayer(ids.Dot, { rating: 41 })).status).toBe(200);
    expect((await api.patchNightPlayer(comp, ids.Dot, { rating: 42 })).status).toBe(409);
  });
});
