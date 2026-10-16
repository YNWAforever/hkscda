import { expect, test } from "bun:test";
import {
  activityRouterSearch,
  buildActivityReturnHref,
  readActivityReturnState,
  buildLegacyPendingHref,
  readPendingActivityReturnState,
  buildPendingRegistrationHref,
} from "./activityReturnState";

test("activity return carries the roster page without replacing its list page", () => {
  const state = readActivityReturnState(new URLSearchParams("date_scope=all&page=4&detail_page=2"));
  expect(state.safeSearch.page).toBe("4");
  expect(state.safeSearch.detail_page).toBe("2");
  expect(activityRouterSearch(state).detail_page).toBe(2);
});

test("Router search keeps numeric pages and boolean filters instead of JSON-quoted strings", () => {
  const search = activityRouterSearch(
    readActivityReturnState(new URLSearchParams("date_scope=all&page=2&shortage=true&q=private")),
  );
  expect(search.page).toBe(2);
  expect(search.shortage).toBe(true);
  expect(search.q).toBeUndefined();
  expect(search.date_scope).toBe("all");
});

test("legacy pending context is namespaced, sanitized and roundtrips through registration", () => {
  const selected = "90000000-0000-4000-8000-000000000001";
  for (const scope of ["all", "custom", "history"]) {
    const source = new URLSearchParams({
      date_scope: scope,
      page: "2",
      selected,
      shortage: "true",
      from: "2024-02-29",
      until: "2024-03-01",
      return_from: "calendar",
      q: "private",
      return: "https://evil.invalid",
      action: "approve",
      registration_status: "pending",
    });
    const expected = readActivityReturnState(source);
    const tasks = new URL(buildLegacyPendingHref(source), "https://example.invalid");
    expect(tasks.searchParams.get("pending_scope")).toBe("all");
    expect(tasks.searchParams.has("page")).toBe(false);
    tasks.searchParams.set("page", "3");
    tasks.searchParams.set("activity_return_q", "private");
    tasks.searchParams.set("activity_return_return", "https://evil.invalid");
    tasks.searchParams.set("activity_return_action", "approve");
    const restored = readPendingActivityReturnState(tasks.searchParams);
    expect(restored).toEqual(expected);
    const detail = new URL(buildPendingRegistrationHref("registration-id", restored), tasks);
    expect(readActivityReturnState(detail.searchParams)).toEqual(expected);
    expect(activityRouterSearch(restored).page).toBe(2);
    const href = buildActivityReturnHref(restored);
    expect(href).toContain("/calendar?");
    expect(href).toContain("selected=" + selected);
    for (const unsafe of ["private", "evil.invalid", "approve", "registration_status"])
      expect(detail.href + href + buildLegacyPendingHref(source)).not.toContain(unsafe);
  }
});
test("malformed task return state and destinations use only the safe internal activity route", () => {
  const state = readPendingActivityReturnState(
    new URLSearchParams(
      "activity_return_return_from=https://evil.invalid&activity_return_page=NaN&activity_return_selected=bad&activity_return_view=bad",
    ),
  );
  expect(state).toEqual({ from: "activities", safeSearch: {} });
  expect(buildPendingRegistrationHref("id", state)).toBe(
    "/admin/volunteers/registrations/id?return_from=activities",
  );
});
test("return state retains dates/page/selection and rejects external destinations and q", () => {
  const state = readActivityReturnState(
    new URLSearchParams(
      "return_from=calendar&date_scope=all&page=2&selected=90000000-0000-4000-8000-000000000001&q=private&return=https://evil.invalid",
    ),
  );
  const href = buildActivityReturnHref(state);
  expect(href).toContain("/admin/volunteers/calendar?");
  expect(href).toContain("date_scope=all");
  expect(href).toContain("page=2");
  expect(href).not.toContain("private");
  expect(href).not.toContain("evil");
  expect(
    buildActivityReturnHref(
      readActivityReturnState(new URLSearchParams("return_from=https://evil.invalid&page=0")),
    ),
  ).toBe("/admin/volunteers/activities");
});
