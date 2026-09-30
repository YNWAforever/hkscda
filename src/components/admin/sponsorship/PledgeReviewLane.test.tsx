import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const realReactQuery = await import("@tanstack/react-query");
const realAdminPageCopy = await import("../adminPageCopy");

// mock.module patches the shared module registry for the whole process, not
// just this file, so the language is pinned here explicitly rather than left
// to whatever AdminLanguageProvider default happens to be live relative to
// other test files' mocks.
mock.module("../adminPageCopy", () => ({
  ...realAdminPageCopy,
  useAdminPageCopy: () => ({ language: "zh", pageCopy: realAdminPageCopy.adminPageCopy.zh }),
}));

let pledgesError: Error | null = null;
let mockRole: "staff" | "treasurer" = "treasurer";

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: (options: { queryKey?: readonly unknown[] }) => ({
    data:
      options.queryKey?.[0] === "admin-me"
        ? { admin: { role: mockRole } }
        : options.queryKey?.[0] === "sponsorship-followup-assignees"
          ? { assignees: [] }
          : pledgesError
            ? undefined
            : { pledges: [], total: 0 },
    error: options.queryKey?.[0] === "admin-me" ? null : pledgesError,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { PledgeReviewLane } = await import("./PledgeReviewLane");
const { PLEDGE_ROUTE } = await import("./pledgeListRoute");

const render = () => renderToStaticMarkup(<PledgeReviewLane />);

describe("PledgeReviewLane", () => {
  test("direct task URL restores the proof queue filter and clears it on all", () => {
    const route = PLEDGE_ROUTE.read(new URLSearchParams("proof=pending&page=2"), {
      status: "all",
      proof: "all",
      pageSize: 25,
    });
    expect(route.filters.proof).toBe("pending");
    expect(route.page).toBe(2);
    const params = new URLSearchParams("proof=pending");
    PLEDGE_ROUTE.write(params, { ...route.filters, proof: "all" }, 1);
    expect(params.has("proof")).toBe(false);
  });

  test("renders a distinct pending-proof filter", () => {
    expect(render()).toContain("憑證審核篩選");
  });

  test("renders the pledge review workspace", () => {
    expect(render()).toContain("承諾審核");
  });

  test("shows follow-up bulk controls to staff but not treasury readers", () => {
    mockRole = "treasurer";
    expect(render()).not.toContain("助養跟進選取");
    mockRole = "staff";
    expect(render()).toContain("助養跟進選取");
    expect(render()).toContain("選取全部符合條件");
    mockRole = "treasurer";
  });

  test("shows a retry instead of a raw English message and a false empty state on failure", () => {
    pledgesError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("API request failed");
    pledgesError = null;
  });
});
