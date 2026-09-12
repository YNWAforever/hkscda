/**
 * Allocating one verified payment across sponsorship months.
 *
 * The master plan (§6.2) separates four things the old single `status` column
 * ran together, and this module owns the arithmetic of the last one:
 *
 *   - a **pledge** is an intention, not money received;
 *   - a **period** is one month's commitment;
 *   - a **payment** is money that actually moved, evidenced by an approved
 *     proof;
 *   - an **allocation** attributes one existing payment to one or more months.
 *
 * An allocation is *attribution*, never revenue. The payment row remains the
 * single accounting record, which is what "monthly allocations reference
 * existing payments without duplicate accounting" requires: allocating HK$100
 * twice across two months must not turn into HK$200 of income.
 *
 * Two rules make the awkward cases fall out instead of needing special paths:
 *
 *   1. months are filled in chronological order, oldest outstanding first;
 *   2. a month is filled only up to what it still needs.
 *
 * From those: a **second month** is just the next outstanding month; **advance
 * payment** is leftover money opening later months; a **partial payment**
 * leaves a month short without inventing a discount; and a **top-up** fills
 * that short month first, before touching any later one. None of those are
 * separate code paths here.
 *
 * Everything is integer cents. Nothing is rounded, and money that cannot be
 * placed is returned as `unallocatedCents` rather than quietly dropped — the
 * caller must show it to staff, because silently absorbing a supporter's
 * payment is worse than refusing to place it.
 */

/** The maximum number of future months one payment may open by itself. */
export const MAX_ADVANCE_PERIODS = 24;

export type AllocatablePeriod = {
  id: string;
  /** First day of the month, `YYYY-MM-01`. */
  periodMonth: string;
  /** What this month asked for. Held per period so a later tier change never rewrites history. */
  committedCents: number;
  /** Already attributed to this month by earlier payments. */
  allocatedCents: number;
};

export type PlannedAllocation = {
  /** `null` when the month does not exist yet and must be opened. */
  periodId: string | null;
  periodMonth: string;
  amountCents: number;
};

export type AllocationPlan = {
  allocations: PlannedAllocation[];
  /**
   * Money the plan could not place — the payment exceeded what the pledge can
   * absorb within `MAX_ADVANCE_PERIODS`. Surface it; never discard it.
   */
  unallocatedCents: number;
};

export type PlanPaymentAllocationInput = {
  /** The approved proof's amount. Must be a positive integer number of cents. */
  paymentCents: number;
  /** Existing months for this pledge, in any order. */
  periods: readonly AllocatablePeriod[];
  /** The pledge's monthly commitment, used for months this payment opens. */
  committedCents: number;
  /**
   * The month to open when nothing is outstanding — normally the month after
   * the last existing period, or the payment's own month for a first payment.
   */
  startMonth: string;
  maxAdvancePeriods?: number;
};

/**
 * Plans how one payment is attributed to months. Pure: it reads no clock and
 * writes nothing, so a second month can be rehearsed without waiting a month.
 */
export function planPaymentAllocation(input: PlanPaymentAllocationInput): AllocationPlan {
  const { paymentCents, committedCents, startMonth } = input;
  const maxAdvancePeriods = input.maxAdvancePeriods ?? MAX_ADVANCE_PERIODS;

  assertPositiveCents(paymentCents, "paymentCents");
  assertPositiveCents(committedCents, "committedCents");
  assertMonthStart(startMonth, "startMonth");

  const allocations: PlannedAllocation[] = [];
  let remaining = paymentCents;

  const existing = [...input.periods].sort(compareByMonth);
  for (const period of existing) {
    if (remaining <= 0) break;
    assertMonthStart(period.periodMonth, `period ${period.id}`);
    // A month already over-allocated (a correction, say) needs nothing and
    // must not produce a negative allocation.
    const outstanding = period.committedCents - period.allocatedCents;
    if (outstanding <= 0) continue;

    const amountCents = Math.min(outstanding, remaining);
    allocations.push({ periodId: period.id, periodMonth: period.periodMonth, amountCents });
    remaining -= amountCents;
  }

  // Whatever is left pays for months not yet opened: this is what "paid
  // several months in advance" means in the data.
  let month = nextOpenMonth(existing, startMonth);
  let opened = 0;
  while (remaining > 0 && opened < maxAdvancePeriods) {
    const amountCents = Math.min(committedCents, remaining);
    allocations.push({ periodId: null, periodMonth: month, amountCents });
    remaining -= amountCents;
    month = addOneMonth(month);
    opened += 1;
  }

  return { allocations, unallocatedCents: remaining };
}

/** What a month still needs, never negative. */
export function outstandingCents(period: AllocatablePeriod): number {
  return Math.max(0, period.committedCents - period.allocatedCents);
}

/**
 * Whether a month is fully covered. Deliberately `>=`: an over-allocated month
 * (from a correction) is settled, not perpetually outstanding.
 */
export function isPeriodSettled(period: AllocatablePeriod): boolean {
  return period.allocatedCents >= period.committedCents;
}

/** `YYYY-MM-01` for the month containing an ISO date. */
export function monthStartOf(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!match) throw new Error(`Not an ISO date: ${isoDate}`);
  return `${match[1]}-${match[2]}-01`;
}

/** The month after `YYYY-MM-01`, rolling the year over at December. */
export function addOneMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}-01`;
}

function nextOpenMonth(sortedPeriods: readonly AllocatablePeriod[], startMonth: string): string {
  const last = sortedPeriods[sortedPeriods.length - 1];
  if (!last) return startMonth;
  const afterLast = addOneMonth(last.periodMonth);
  // Never open a month at or before one that already exists, even if the
  // caller's startMonth is stale — that would collide with an existing row.
  return afterLast > startMonth ? afterLast : startMonth;
}

function compareByMonth(a: AllocatablePeriod, b: AllocatablePeriod): number {
  if (a.periodMonth !== b.periodMonth) return a.periodMonth < b.periodMonth ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function assertPositiveCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents, received ${value}`);
  }
}

function assertMonthStart(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-01$/.test(value)) {
    throw new Error(`${label} must be the first day of a month (YYYY-MM-01), received ${value}`);
  }
}
