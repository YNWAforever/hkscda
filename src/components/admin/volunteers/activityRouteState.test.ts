import { expect, test } from "bun:test";
import { activityFilterSchema, hkDate } from "../../../lib/volunteers/bulk/service";
import {
  readActivityRouteState,
  writeActivityRouteState,
  toActivityApiFilter,
} from "./activityRouteState";

const today = "2026-10-13";
test("all dates survive write and reload; RPC never receives date_scope or q from URL", () => {
  const state = readActivityRouteState(
    new URLSearchParams("date_scope=all&page=2&q=private"),
    today,
  );
  const params = new URLSearchParams();
  writeActivityRouteState(params, state);
  expect(readActivityRouteState(params, today)).toEqual(state);
  expect(state.filters.from).toBeUndefined();
  expect(state.filters.until).toBeUndefined();
  expect(params.has("q")).toBe(false);
  expect(activityFilterSchema.safeParse(toActivityApiFilter(state.filters)).success).toBe(true);
  expect(toActivityApiFilter(state.filters)).not.toHaveProperty("date_scope");
});
test("legacy dates are custom, a fresh visit keeps future30, history ends on the previous HK day", () => {
  expect(
    readActivityRouteState(new URLSearchParams("from=2024-02-29&until=2024-03-01"), today).filters
      .date_scope,
  ).toBe("custom");
  expect(readActivityRouteState(new URLSearchParams(), today).filters).toMatchObject({
    date_scope: "future",
    from: today,
    until: "2026-11-12",
  });
  expect(hkDate(new Date("2026-10-12T16:00:00Z"))).toBe(today);
  expect(
    readActivityRouteState(new URLSearchParams("date_scope=history"), today).filters,
  ).toMatchObject({ date_scope: "history", until: "2026-10-12", sort: "desc" });
});
test("invalid dates, inverted ranges, scopes and pagination recover safely", () => {
  for (const query of [
    "date_scope=custom&from=2026-02-30",
    "from=2026-10-14&until=2026-10-13",
    "date_scope=wat",
  ]) {
    expect(readActivityRouteState(new URLSearchParams(query), today).filters.date_scope).toBe(
      "future",
    );
  }
  for (const page of ["0", "-1", "100001", "NaN"])
    expect(readActivityRouteState(new URLSearchParams(`page=${page}`), today).page).toBe(1);
});

test("a temporarily inverted UI range reaches server validation without crashing render", () => {
  const ui = {
    date_scope: "custom" as const,
    from: "2026-10-14",
    until: "2026-10-13",
    sort: "asc" as const,
  };
  expect(() => toActivityApiFilter(ui)).not.toThrow();
  expect(activityFilterSchema.safeParse(toActivityApiFilter(ui)).success).toBe(false);
});
