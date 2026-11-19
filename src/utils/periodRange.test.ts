import { describe, expect, it } from "vitest";
import { getPeriodRange } from "@/utils/periodRange";

describe("getPeriodRange", () => {
  it("returns the first half-month range", () => {
    expect(getPeriodRange("November 2026 I")).toEqual({
      start: "2026-11-01",
      end: "2026-11-15",
      label: "Nov 1, 2026 – Nov 15, 2026",
    });
  });

  it("uses the correct last day for leap-year February", () => {
    expect(getPeriodRange("February 2028 II")).toEqual({
      start: "2028-02-16",
      end: "2028-02-29",
      label: "Feb 16, 2028 – Feb 29, 2028",
    });
  });

  it("uses a fallback year when the period omits its year", () => {
    expect(getPeriodRange("November II", 2026)?.start).toBe("2026-11-16");
  });

  it("rejects full-month and malformed labels", () => {
    expect(getPeriodRange("June 2026 Full")).toBeNull();
    expect(getPeriodRange("June 2026")).toBeNull();
  });
});
