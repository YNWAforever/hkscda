import { expect, test } from "bun:test";
import {
  activityRouterSearch,
  buildActivityReturnHref,
  readActivityReturnState,
} from "./activityReturnState";

test("Router search keeps numeric pages and boolean filters instead of JSON-quoted strings", () => {
  const search = activityRouterSearch(
    readActivityReturnState(new URLSearchParams("date_scope=all&page=2&shortage=true&q=private")),
  );
  expect(search.page).toBe(2);
  expect(search.shortage).toBe(true);
  expect(search.q).toBeUndefined();
  expect(search.date_scope).toBe("all");
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
