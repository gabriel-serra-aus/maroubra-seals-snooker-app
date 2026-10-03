import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { api, loginAs } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

describe("renaming a player (spec 3.2, 7.3)", () => {
  it("renames, keeps the rating history, and logs who did it (O-8)", async () => {
    const id = (await api.createPlayer("John Higgins", 0)).body.player.id;
    const r = await api.patchPlayer(id, { name: "  John Hickey " });
    expect(r.status).toBe(200);
    expect((r.body.player as { name?: string }).name).toBe("John Hickey");
    expect((await api.ratingHistory(id)).body.history).toHaveLength(1);
    const db = await getDb();
    const log = await db.query<{ actor: string; details: { from: string; to: string } }>(
      "select actor, details from admin_actions where action = 'rename_player' and details->>'player_id' = $1",
      [id],
    );
    expect(log).toEqual([{ actor: "Gabriel", details: { player_id: id, from: "John Higgins", to: "John Hickey" } }]);
  });

  it("refuses a name another player has, ignoring case, and a blank name", async () => {
    const a = (await api.createPlayer("Zak Sadry", 1)).body.player.id;
    const b = (await api.createPlayer("Zac Sadry", 1)).body.player.id;
    const clash = await api.patchPlayer(b, { name: "zak sadry" });
    expect(clash.status).toBe(409);
    expect((clash.body as { error?: string }).error).toMatch(/already called/);
    expect((await api.patchPlayer(b, { name: "   " })).status).toBe(400);
    expect((await api.patchPlayer(b, { name: "x".repeat(61) })).status).toBe(400);
    // A change of case on the same player is a rename, not a clash.
    expect((await api.patchPlayer(a, { name: "ZAK SADRY" })).status).toBe(200);
  });
});
