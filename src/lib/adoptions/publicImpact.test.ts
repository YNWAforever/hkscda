import { describe, expect, test } from "bun:test";
import { buildAdoptionImpactReport, trailingMonths } from "./publicImpact";

describe("trailingMonths", () => {
  test("returns 12 months ending at the given date, oldest first", () => {
    const months = trailingMonths(new Date("2026-08-15T00:00:00.000Z"));

    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-09");
    expect(months[11].month).toBe("2026-08");
    expect(months[11].start).toBe("2026-08-01");
    expect(months[11].end).toBe("2026-09-01");
    expect(months[11].label).toBe("2026年8月");
  });

  test("handles a January now correctly across the year boundary", () => {
    const months = trailingMonths(new Date("2026-01-10T00:00:00.000Z"));

    expect(months[0].month).toBe("2025-02");
    expect(months[11].month).toBe("2026-01");
  });
});

describe("buildAdoptionImpactReport", () => {
  test("zero-fills months with no adoptions and keeps the lifetime total separate", () => {
    const report = buildAdoptionImpactReport({
      total: 342,
      monthlyCounts: { "2026-08": 5, "2026-06": 2 },
      now: new Date("2026-08-15T00:00:00.000Z"),
    });

    expect(report.total).toBe(342);
    expect(report.monthly).toHaveLength(12);
    expect(report.monthly.find((m) => m.month === "2026-08")?.count).toBe(5);
    expect(report.monthly.find((m) => m.month === "2026-07")?.count).toBe(0);
    expect(report.asOf).toBe("2026-08-15T00:00:00.000Z");
  });
});
