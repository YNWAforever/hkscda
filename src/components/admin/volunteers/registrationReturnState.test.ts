import { expect, test } from "bun:test";
import {
  readRegistrationReturnState,
  registrationRouterSearch,
  buildRegistrationReturnHref,
  buildTaskRegistrationHref,
} from "./registrationReturnState";
import { readActivityReturnState } from "./activityReturnState";
const id = "90000000-0000-4000-8000-000000000001";
test("task page two and overdue scope survive opening and returning from a registration", () => {
  const state = readRegistrationReturnState(
    new URLSearchParams("return_from=tasks&pending_scope=overdue&page=2&q=private"),
  );
  const href = buildTaskRegistrationHref(id, state);
  const back = readRegistrationReturnState(new URL(href, "http://fixture.invalid").searchParams);
  expect(buildRegistrationReturnHref(back)).toBe(
    "/admin/volunteers/tasks?pending_scope=overdue&page=2",
  );
  expect(registrationRouterSearch(state)).toEqual({ pending_scope: "overdue", page: 2 });
  expect(href).not.toContain("private");
});
test("legacy activity bookmark keeps its independent safe return context through tasks", () => {
  const state = readRegistrationReturnState(
    new URLSearchParams(
      "return_from=tasks&pending_scope=all&page=2&activity_return_return_from=calendar&activity_return_page=4&activity_return_date_scope=all&activity_return_q=private",
    ),
  );
  const result = new URL(buildRegistrationReturnHref(state), "http://fixture.invalid");
  expect(result.searchParams.get("page")).toBe("2");
  expect(result.searchParams.get("activity_return_page")).toBe("4");
  expect(result.searchParams.get("activity_return_return_from")).toBe("calendar");
  expect(result.searchParams.has("activity_return_q")).toBe(false);
});
test("invalid destinations and private fields cannot enter return hrefs", () => {
  const state = readRegistrationReturnState(
    new URLSearchParams(
      "return_from=https://evil.invalid&return=https://evil.invalid&q=private&token=secret&actor=someone&page=0",
    ),
  );
  expect(buildRegistrationReturnHref(state)).not.toMatch(/evil|private|secret|someone/);
  expect(state.from).toBe("activities");
  expect(readActivityReturnState(new URLSearchParams("return_from=tasks")).from).toBe("activities");
});
test("roster detail page stays separate from the activity list page", () => {
  const state = readRegistrationReturnState(
    new URLSearchParams(
      `return_from=activities&date_scope=all&page=4&detail_page=2&selected=${id}`,
    ),
  );
  const back = new URL(buildRegistrationReturnHref(state), "http://fixture.invalid");
  expect(back.searchParams.get("page")).toBe("4");
  expect(back.searchParams.get("detail_page")).toBe("2");
  expect(back.searchParams.get("selected")).toBe(id);
});
