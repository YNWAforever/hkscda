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

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: () => ({
    data: pledgesError ? undefined : { pledges: [], total: 0 },
    error: pledgesError,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { PledgeReviewLane } = await import("./PledgeReviewLane");

const render = () => renderToStaticMarkup(<PledgeReviewLane />);

describe("PledgeReviewLane", () => {
  test("renders the pledge review workspace", () => {
    expect(render()).toContain("承諾審核");
  });

  test("shows a retry instead of a raw English message and a false empty state on failure", () => {
    pledgesError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("API request failed");
    pledgesError = null;
  });
});
