import { describe, expect, it } from "vitest";
import { formatRemaining, matchClock, serverOffsetMs } from "@/lib/timer";

describe("timer (rules 12, spec 5.12)", () => {
  const started = "2026-09-11T09:00:00.000Z";
  const t = (s: string) => Date.parse(s);

  it("derives the remaining time from started_at and the limit", () => {
    expect(matchClock(started, 25, t("2026-09-11T09:06:18.000Z"))?.remaining_ms).toBe((18 * 60 + 42) * 1000);
    expect(matchClock(started, 25, t("2026-09-11T09:06:18.000Z"))?.timed_out).toBe(false);
  });

  it("times out at zero and never goes negative", () => {
    const c = matchClock(started, 25, t("2026-09-11T09:30:00.000Z"))!;
    expect(c.remaining_ms).toBe(0);
    expect(c.timed_out).toBe(true);
    expect(matchClock(started, 25, t("2026-09-11T09:24:59.999Z"))?.timed_out).toBe(false);
  });

  it("is null before start", () => {
    expect(matchClock(null, 25, 0)).toBeNull();
  });

  it("formats mm:ss rounding up so 00:00 means over", () => {
    expect(formatRemaining((18 * 60 + 42) * 1000)).toBe("18:42");
    expect(formatRemaining(999)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5)).toBe("00:00");
  });

  it("offsets a wrong phone clock by the server time", () => {
    expect(serverOffsetMs("2026-09-11T09:00:10.000Z", t("2026-09-11T09:00:00.000Z"))).toBe(10_000);
  });
});
