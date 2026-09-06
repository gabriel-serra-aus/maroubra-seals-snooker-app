import { describe, expect, it } from "vitest";
import { handicapStart } from "@/lib/logic/handicap";

describe("handicap start (rules 6, spec 5.6)", () => {
  it.each([
    [45, 20, 17, "a"],
    [33, 30, 2, "a"],
    [41, 28, 9, "a"],
    [36, 36, 0, null],
    [50, 49, 1, "a"],
    [40, 38, 1, "a"],
    [20, -5, 17, "a"],
    [-2, -8, 4, "a"],
    [0, 12, 8, "b"],
  ])("%d v %d → %d to %s", (a, b, points, to) => {
    expect(handicapStart(a, b)).toEqual({ points, to });
    // Symmetric: swapping sides swaps the receiver.
    expect(handicapStart(b, a)).toEqual({ points, to: to === "a" ? "b" : to === "b" ? "a" : null });
  });

  it("gives the start to the HIGHER number — the weaker player", () => {
    expect(handicapStart(20, 45).to).toBe("b");
    expect(handicapStart(-5, 20).to).toBe("b");
    expect(handicapStart(-8, -2).to).toBe("b");
  });

  it("is two thirds rounded to nearest, never a .5 tie", () => {
    for (let d = 0; d < 300; d++) {
      expect(Math.abs((2 * d) / 3 - Math.round((2 * d) / 3))).not.toBeCloseTo(0.5);
      expect(handicapStart(d, 0).points).toBe(Math.round((2 * d) / 3));
    }
  });
});
