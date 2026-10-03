import { describe, expect, it } from "vitest";
import { normaliseEmail, normalisePhone } from "@/lib/contact";

describe("phone numbers (spec 3.2, O-23)", () => {
  it("accepts Australian mobiles in any common spelling", () => {
    for (const s of ["0412345678", "0412 345 678", "0412-345-678", "+61 412 345 678", "+61412345678", "61412345678", "+61 (0)412 345 678"]) {
      expect(normalisePhone(s)).toBe("0412 345 678");
    }
  });

  it("accepts Australian landlines in every area code", () => {
    expect(normalisePhone("(02) 9123 4567")).toBe("02 9123 4567");
    expect(normalisePhone("03 9123 4567")).toBe("03 9123 4567");
    expect(normalisePhone("+61 7 3123 4567")).toBe("07 3123 4567");
    expect(normalisePhone("08.9123.4567")).toBe("08 9123 4567");
  });

  it("refuses anything else", () => {
    for (const s of ["", "9123 4567", "041234567", "04123456789", "05 1234 5678", "1300 123 456", "+64 21 123 4567", "0412 abc 678"]) {
      expect(normalisePhone(s)).toBeNull();
    }
  });
});

describe("email addresses (spec 3.2, O-23)", () => {
  it("trims and lower-cases a plausible address", () => {
    expect(normaliseEmail("  Gabriel.S@Example.COM ")).toBe("gabriel.s@example.com");
  });

  it("refuses anything that isn't one", () => {
    for (const s of ["", "gabriel", "gabriel@", "@example.com", "gabriel@example", "gab riel@example.com", `${"a".repeat(250)}@b.co`]) {
      expect(normaliseEmail(s)).toBeNull();
    }
  });
});
