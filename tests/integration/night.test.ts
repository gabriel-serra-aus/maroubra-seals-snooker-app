import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { competitionHistory } from "@/lib/db/history";
import { api, find, loginAs, playCurrentRound, playMatch, setCookie } from "./api";

const NAMES = ["Alice Chen", "Bob Smith", "Carl Diaz", "Dee Park", "Eve Long", "Fay Ng", "Gus Ray", "Hal Ito", "Ida Roy", "Ivan Poe", "Jo Kerr", "Kim Lau", "Lee Moss", "Max Bell", "Nia Ford", "Oli Hart", "Pat Quin"];
const RATINGS = [45, 20, 33, 30, 28, 41, 25, 36, 36, 28, 38, 22, 50, -3, 15, 44, 31];

beforeAll(async () => {
  await resetDbForTests();
  process.env.CRON_SECRET = "cron-secret-test";
});
afterAll(() => resetDbForTests());

describe("session (spec 7.1)", () => {
  it("rejects admin routes without a cookie, accepts a code, identifies the organiser", async () => {
    setCookie("");
    expect((await api.players()).status).toBe(401);
    expect((await api.bracket()).status).toBe(401);
    expect((await loginAs("wrong-code")).status).toBe(401);
    const r = await loginAs("othercode6789");
    expect(r.status).toBe(200);
    expect(r.body.name).toBe("Steve");
    expect(r.headers.get("set-cookie")).toMatch(/seal_admin=Steve\.[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    expect((await api.players()).status).toBe(200);
    const out = await api.logout();
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    await loginAs("testcode12345");
  });

  it("cron ping needs the bearer secret", async () => {
    expect((await api.ping("nope")).status).toBe(401);
    expect((await api.ping("cron-secret-test")).status).toBe(200);
  });
});

describe("a 13-of-16 night, end to end", () => {
  const ids: Record<string, string> = {};
  let comp = "";

  it("builds the club list; the first rating is in the history with the organiser's name", async () => {
    for (let i = 0; i < NAMES.length; i++) {
      const r = await api.createPlayer(NAMES[i], RATINGS[i]);
      expect(r.status).toBe(201);
      ids[NAMES[i]] = r.body.player.id;
    }
    expect((await api.createPlayer("alice chen", 10)).status).toBe(409);
    expect((await api.createPlayer("Zed", -101)).status).toBe(400);
    const h = await api.ratingHistory(ids["Max Bell"]);
    expect(h.body.history).toEqual([expect.objectContaining({ old_rating: null, new_rating: -3, changed_by: "Gabriel" })]);
    expect((await api.publicPlayers()).body.players).toHaveLength(17);
  });

  it("sets up the competition with the O-1 defaults and ticks 13 players", async () => {
    const c = await api.createCompetition({ name: "Friday 11 Sep 2026", bracket_size: 16 });
    expect(c.status).toBe(201);
    expect(c.body.competition).toMatchObject({ bracket_size: 16, rating_top_count: 3, rating_bottom_delta: 2 });
    comp = c.body.competition.id;
    expect(c.body.bracket.competition?.id).toBe(comp); // the setup screen shows the reply, no second request
    expect((await api.createCompetition()).status).toBe(409); // one live competition at a time
    // Several players in one request (spec 3.3), then two removed at once, then the rest one by one.
    const batch = await api.addEntries(comp, NAMES.slice(0, 10).map((n) => ids[n]));
    expect(batch.status).toBe(201);
    expect(batch.body.entry_ids).toHaveLength(10);
    expect(batch.body.bracket.entries).toHaveLength(10);
    const drop = batch.body.bracket.entries.filter((e) => e.name === "Ida Roy" || e.name === "Ivan Poe").map((e) => e.entry_id);
    const removed = await api.removeEntries(comp, drop);
    expect(removed.status).toBe(200);
    expect(removed.body.bracket.entries).toHaveLength(8);
    expect((await api.addEntries(comp, ["not-an-id"])).status).toBe(400);
    for (const n of NAMES.slice(8, 13)) expect((await api.addEntry(comp, { player_id: ids[n] })).status).toBe(201);
    expect((await api.addEntry(comp, { player_id: ids["Alice Chen"] })).status).toBe(409);
    expect((await api.addEntries(comp, [ids["Alice Chen"]])).status).toBe(409);
    const b = (await api.getCompetition(comp)).body;
    expect(b.competition?.status).toBe("setup");
    expect(b.competition?.open_slots).toBe(3);
    expect(b.competition?.rounds_total).toBe(4);
    // The settings page edits the same row (spec 3.10).
    const s = await api.patchCompetition(comp, { bracket_size: 32, default_time_limit_minutes: 30 });
    expect(s.status).toBe(200);
    expect(s.body.bracket.competition?.default_time_limit_minutes).toBe(30);
    expect((await api.patchCompetition(comp, { bracket_size: 16, default_time_limit_minutes: 25 })).status).toBe(200);
    // Deactivating an entered player is refused (O-9).
    expect((await api.patchPlayer(ids["Alice Chen"], { active: false })).status).toBe(409);
    expect((await api.patchPlayer(ids["Pat Quin"], { active: false })).status).toBe(200);
    expect((await api.publicPlayers()).body.players).toHaveLength(16);
  });

  it("starts: 6 matches, one waiting player, 3 open slots, starts snapshotted (spec 5.1, 5.6)", async () => {
    const r = await api.start(comp);
    expect(r.status).toBe(200);
    const b = r.body.bracket;
    expect(b.competition).toMatchObject({ status: "in_progress", current_round: 1, buybacks_open: true, open_slots: 3 });
    const r1 = find.round(b, 1);
    expect(r1.matches).toHaveLength(6);
    expect(r1.awaiting).toHaveLength(1);
    expect(r1.awaiting[0]).toMatchObject({ number: 7, slot: 13 });
    expect(r1.waiting).toHaveLength(1);
    expect(r1.boxes).toHaveLength(8);
    expect(r1.boxes[6]).toMatchObject({ k: 7, number: 7, match: null, free_pass: false });
    expect(r1.boxes[6].entry?.slot).toBe(13);
    expect(r1.boxes[7]).toMatchObject({ k: 8, number: 8, match: null, entry: null });
    for (const m of r1.matches) {
      const diff = Math.abs(m.rating_a - m.rating_b);
      expect(m.start_points).toBe(Math.round((2 * diff) / 3));
      if (m.start_points > 0) expect(m.start_entry_id).toBe(m.rating_a > m.rating_b ? m.a.entry_id : m.b.entry_id);
      expect(m.time_limit_minutes).toBe(25);
    }
    expect((await api.start(comp)).status).toBe(409);
    expect((await api.patchCompetition(comp, { bracket_size: 32 })).status).toBe(409);
    // The public page sees the same thing.
    const pub = await api.publicBracket();
    expect(pub.headers.get("cache-control")).toContain("s-maxage=5");
    expect(pub.body.competition?.name).toBe("Friday 11 Sep 2026");
  });

  it("start, time limit, cancel start, complete with buy-backs placed at once (rules 12, O-3, O-5, O-13)", async () => {
    let b = (await api.bracket(comp)).body;
    const m1 = find.match(b, 1);
    expect((await api.complete(m1.id, m1.a.entry_id, "declined")).status).toBe(409); // not started
    expect((await api.patchMatch(m1.id, { time_limit_minutes: 30 })).status).toBe(200);
    const st = await api.startMatch(m1.id);
    expect(st.status).toBe(200);
    expect(st.body.time_limit_minutes).toBe(30);
    expect((await api.startMatch(m1.id)).status).toBe(409); // double tap
    expect((await api.patchMatch(m1.id, { time_limit_minutes: 20 })).status).toBe(409);
    const cancel = await api.cancelStart(m1.id);
    expect(cancel.status).toBe(200);
    expect(find.match(cancel.body.bracket, 1)).toMatchObject({ state: "not_started", started_at: null, time_limit_minutes: 25 });
    const actions = (await api.adminActions(comp)).body.actions;
    expect(actions[0]).toMatchObject({ actor: "Gabriel", action: "cancel_start", details: { match: "R1M1" } });

    // Three buy-backs: the first takes the empty M8, the next two the seats beside the lone players.
    const r1 = await playMatch(find.match(b, 1), "a", "bought_back");
    expect(r1.loser_decision).toBe("bought_back");
    expect(r1.buyback_match_number).toBeNull();
    expect(r1.winner_to).toEqual({ kind: "awaiting", round: 2, match_number: null });
    b = (await api.bracket(comp)).body;
    expect(find.round(b, 1).awaiting.map((a) => a.number)).toEqual([7, 8]);
    const r2 = await playMatch(find.match(b, 2), "a", "bought_back");
    expect([7, 8]).toContain(r2.buyback_match_number);
    expect(r2.winner_to).toEqual({ kind: "match", round: 2, match_number: 9 });
    b = (await api.bracket(comp)).body;
    expect(find.match(b, 9).round).toBe(2);
    const r3 = await playMatch(find.match(b, 3), "a", "bought_back");
    expect(r3.buyback_match_number).toBe(r2.buyback_match_number === 7 ? 8 : 7);
    b = (await api.bracket(comp)).body;
    expect(b.competition?.open_slots).toBe(0);
    expect(find.round(b, 1).matches).toHaveLength(8);
    expect(find.round(b, 1).waiting).toHaveLength(0);
    const r4 = await playMatch(find.match(b, 4), "a", "bought_back");
    expect(r4.loser_decision).toBe("no_slots");
    expect(r4.no_slots).toBe(true);
    expect(r4.winner_to.match_number).toBe(10);
    // Missing decision → 400 and nothing changes.
    b = (await api.bracket(comp)).body;
    const m5 = find.match(b, 5);
    await api.startMatch(m5.id);
    expect((await api.complete(m5.id, m5.a.entry_id)).status).toBe(400);
    expect(find.match((await api.bracket(comp)).body, 5).state).toBe("in_play");
    expect((await api.complete(m5.id, m5.a.entry_id, "declined")).status).toBe(200);
  });

  it("Force Pair has nobody to pair; the window outlives the last first-draw result until the organiser's tap (spec 5.3, 5.5, O-15)", async () => {
    let b = (await api.bracket(comp)).body;
    expect((await api.forcePair(comp)).status).toBe(409);
    await playMatch(find.match(b, 6), "a", "declined");
    b = (await api.bracket(comp)).body;
    expect(find.match(b, 11).round).toBe(2); // M5, M6 winners
    const m7 = find.match(b, 7);
    await playMatch(m7, m7.a.source === "draw" ? "a" : "b");
    b = (await api.bracket(comp)).body;
    expect(b.competition?.buybacks_open).toBe(true); // nothing closes the window but the organiser
    const close = await api.closeBuybacks(comp);
    expect(close.status).toBe(200);
    expect(close.body.free_passes).toBe(0); // everyone in round one has an opponent
    b = close.body.bracket;
    expect(b.competition?.buybacks_open).toBe(false);
    expect((await api.forcePair(comp)).status).toBe(409);
    expect((await api.closeBuybacks(comp)).status).toBe(409);
    await playMatch(find.match(b, 8), "a");
    b = (await api.bracket(comp)).body;
    expect(find.matchesInRound(b, 2).map((m) => m.number)).toEqual([9, 10, 11, 12]);
    expect(b.competition?.current_round).toBe(2);
  });

  it("correction pulls a winner back; then the night plays up the tree to M15 with no free pass", async () => {
    let b = (await api.bracket(comp)).body;
    // M5's loser declined and M11 has not started, so the correction is allowed.
    const m5 = find.match(b, 5);
    expect(m5.correction_blocked).toBeNull();
    const newWinner = m5.winner_id === m5.a.entry_id ? m5.b.entry_id : m5.a.entry_id;
    // Buy-backs are closed, so the new loser is simply out and no decision is taken (O-12).
    expect((await api.correct(m5.id, newWinner, "declined")).status).toBe(400);
    const c = await api.correct(m5.id, newWinner);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    b = c.body.bracket;
    expect(find.match(b, 5).winner_id).toBe(newWinner);
    expect(find.match(b, 5).corrected_at).not.toBeNull();
    expect([find.match(b, 11).a.entry_id, find.match(b, 11).b.entry_id]).toContain(newWinner);
    expect(b.competition?.open_slots).toBe(0);

    b = await playCurrentRound(comp);
    expect(find.matchesInRound(b, 3).map((m) => m.number)).toEqual([13, 14]);
    b = await playCurrentRound(comp);
    expect(find.matchesInRound(b, 4).map((m) => m.number)).toEqual([15]);
    b = await playCurrentRound(comp);
    expect(b.competition?.status).toBe("complete");
    expect(b.competition?.winner).not.toBeNull();
    expect(b.rounds.flatMap((r) => r.free_passes)).toHaveLength(0);
    // The tree view has every box filled.
    expect(b.rounds.map((r) => r.boxes.length)).toEqual([8, 4, 2, 1]);
    expect(b.rounds.every((r) => r.boxes.every((x) => x.match !== null))).toBe(true);
    // Every round-two result is locked now: the winners' next matches have been played.
    const r2 = find.matchesInRound(b, 2)[0];
    expect(r2.correction_blocked).toMatch(/Result locked/);
    expect((await api.correct(r2.id, r2.a.entry_id)).status).toBe(409);
  });

  it("rating review proposes the O-1 scale, saves once, and is idempotent (spec 5.9)", async () => {
    const rv = await api.ratingReview(comp);
    expect(rv.status).toBe(200);
    const rows = rv.body.rows;
    expect(rows[0].finish).toBe("won");
    expect(rows.filter((r) => r.group === "top").map((r) => r.delta)).toEqual([-1, -1, -1]);
    expect(rows.filter((r) => r.group === "bottom").map((r) => r.delta)).toEqual([2, 2, 2]);
    const winner = rows[0];
    const save = await api.saveRatingReview(comp, rows.map((r) => ({ player_id: r.player_id, new_rating: r.proposed_rating })));
    expect(save.body.written).toBe(6);
    const again = await api.ratingReview(comp);
    const w2 = again.body.rows.find((r) => r.player_id === winner.player_id)!;
    expect(w2.current_rating).toBe(winner.proposed_rating);
    // Saving the same numbers again writes nothing.
    const save2 = await api.saveRatingReview(comp, again.body.rows.map((r) => ({ player_id: r.player_id, new_rating: r.current_rating })));
    expect(save2.body.written).toBe(0);
    const h = await api.ratingHistory(winner.player_id);
    expect(h.body.history[0]).toMatchObject({ old_rating: winner.current_rating, new_rating: winner.proposed_rating, changed_by: "Gabriel" });
    // A completed night carries its settings into the next one.
    const next = await api.createCompetition({ rating_top_count: 4 });
    expect(next.body.competition.rating_top_count).toBe(4);
    await api.abandon(next.body.competition.id);
    const after = await api.createCompetition();
    expect(after.body.competition.rating_top_count).toBe(4);
    await api.abandon(after.body.competition.id);
    // The public page still shows the completed night, not the abandoned ones.
    expect((await api.publicBracket()).body.competition?.id).toBe(comp);
  });

  it("history lists the night with its winner, who played, and the six rating changes (spec 3.11)", async () => {
    const h = await competitionHistory(await getDb());
    // Two abandoned nights sit above the completed one, newest first; the live night is not history.
    expect(h.nights.map((n) => n.status)).toEqual(["abandoned", "abandoned", "complete"]);
    const night = h.nights[2];
    expect(night.id).toBe(comp);
    expect(night.players).toBe(13);
    expect(night.bracket_size).toBe(16);
    const rv = await api.ratingReview(comp);
    expect(night.winner_name).toBe(rv.body.rows[0].name);
    expect(night.runner_up_name).toBe(rv.body.rows.find((r) => r.finish === "final")!.name);
    const mine = h.changes.filter((c) => c.competition_id === comp);
    expect(mine).toHaveLength(6);
    expect(mine.every((c) => c.changed_by === "Gabriel" && c.old_rating !== null && c.new_rating !== c.old_rating)).toBe(true);
    expect(mine.map((c) => c.new_rating - (c.old_rating ?? 0)).sort()).toEqual([-1, -1, -1, 2, 2, 2]);
    expect(h.played.filter((p) => p.competition_id === comp)).toHaveLength(13);
    expect(h.played.some((p) => p.competition_id !== comp)).toBe(false);
  });
});
