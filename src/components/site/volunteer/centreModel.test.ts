import { expect, test } from "bun:test";
import {
  filterCentreSessions,
  registrationSection,
  formatSessionDate,
  formatSessionRange,
} from "./centreModel";
import type { PolicySession } from "../../../lib/volunteers/policy/booking";
const session = (id: string, start: string, shelter: string) =>
  ({ id, title: id, starts_at: start, shelter, location: "香港" }) as PolicySession;
test("filters canonical shelter and Hong Kong date, not UTC day or title guesses", () => {
  const sessions = [
    session("狗狗協助", "2026-09-14T17:00:00Z", "cat"),
    session("清潔", "2026-09-14T02:00:00Z", "dog"),
  ];
  expect(
    filterCentreSessions(sessions, { query: "", shelter: "cat", date: "2026-09-15" }).map(
      (s) => s.id,
    ),
  ).toEqual(["狗狗協助"]);
  expect(filterCentreSessions(sessions, { query: "清潔", shelter: "all", date: "" })).toHaveLength(
    1,
  );
});
test("keeps cancelled, historical and unknown-date records distinct", () => {
  expect(
    registrationSection({ status: "cancelled", attendance_status: "not_recorded" }, new Date()),
  ).toBe("closed");
  expect(
    registrationSection({ status: "approved", attendance_status: "attended" }, new Date()),
  ).toBe("past");
  expect(
    registrationSection(
      {
        status: "approved",
        attendance_status: "not_recorded",
        activity: { starts_at: "2020-01-01" },
      },
      new Date(),
    ),
  ).toBe("past");
  expect(
    registrationSection({ status: "approved", attendance_status: "not_recorded" }, new Date()),
  ).toBe("upcoming");
  expect(formatSessionDate(null)).toBe("日期待確認");
});

test("shows end date as well as start across midnight", () => {
  const text = formatSessionRange("2026-09-14T15:00:00Z", "2026-09-14T17:00:00Z");
  expect(text).toContain("14");
  expect(text).toContain("15");
  expect(text).toContain("—");
});
