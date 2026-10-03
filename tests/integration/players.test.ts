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

describe("the public site shows short names and no photos (spec 3.8, 7.2, O-21)", () => {
  it("no full name or photo URL on any public route; the admin bracket keeps both", async () => {
    const names = ["Chris Hanandas", "Chris Hall", "Leonard Thomlinson (Lenny)", "Gareth Hampson"];
    const ids: string[] = [];
    for (const n of names) ids.push((await api.createPlayer(n, 10)).body.player.id);
    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect((await api.putPhoto(ids[0], jpeg, "image/jpeg")).status).toBe(200);
    const comp = (await api.createCompetition({ name: "Monday 5 Oct 2026", bracket_size: 16 })).body.competition.id;
    expect((await api.addEntries(comp, ids)).status).toBe(201);
    expect((await api.start(comp)).status).toBe(200);

    const pub = JSON.stringify((await api.publicBracket()).body) + JSON.stringify((await api.publicPlayers()).body);
    for (const surname of ["Hanandas", "Hall", "Thomlinson", "Hampson", "Leonard"]) expect(pub).not.toContain(surname);
    expect(pub).not.toContain("/photo");
    const shown = (await api.publicBracket()).body.entries.map((e) => e.name).sort();
    expect(shown).toEqual(["Chris Hal.", "Chris Han.", "Gareth H.", "Lenny T."]);

    const admin = (await api.bracket()).body;
    expect(admin.entries.map((e) => e.name)).toContain("Chris Hanandas");
    expect(admin.entries.find((e) => e.name === "Chris Hanandas")?.photo).toMatch(/^\/api\/admin\/players\/.+\/photo\?v=/);
    expect((await api.abandon(comp)).status).toBe(200);
  });
});

describe("setup defaults (spec 3.3, 7.4)", () => {
  it("a new night is a 32 bracket unless told otherwise", async () => {
    const c = await api.createCompetition({ name: "Default size" });
    expect(c.status).toBe(201);
    expect(c.body.competition.bracket_size).toBe(32);
    expect((await api.abandon(c.body.competition.id)).status).toBe(200);
  });
});

describe("contact details (spec 3.2, 7.3, O-23)", () => {
  it("are optional, tidied, editable and clearable", async () => {
    const r = await api.createPlayer("Neil Robertson", 5, { phone: "+61 412-345-678", email: " Neil@Example.com " });
    expect(r.status).toBe(201);
    const p = r.body.player;
    expect([p.phone, p.email]).toEqual(["0412 345 678", "neil@example.com"]);

    const landline = (await api.patchPlayer(p.id, { phone: "(02) 9123 4567" })).body.player as { phone?: string; email?: string };
    expect([landline.phone, landline.email]).toEqual(["02 9123 4567", "neil@example.com"]);
    const cleared = (await api.patchPlayer(p.id, { phone: "", email: "" })).body.player as { phone?: string | null; email?: string | null };
    expect([cleared.phone, cleared.email]).toEqual([null, null]);

    const none = (await api.createPlayer("Mark Selby", 5)).body.player as { phone?: string | null; email?: string | null };
    expect([none.phone, none.email]).toEqual([null, null]);
  });

  it("refuses a number that isn't Australian, or a bad email", async () => {
    const id = (await api.createPlayer("Judd Trump", 5)).body.player.id;
    expect((await api.patchPlayer(id, { phone: "9123 4567" })).status).toBe(400);
    expect((await api.patchPlayer(id, { phone: "+64 21 123 4567" })).status).toBe(400);
    expect((await api.patchPlayer(id, { email: "judd@" })).status).toBe(400);
    expect((await api.createPlayer("Ali Carter", 5, { email: "nope" })).status).toBe(400);
  });

  it("never leave the server on a public route", async () => {
    const id = (await api.createPlayer("Kyren Wilson", 5)).body.player.id;
    expect((await api.patchPlayer(id, { phone: "0499 888 777", email: "kyren@example.com" })).status).toBe(200);
    const pub = JSON.stringify((await api.publicBracket()).body) + JSON.stringify((await api.publicPlayers()).body);
    expect(pub).not.toContain("0499");
    expect(pub).not.toContain("kyren@");
  });
});
