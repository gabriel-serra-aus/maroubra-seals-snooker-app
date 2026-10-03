import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import { api, find, freeTable, loginAs } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

describe("buy-back rematch question over the route (spec 7.5, O-20)", () => {
  it("asks with code rematch and changes nothing; allow_rematch places the buy-back", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 14; i++) ids.push((await api.createPlayer(`Player ${i} Rematch`, 10 + i)).body.player.id);
    const comp = (await api.createCompetition({ name: "Rematch night", bracket_size: 16 })).body.competition.id;
    await api.addEntries(comp, ids);
    const b = (await api.start(comp)).body.bracket;
    const m7 = find.match(b, 7);
    expect((await api.startMatch(m7.id, { table: freeTable(b) })).status).toBe(200);

    const asked = await api.completeWith(m7.id, { winner_entry_id: m7.a.entry_id, loser_decision: "bought_back" });
    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({ code: "rematch", player: m7.b.name, opponent: m7.a.name });
    expect(find.match((await api.bracket()).body, 7).state).toBe("in_play"); // rolled back

    const yes = await api.completeWith(m7.id, { winner_entry_id: m7.a.entry_id, loser_decision: "bought_back", allow_rematch: true });
    expect(yes.status).toBe(200);
    expect(yes.body.loser_decision).toBe("bought_back");
    expect(yes.body.bracket.entries.find((e) => e.source === "buyback")?.slot).toBe(15);
    expect((await api.abandon(comp)).status).toBe(200);
  });
});
