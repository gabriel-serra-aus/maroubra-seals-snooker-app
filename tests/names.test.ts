import { describe, expect, it } from "vitest";
import { publicNames, shortName } from "@/lib/names";

const list = (...names: string[]) => names.map((name, i) => ({ id: String(i), name }));
const shown = (...names: string[]) => [...publicNames(list(...names)).names.values()];

describe("public names (spec 3.8, O-21)", () => {
  it("first name and the surname's first letter", () => {
    expect(shortName("Gabriel Serra")).toBe("Gabriel S.");
    expect(shortName("  Patrick   Hanley ")).toBe("Patrick H.");
  });

  it("a bracketed nickname stands in for the first name", () => {
    expect(shortName("Leonard Thomlinson (Lenny)")).toBe("Lenny T.");
  });

  it("surnames of several words and apostrophes use their letters only", () => {
    expect(shortName("Ciaran O Brian")).toBe("Ciaran O.");
    expect(shortName("Kyle O' Sullivan")).toBe("Kyle O.");
    expect(shortName("Guest")).toBe("Guest");
  });

  it("no clash: everyone keeps one letter", () => {
    expect(shown("Chris Hanandas", "Chris Patsikonis", "Stuart Taylor", "Stuart Mcwhinnie")).toEqual(["Chris H.", "Chris P.", "Stuart T.", "Stuart M."]);
  });

  it("a clash grows only the clashing names, as far as needed", () => {
    expect(shown("Chris Hanandas", "Chris Hall", "Chris Patsikonis")).toEqual(["Chris Han.", "Chris Hal.", "Chris P."]);
    expect(shown("Sam Garlick", "Sam Gordon")).toEqual(["Sam Ga.", "Sam Go."]);
    // Case doesn't make two names different.
    expect(shown("Sam garlick", "Sam Gordon")).toEqual(["Sam ga.", "Sam Go."]);
  });

  it("a clash left after three letters is reported for the organiser to fix", () => {
    const r = publicNames(list("John Smith", "John Smithers", "Jane Doe"));
    expect([...r.names.values()]).toEqual(["John Smi.", "John Smi.", "Jane D."]);
    expect(r.clashes).toEqual([["John Smith", "John Smithers"]]);
  });

  it("a short surname stops growing; the other name grows past it", () => {
    expect(shown("Tom Li", "Tom Lim")).toEqual(["Tom Li.", "Tom Lim."]);
    expect(publicNames(list("Tom Li", "Tom Li")).clashes).toEqual([["Tom Li", "Tom Li"]]);
  });
});
