import { describe, expect, it } from "vitest";
import { parseAdminCodes } from "@/lib/auth/codes";
import {
  createSessionValue,
  findOrganiserByCode,
  sessionCookieFromHeader,
  verifySessionValue,
} from "@/lib/auth/session";

const organisers = parseAdminCodes({ ADMIN_CODES: "Gabriel:kf83hs2bxxxx,Steve:pw9dk21myyyy" });

describe("ADMIN_CODES parsing (O-8, spec 8.2)", () => {
  it("parses Name:code pairs", () => {
    expect(organisers).toEqual([
      { name: "Gabriel", code: "kf83hs2bxxxx" },
      { name: "Steve", code: "pw9dk21myyyy" },
    ]);
  });
  it("falls back to ADMIN_CODE as Organiser", () => {
    expect(parseAdminCodes({ ADMIN_CODE: "single-code" })).toEqual([{ name: "Organiser", code: "single-code" }]);
  });
  it("rejects malformed entries and duplicate names", () => {
    expect(() => parseAdminCodes({ ADMIN_CODES: "nocolon" })).toThrow();
    expect(() => parseAdminCodes({ ADMIN_CODES: "A:1,A:2" })).toThrow();
    expect(() => parseAdminCodes({ ADMIN_CODES: "A:" })).toThrow();
  });
  it("is empty when nothing is configured", () => {
    expect(parseAdminCodes({})).toEqual([]);
  });
});

describe("login by code", () => {
  it("identifies the organiser from the code alone", () => {
    expect(findOrganiserByCode("pw9dk21myyyy", organisers)?.name).toBe("Steve");
    expect(findOrganiserByCode("wrong", organisers)).toBeNull();
    expect(findOrganiserByCode("", organisers)).toBeNull();
  });
});

describe("session cookie (spec 7.1, 8.3)", () => {
  it("round-trips a signed session", () => {
    const value = createSessionValue(organisers[0]);
    expect(verifySessionValue(value, organisers)).toEqual({ name: "Gabriel" });
  });
  it("rejects a tampered signature or name", () => {
    const value = createSessionValue(organisers[0]);
    expect(verifySessionValue(value.slice(0, -1) + "0", organisers)).toBeNull();
    expect(verifySessionValue("Steve." + value.split(".")[1], organisers)).toBeNull();
    expect(verifySessionValue("garbage", organisers)).toBeNull();
    expect(verifySessionValue(undefined, organisers)).toBeNull();
  });
  it("changing one organiser's code logs out only that organiser", () => {
    const gabriel = createSessionValue(organisers[0]);
    const steve = createSessionValue(organisers[1]);
    const rotated = parseAdminCodes({ ADMIN_CODES: "Gabriel:newcode000000,Steve:pw9dk21myyyy" });
    expect(verifySessionValue(gabriel, rotated)).toBeNull();
    expect(verifySessionValue(steve, rotated)).toEqual({ name: "Steve" });
  });
  it("removing a name invalidates that session", () => {
    const steve = createSessionValue(organisers[1]);
    expect(verifySessionValue(steve, organisers.slice(0, 1))).toBeNull();
  });
  it("handles names with spaces and dots", () => {
    const [o] = parseAdminCodes({ ADMIN_CODES: "Mr. G Serra:code12345678" });
    const value = createSessionValue(o);
    expect(verifySessionValue(value, [o])).toEqual({ name: "Mr. G Serra" });
  });
  it("reads the cookie out of a Cookie header", () => {
    expect(sessionCookieFromHeader("a=1; seal_admin=Gabriel.abc; b=2")).toBe("Gabriel.abc");
    expect(sessionCookieFromHeader("a=1")).toBeUndefined();
    expect(sessionCookieFromHeader(null)).toBeUndefined();
  });
});
