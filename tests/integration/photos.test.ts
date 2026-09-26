import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import { api, loginAs, setCookie } from "./api";

beforeAll(async () => {
  await resetDbForTests();
  await loginAs("testcode12345");
});
afterAll(() => resetDbForTests());

// The smallest thing each route will take as a JPEG: the signature, then anything.
const jpeg = (n = 64) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < n; i++) b[i] = i % 251;
  return b;
};
const decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)) as { error?: string; player?: { photo: string | null } };

describe("player photos (spec 6.6, 7.3, O-18)", () => {
  let id = "";

  it("upload, then the public route serves the same bytes with a year-long cache", async () => {
    id = (await api.createPlayer("Photo Player", 20)).body.player.id;
    expect((await api.publicPlayers()).body.players.find((p) => p.id === id)?.photo).toBeNull();
    const bytes = jpeg();
    const put = await api.putPhoto(id, bytes, "image/jpeg");
    expect(put.status).toBe(200);
    const url = decode(put.bytes).player?.photo;
    expect(url?.startsWith(`/api/public/players/${id}/photo?v=`)).toBe(true);
    expect((await api.publicPlayers()).body.players.find((p) => p.id === id)?.photo).toBe(url);
    const got = await api.publicPhoto(id);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(got.headers.get("cache-control")).toMatch(/immutable/);
    expect([...got.bytes]).toEqual([...bytes]);
    // A new photo is a new URL, so no cache can keep showing the old one.
    const again = await api.putPhoto(id, jpeg(80), "image/jpeg");
    expect(decode(again.bytes).player?.photo).not.toBe(url);
    expect((await api.publicPhoto(id)).bytes.length).toBe(80);
  });

  it("refuses a wrong type, bytes that are not that type, a photo too big, and no session", async () => {
    expect((await api.putPhoto(id, jpeg(), "image/gif")).status).toBe(400);
    const png = await api.putPhoto(id, jpeg(), "image/png");
    expect(png.status).toBe(400);
    expect(decode(png.bytes).error).toMatch(/not the image it says/);
    const big = await api.putPhoto(id, jpeg(300_001), "image/jpeg");
    expect(big.status).toBe(400);
    expect(decode(big.bytes).error).toMatch(/too big/);
    expect((await api.putPhoto(id, jpeg(), "image/jpeg", false)).status).toBe(401);
  });

  it("delete clears it: initials again, and the public route answers 404", async () => {
    const del = await api.deletePhoto(id);
    expect(del.status).toBe(200);
    expect(del.body.player.photo).toBeNull();
    expect((await api.publicPlayers()).body.players.find((p) => p.id === id)?.photo).toBeNull();
    expect((await api.publicPhoto(id)).status).toBe(404);
    setCookie("");
    expect((await api.deletePhoto(id)).status).toBe(401);
  });
});
