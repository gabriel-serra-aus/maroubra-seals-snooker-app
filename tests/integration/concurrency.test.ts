import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import type { BracketPayload } from "@/lib/bracket/payload";
import { api, find, loginAs } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

const as = (client: string, b: BracketPayload) => ({ "x-client-id": client, "x-bracket-version": `${b.competition!.id}@${b.version}` });

describe("two organisers at once (spec 7.8, O-22)", () => {
  let seen: BracketPayload;

  it("a write from a screen behind another device's change is refused with the fresh bracket and who made it", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) ids.push((await api.createPlayer(`Two Screens ${i}`, 10 + i)).body.player.id);
    const comp = (await api.createCompetition({ name: "Two screens", bracket_size: 16 })).body.competition.id;
    await api.addEntries(comp, ids);
    seen = (await api.start(comp)).body.bracket; // both phones show this
    const [m1, m2] = [find.match(seen, 1), find.match(seen, 2)];

    const phoneA = await api.startMatchAs(m1.id, { table: 1 }, as("phone-a", seen));
    expect(phoneA.status).toBe(200);

    const phoneB = await api.startMatchAs(m2.id, { table: 2 }, as("phone-b", seen));
    expect(phoneB.status).toBe(409);
    expect(phoneB.body.code).toBe("stale");
    expect(phoneB.body.by).toBe("Gabriel");
    expect(phoneB.body.error).toBe("Gabriel changed the bracket just now. Here is the latest — check it and tap again.");
    expect(find.match(phoneB.body.bracket, 1).state).toBe("in_play"); // the change B had not seen
    expect(find.match((await api.bracket()).body, 2).state).toBe("not_started"); // nothing written

    // With the fresh bracket on screen, the same tap goes through.
    const again = await api.startMatchAs(m2.id, { table: 2 }, as("phone-b", phoneB.body.bracket));
    expect(again.status).toBe(200);
    seen = again.body.bracket;
  });

  it("the same device's quick taps pass on the version it sent the first with", async () => {
    const before = seen;
    const m3 = find.match(before, 3);
    const m4 = find.match(before, 4);
    expect((await api.startMatchAs(m3.id, { table: 3 }, as("phone-b", before))).status).toBe(200);
    expect((await api.startMatchAs(m4.id, { table: 4 }, as("phone-b", before))).status).toBe(200);
  });

  it("no version, or another night's, is not checked", async () => {
    const b = (await api.bracket()).body;
    const m1 = find.match(b, 1);
    expect((await api.cancelStart(m1.id)).status).toBe(200);
    expect((await api.startMatchAs(m1.id, { table: 1 }, { "x-client-id": "script" })).status).toBe(200);
    expect((await api.cancelStart(m1.id)).status).toBe(200);
    const elsewhere = { "x-client-id": "phone-c", "x-bracket-version": `00000000-0000-0000-0000-000000000000@${seen.version}` };
    expect((await api.startMatchAs(m1.id, { table: 1 }, elsewhere)).status).toBe(200);
  });

  it("a player edit from a sheet opened before someone else's change is refused", async () => {
    const id = (await api.createPlayer("Edit Twice", 5)).body.player.id;
    const opened = (await api.patchPlayerAs(id, {})).body.player.updated_at;
    const first = await api.patchPlayerAs(id, { expected_updated_at: opened, rating: 6 });
    expect(first.status).toBe(200);
    const second = await api.patchPlayerAs(id, { expected_updated_at: opened, name: "Edit Thrice" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("stale");
    expect(second.body.error).toMatch(/changed on another screen/);
    expect((await api.patchPlayerAs(id, { expected_updated_at: first.body.player.updated_at, name: "Edit Thrice" })).status).toBe(200);
  });
});
