import { hkDateSchema } from "../../../lib/volunteers/bulk/service";

export type CalendarPage<T> = { activities: T[]; total: number };
export type CalendarCollection<T> = {
  scope: string;
  pages: Readonly<Record<number, CalendarPage<T>>>;
  changed: boolean;
};

/** Same 93-day maximum as the existing server calendar read, inclusive in the UI. */
export function calendarRangeProblem(filter: { from?: string; until?: string }) {
  if (!filter.from || !filter.until) return "required" as const;
  if (
    !hkDateSchema.safeParse(filter.from).success ||
    !hkDateSchema.safeParse(filter.until).success ||
    filter.until < filter.from
  )
    return "invalid" as const;
  return Date.parse(filter.until) - Date.parse(filter.from) > 92 * 86400000
    ? ("too_long" as const)
    : null;
}

/** Collect only successful reads of the currently active actor/filter scope. */
export function collectCalendarPage<T extends { id: string }>(
  previous: CalendarCollection<T> | null,
  scope: string,
  page: number,
  data: CalendarPage<T>,
): CalendarCollection<T> {
  const current = previous?.scope === scope ? previous : { scope, pages: {}, changed: false };
  if (current.pages[page] === data) return current;
  const expected = Math.max(0, Math.min(25, data.total - (page - 1) * 25));
  const valid =
    Number.isSafeInteger(page) &&
    page >= 1 &&
    Number.isSafeInteger(data.total) &&
    data.total >= 0 &&
    data.activities.length === expected &&
    new Set(data.activities.map((row) => row.id)).size === data.activities.length;
  if (!valid) return { ...current, changed: true };
  const prior = Object.values(current.pages)[0];
  if (prior && prior.total !== data.total) return { scope, pages: { [page]: data }, changed: true };
  const otherIds = new Set(
    Object.entries(current.pages).flatMap(([key, value]) =>
      Number(key) === page ? [] : value.activities.map((row) => row.id),
    ),
  );
  if (data.activities.some((row) => otherIds.has(row.id))) return { ...current, changed: true };
  return { ...current, pages: { ...current.pages, [page]: data } };
}

export function calendarCoverage<T extends { id: string }>(
  collection: CalendarCollection<T> | null,
  scope: string,
): { activities: T[]; loaded: number; total: number | null; complete: boolean; changed: boolean } {
  if (!collection || collection.scope !== scope)
    return { activities: [], loaded: 0, total: null, complete: false, changed: false };
  const pages = Object.entries(collection.pages).sort(([a], [b]) => Number(a) - Number(b));
  const total = pages[0]?.[1].total ?? null;
  const activities = pages.flatMap(([, data]) => data.activities);
  const required = total === null ? 0 : Math.max(1, Math.ceil(total / 25));
  const allPages =
    total === 0 ||
    Array.from({ length: required }, (_, i) => i + 1).every(
      (page) => collection.pages[page] !== undefined,
    );
  return {
    activities,
    loaded: activities.length,
    total,
    complete: !collection.changed && total !== null && allPages && activities.length === total,
    changed: collection.changed,
  };
}
