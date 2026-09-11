import { describe, expect, test } from "bun:test";

import {
  MAX_ADVANCE_PERIODS,
  addOneMonth,
  isPeriodSettled,
  monthStartOf,
  outstandingCents,
  planPaymentAllocation,
} from "./allocation";
import type { AllocatablePeriod } from "./allocation";

const TIER_100 = 10_000; // HK$100/month, in integer cents

function period(overrides: Partial<AllocatablePeriod> = {}): AllocatablePeriod {
  return {
    id: "period-2026-08",
    periodMonth: "2026-08-01",
    committedCents: TIER_100,
    allocatedCents: 0,
    ...overrides,
  };
}

function totalAllocated(plan: { allocations: { amountCents: number }[] }): number {
  return plan.allocations.reduce((sum, a) => sum + a.amountCents, 0);
}

describe("planPaymentAllocation", () => {
  test("a first payment opens the starting month", () => {
    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [],
      committedCents: TIER_100,
      startMonth: "2026-08-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: null, periodMonth: "2026-08-01", amountCents: TIER_100 },
    ]);
    expect(plan.unallocatedCents).toBe(0);
  });

  test("the second month's payment goes to the second month, not the first", () => {
    // The Phase 3 completion outcome. August is settled; September's payment
    // must land on September rather than double-crediting a paid month.
    const august = period({ id: "p-aug", allocatedCents: TIER_100 });

    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [august],
      committedCents: TIER_100,
      startMonth: "2026-09-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: null, periodMonth: "2026-09-01", amountCents: TIER_100 },
    ]);
  });

  test("an outstanding month is filled before any later month is opened", () => {
    const august = period({ id: "p-aug", allocatedCents: 0 });

    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [august],
      committedCents: TIER_100,
      startMonth: "2026-09-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: "p-aug", periodMonth: "2026-08-01", amountCents: TIER_100 },
    ]);
  });

  test("paying several months in advance opens exactly the months it covers", () => {
    // HK$300 against a HK$100/month pledge is three months, not one payment of
    // HK$300 against one month.
    const plan = planPaymentAllocation({
      paymentCents: 30_000,
      periods: [],
      committedCents: TIER_100,
      startMonth: "2026-08-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: null, periodMonth: "2026-08-01", amountCents: TIER_100 },
      { periodId: null, periodMonth: "2026-09-01", amountCents: TIER_100 },
      { periodId: null, periodMonth: "2026-10-01", amountCents: TIER_100 },
    ]);
    expect(plan.unallocatedCents).toBe(0);
  });

  test("a partial payment leaves the month short instead of inventing a discount", () => {
    const plan = planPaymentAllocation({
      paymentCents: 6_000,
      periods: [period({ id: "p-aug" })],
      committedCents: TIER_100,
      startMonth: "2026-09-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: "p-aug", periodMonth: "2026-08-01", amountCents: 6_000 },
    ]);
    // The month is NOT settled, and no later month was opened with money that
    // August still needs.
    expect(outstandingCents({ ...period({ id: "p-aug" }), allocatedCents: 6_000 })).toBe(4_000);
  });

  test("a top-up finishes the short month before touching a later one", () => {
    // August is HK$40 short and September is untouched. The top-up must close
    // August first — otherwise August stays permanently outstanding while
    // later months run ahead of it.
    const august = period({ id: "p-aug", allocatedCents: 6_000 });

    const plan = planPaymentAllocation({
      paymentCents: 5_000,
      periods: [august],
      committedCents: TIER_100,
      startMonth: "2026-09-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: "p-aug", periodMonth: "2026-08-01", amountCents: 4_000 },
      { periodId: null, periodMonth: "2026-09-01", amountCents: 1_000 },
    ]);
    expect(totalAllocated(plan)).toBe(5_000);
  });

  test("never allocates more than the payment", () => {
    // The plan's hard rule: "The total allocated to months must not exceed the
    // verified payment amount available for allocation."
    const plan = planPaymentAllocation({
      paymentCents: 2_500,
      periods: [period({ id: "p-aug" }), period({ id: "p-sep", periodMonth: "2026-09-01" })],
      committedCents: TIER_100,
      startMonth: "2026-10-01",
    });

    expect(totalAllocated(plan)).toBe(2_500);
    expect(totalAllocated(plan) + plan.unallocatedCents).toBe(2_500);
  });

  test("skips months that are already settled", () => {
    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [
        period({ id: "p-aug", allocatedCents: TIER_100 }),
        period({ id: "p-sep", periodMonth: "2026-09-01", allocatedCents: 4_000 }),
      ],
      committedCents: TIER_100,
      startMonth: "2026-10-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: "p-sep", periodMonth: "2026-09-01", amountCents: 6_000 },
      { periodId: null, periodMonth: "2026-10-01", amountCents: 4_000 },
    ]);
  });

  test("an over-allocated month produces no negative allocation", () => {
    // A correction can leave a month allocated beyond its commitment. That must
    // read as settled, never as a negative amount clawed back here.
    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [period({ id: "p-aug", allocatedCents: 12_000 })],
      committedCents: TIER_100,
      startMonth: "2026-09-01",
    });

    expect(plan.allocations.every((a) => a.amountCents > 0)).toBe(true);
    expect(plan.allocations).toEqual([
      { periodId: null, periodMonth: "2026-09-01", amountCents: TIER_100 },
    ]);
  });

  test("fills months in chronological order whatever order they arrive in", () => {
    const plan = planPaymentAllocation({
      paymentCents: 20_000,
      periods: [
        period({ id: "p-oct", periodMonth: "2026-10-01" }),
        period({ id: "p-aug", periodMonth: "2026-08-01" }),
        period({ id: "p-sep", periodMonth: "2026-09-01" }),
      ],
      committedCents: TIER_100,
      startMonth: "2026-11-01",
    });

    expect(plan.allocations.map((a) => a.periodMonth)).toEqual(["2026-08-01", "2026-09-01"]);
  });

  test("surfaces money it cannot place rather than dropping it", () => {
    // An implausible amount must not silently open years of months, and must
    // not vanish either — staff have to see it to refund or correct it.
    const plan = planPaymentAllocation({
      paymentCents: TIER_100 * (MAX_ADVANCE_PERIODS + 5),
      periods: [],
      committedCents: TIER_100,
      startMonth: "2026-08-01",
    });

    expect(plan.allocations).toHaveLength(MAX_ADVANCE_PERIODS);
    expect(plan.unallocatedCents).toBe(TIER_100 * 5);
    expect(totalAllocated(plan) + plan.unallocatedCents).toBe(TIER_100 * (MAX_ADVANCE_PERIODS + 5));
  });

  test("never opens a month that already exists, even with a stale startMonth", () => {
    // A stale startMonth would otherwise collide with the existing September
    // row and violate unique (pledge_id, period_month).
    const plan = planPaymentAllocation({
      paymentCents: TIER_100,
      periods: [
        period({ id: "p-aug", allocatedCents: TIER_100 }),
        period({ id: "p-sep", periodMonth: "2026-09-01", allocatedCents: TIER_100 }),
      ],
      committedCents: TIER_100,
      startMonth: "2026-08-01",
    });

    expect(plan.allocations).toEqual([
      { periodId: null, periodMonth: "2026-10-01", amountCents: TIER_100 },
    ]);
  });

  test("preserves dollars and cents exactly", () => {
    // 123.45 stays 123.45 — the plan calls this out explicitly.
    const plan = planPaymentAllocation({
      paymentCents: 12_345,
      periods: [],
      committedCents: 12_345,
      startMonth: "2026-08-01",
    });

    expect(plan.allocations[0].amountCents).toBe(12_345);
  });

  test("rejects a non-positive or non-integer payment", () => {
    const base = { periods: [], committedCents: TIER_100, startMonth: "2026-08-01" };
    expect(() => planPaymentAllocation({ ...base, paymentCents: 0 })).toThrow(
      "paymentCents must be a positive integer",
    );
    expect(() => planPaymentAllocation({ ...base, paymentCents: -100 })).toThrow(
      "paymentCents must be a positive integer",
    );
    expect(() => planPaymentAllocation({ ...base, paymentCents: 100.5 })).toThrow(
      "paymentCents must be a positive integer",
    );
  });

  test("rejects a month that is not the first of a month", () => {
    expect(() =>
      planPaymentAllocation({
        paymentCents: TIER_100,
        periods: [],
        committedCents: TIER_100,
        startMonth: "2026-08-15",
      }),
    ).toThrow("startMonth must be the first day of a month");
  });

  test("does not mutate or reorder the caller's periods", () => {
    const periods = [
      period({ id: "p-sep", periodMonth: "2026-09-01" }),
      period({ id: "p-aug", periodMonth: "2026-08-01" }),
    ];
    planPaymentAllocation({
      paymentCents: TIER_100,
      periods,
      committedCents: TIER_100,
      startMonth: "2026-10-01",
    });
    expect(periods.map((p) => p.id)).toEqual(["p-sep", "p-aug"]);
    expect(periods.every((p) => p.allocatedCents === 0)).toBe(true);
  });
});

describe("month helpers", () => {
  test("addOneMonth rolls the year over at December", () => {
    expect(addOneMonth("2026-11-01")).toBe("2026-12-01");
    expect(addOneMonth("2026-12-01")).toBe("2027-01-01");
    expect(addOneMonth("2026-01-01")).toBe("2026-02-01");
  });

  test("monthStartOf normalises a payment date to its month", () => {
    // payment_date is when money moved; the period is the month it pays for.
    expect(monthStartOf("2026-09-15")).toBe("2026-09-01");
    expect(monthStartOf("2026-09-01")).toBe("2026-09-01");
    expect(monthStartOf("2026-09-30T12:00:00.000Z")).toBe("2026-09-01");
  });

  test("monthStartOf rejects something that is not a date", () => {
    expect(() => monthStartOf("not-a-date")).toThrow("Not an ISO date");
  });

  test("isPeriodSettled and outstandingCents agree on the boundary", () => {
    const exact = period({ allocatedCents: TIER_100 });
    expect(isPeriodSettled(exact)).toBe(true);
    expect(outstandingCents(exact)).toBe(0);

    const short = period({ allocatedCents: TIER_100 - 1 });
    expect(isPeriodSettled(short)).toBe(false);
    expect(outstandingCents(short)).toBe(1);

    const over = period({ allocatedCents: TIER_100 + 500 });
    expect(isPeriodSettled(over)).toBe(true);
    expect(outstandingCents(over)).toBe(0);
  });
});
