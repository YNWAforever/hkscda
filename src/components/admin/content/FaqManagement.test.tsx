import { describe, expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

const realReactQuery = await import("@tanstack/react-query");

let entriesError: Error | null = null;
let searchGapsError: Error | null = null;

// The page runs two independent queries; tell them apart by key.
mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const isSearchGaps = queryKey[0] === "admin-faq-search-gaps";
    const error = isSearchGaps ? searchGapsError : entriesError;
    return {
      data: error ? undefined : isSearchGaps ? { days: 30, gaps: [] } : [],
      error,
      isLoading: false,
      isError: error !== null,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { FaqManagement } = await import("./FaqManagement");

describe("FaqManagement", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    entriesError = new Error("boom");
    const markup = renderAdminInChinese(<FaqManagement />);
    expect(markup).toContain("無法載入常見問題");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    expect(markup).not.toContain("測試答案");
    entriesError = null;
  });

  test("shows the answer tester under the header and above the table", () => {
    const markup = renderAdminInChinese(<FaqManagement />);

    const heading = markup.indexOf("常見問題</h1>");
    const tester = markup.indexOf("測試答案");
    const table = markup.indexOf("<table");
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(tester).toBeGreaterThan(heading);
    expect(table).toBeGreaterThan(tester);
  });

  test("shows the search-gap report under the header and above the answer tester", () => {
    const markup = renderAdminInChinese(<FaqManagement />);

    const heading = markup.indexOf("常見問題</h1>");
    const report = markup.indexOf("搜尋未有答案的主題（過去 30 日）");
    const tester = markup.indexOf("測試答案");
    expect(report).toBeGreaterThan(heading);
    expect(tester).toBeGreaterThan(report);
  });

  test("shows the search-gap report even when the FAQ list failed to load", () => {
    entriesError = new Error("boom");
    const markup = renderAdminInChinese(<FaqManagement />);
    entriesError = null;

    expect(markup).toContain("無法載入常見問題");
    expect(markup).toContain("搜尋未有答案的主題（過去 30 日）");
    expect(markup).toContain("過去 30 日未有訪客搜尋找不到答案。");
  });

  test("a failed search-gap report does not hide the FAQ list", () => {
    searchGapsError = new Error("boom");
    const markup = renderAdminInChinese(<FaqManagement />);
    searchGapsError = null;

    expect(markup).toContain("無法載入搜尋主題報告");
    expect(markup).toContain("測試答案");
    expect(markup).toContain("<table");
    expect(markup).not.toContain("無法載入常見問題");
  });
});
