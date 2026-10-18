import { expect, test } from "bun:test";
import { calendarRangeProblem, collectCalendarPage, calendarCoverage } from "./activityCalendar";

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, n) => ({ id: String(from + n) }));

test.each([0, 1, 25])("a successful %s-session range can be declared complete", (total) => {
  const collection = collectCalendarPage(null, "scope-a", 1, { activities: rows(1, total), total });
  expect(calendarCoverage(collection, "scope-a")).toMatchObject({
    total,
    loaded: total,
    complete: true,
    changed: false,
  });
});
test("26 sessions require both bounded pages and retain the complete collection", () => {
  const page1 = collectCalendarPage(null, "scope-a", 1, { activities: rows(1, 25), total: 26 });
  expect(calendarCoverage(page1, "scope-a")).toMatchObject({
    loaded: 25,
    total: 26,
    complete: false,
  });
  const page2 = collectCalendarPage(page1, "scope-a", 2, { activities: rows(26, 1), total: 26 });
  expect(calendarCoverage(page2, "scope-a")).toMatchObject({ loaded: 26, complete: true });
  expect(calendarCoverage(page2, "scope-a").activities.map((r) => r.id)).toEqual(
    rows(1, 26).map((r) => r.id),
  );
});
test("a direct second-page bookmark remains partial until the first page is read", () => {
  const page2 = collectCalendarPage(null, "scope-a", 2, { activities: rows(26, 1), total: 26 });
  expect(calendarCoverage(page2, "scope-a").complete).toBe(false);
  expect(
    calendarCoverage(
      collectCalendarPage(page2, "scope-a", 1, { activities: rows(1, 25), total: 26 }),
      "scope-a",
    ).complete,
  ).toBe(true);
});
test("a changed scope never displays another date or actor's collection", () => {
  const old = collectCalendarPage(null, "old-actor-date", 1, {
    activities: rows(1, 25),
    total: 26,
  });
  expect(calendarCoverage(old, "new-actor-date")).toMatchObject({
    total: null,
    loaded: 0,
    complete: false,
  });
  const next = collectCalendarPage(old, "new-actor-date", 1, { activities: rows(90, 1), total: 1 });
  expect(calendarCoverage(next, "new-actor-date").activities).toEqual([{ id: "90" }]);
});
test("a moving page or total cannot claim a complete calendar", () => {
  const first = collectCalendarPage(null, "a", 1, { activities: rows(1, 25), total: 26 });
  expect(
    calendarCoverage(
      collectCalendarPage(first, "a", 2, { activities: [{ id: "25" }], total: 26 }),
      "a",
    ),
  ).toMatchObject({ changed: true, complete: false });
  expect(
    calendarCoverage(
      collectCalendarPage(first, "a", 2, { activities: rows(26, 2), total: 27 }),
      "a",
    ),
  ).toMatchObject({ changed: true, complete: false });
});
test("an incomplete server page is not a successful empty range", () => {
  const incomplete = collectCalendarPage(null, "a", 1, { activities: [], total: 26 });
  expect(calendarCoverage(incomplete, "a")).toMatchObject({ changed: true, complete: false });
});
test("reusing the same cached page does not create an update loop", () => {
  const page = { activities: rows(1, 1), total: 1 };
  const first = collectCalendarPage(null, "a", 1, page);
  expect(collectCalendarPage(first, "a", 1, page)).toBe(first);
});
test("calendar range is required and uses the existing inclusive 93-day boundary", () => {
  expect(calendarRangeProblem({})).toBe("required");
  expect(calendarRangeProblem({ from: "2026-01-01" })).toBe("required");
  expect(calendarRangeProblem({ from: "2026-01-01", until: "2026-04-03" })).toBe(null);
  expect(calendarRangeProblem({ from: "2026-01-01", until: "2026-04-04" })).toBe("too_long");
  expect(calendarRangeProblem({ from: "2026-02-30", until: "2026-03-01" })).toBe("invalid");
  expect(calendarRangeProblem({ from: "2026-03-02", until: "2026-03-01" })).toBe("invalid");
});
