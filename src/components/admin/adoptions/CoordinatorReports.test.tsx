import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

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

let summaryError: Error | null = null;
let historyError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (String(queryKey[0]) === "coordinator-reports-summary") {
      return {
        data: summaryError
          ? undefined
          : {
              summary: {
                month: "2026-09",
                publicIntakeCases: 3,
                manualIntakeCases: 1,
                successfulAdoptions: 2,
                openCases: 5,
                overdueTasks: 7,
                exportsRun: 4,
              },
            },
        error: summaryError,
        isError: summaryError !== null,
        isLoading: false,
        isFetching: false,
        refetch: () => {},
      };
    }
    return {
      data: historyError ? undefined : { exports: [], total: 0 },
      error: historyError,
      isError: historyError !== null,
      isLoading: false,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { CoordinatorReports } = await import("./CoordinatorReports");

const render = () => renderToStaticMarkup(<CoordinatorReports />);

describe("CoordinatorReports", () => {
  test("renders the real monthly figures", () => {
    const markup = render();
    expect(markup).toContain("協調員報表");
    expect(markup).toContain("7"); // overdueTasks
  });

  test("shows the unavailable marker instead of 0 on every tile when the summary query fails", () => {
    // A rejected summaryQuery previously left every tile reading a real,
    // meaningful 0 (`summary?.[tile] ?? 0`) once isLoading settled false --
    // indistinguishable from "genuinely zero of everything this month".
    summaryError = new Error("boom");
    const markup = render();
    expect((markup.match(/—/g) ?? []).length).toBe(6);
    expect(markup).not.toContain(">0<");
    summaryError = null;
  });

  test("blocks paging forward through the shared TablePager when the export history query fails", () => {
    historyError = new Error("boom");
    const markup = render();
    expect(markup).toContain("下一頁");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
    historyError = null;
  });
});
