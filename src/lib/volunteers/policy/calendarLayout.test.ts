import { expect, test } from "bun:test";
import { layoutCalendarEvents } from "./calendarLayout";
test("transitive overlaps share stable columns and adjacent duties reuse space", () => {
  const make = (id: string, start: string, end: string) => ({
    id,
    starts_at: `2026-09-13T${start}:00+08:00`,
    ends_at: `2026-09-13T${end}:00+08:00`,
  });
  const result = layoutCalendarEvents([
    make("A", "13:00", "17:00"),
    make("B", "15:00", "16:30"),
    make("C", "16:30", "18:00"),
    make("D", "18:00", "19:00"),
  ]);
  expect(result.get("A")).toEqual({ column: 0, columns: 2 });
  expect(result.get("B")).toEqual({ column: 1, columns: 2 });
  expect(result.get("C")).toEqual({ column: 1, columns: 2 });
  expect(result.get("D")).toEqual({ column: 0, columns: 1 });
});
