import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

import type { SearchGap, SearchGapReport } from "../../../lib/faq/searchGaps";

const realReactQuery = await import("@tanstack/react-query");
// Spread into a plain object so the restore below is not the mutated registry entry.
const realAdminHttpModule = { ...(await import("../../../lib/admin/http")) };

type QueryOptions = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };

let queryState: {
  data: SearchGapReport | undefined;
  error: Error | null;
  isLoading: boolean;
  isError: boolean;
} = { data: undefined, error: null, isLoading: false, isError: false };
let lastQueryOptions: QueryOptions | null = null;

const fetchAdminJsonMock = mock(
  async (_path: string): Promise<SearchGapReport> => ({ days: 30, gaps: [] }),
);

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: (options: QueryOptions) => {
    lastQueryOptions = options;
    return { ...queryState, isFetching: false, refetch: () => {} };
  },
}));
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: fetchAdminJsonMock,
  getAdminAccessToken: async () => "test-token",
}));

afterAll(() => {
  mock.module("../../../lib/admin/http", () => realAdminHttpModule);
});

const { ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY, FaqSearchGapsReport } =
  await import("./FaqSearchGapsReport");
const { searchGapRowActions } = await import("./faqSearchGapsLogic");

const noAnswerGap: SearchGap = {
  topic: "寵物證書",
  language: "zh-HK",
  confidence: "none",
  searchCount: 12,
  lastSeenDay: "2026-10-07",
};
const weakGap: SearchGap = {
  topic: "tax receipt for cheque",
  language: "en",
  confidence: "low",
  searchCount: 3,
  lastSeenDay: "2026-09-29",
};

function render(state: Partial<typeof queryState>) {
  queryState = { data: undefined, error: null, isLoading: false, isError: false, ...state };
  return renderAdminInChinese(<FaqSearchGapsReport onTest={() => {}} onCreate={() => {}} />);
}

// Visible text only, so assertions do not depend on the element structure.
function textOf(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

describe("FaqSearchGapsReport", () => {
  test("always shows the heading", () => {
    for (const state of [
      { isLoading: true },
      { isError: true, error: new Error("boom") },
      { data: { days: 30, gaps: [] } },
    ]) {
      expect(textOf(render(state))).toContain("搜尋未有答案的主題（過去 30 日）");
    }
  });

  test("shows the loading state", () => {
    const text = textOf(render({ isLoading: true }));

    expect(text).toContain("載入中…");
    expect(text).not.toContain("過去 30 日未有訪客搜尋找不到答案。");
  });

  test("shows a failure with a retry control, never the empty message", () => {
    const text = textOf(render({ isError: true, error: new Error("boom") }));

    expect(text).toContain("無法載入搜尋主題報告");
    expect(text).toContain("重試");
    expect(text).not.toContain("過去 30 日未有訪客搜尋找不到答案。");
  });

  test("shows the empty message when no search came up empty", () => {
    const markup = render({ data: { days: 30, gaps: [] } });

    expect(textOf(markup)).toContain("過去 30 日未有訪客搜尋找不到答案。");
    expect(markup).not.toContain("<table");
  });

  test("lists each topic with its result, language, count, day and the two actions", () => {
    const markup = render({ data: { days: 30, gaps: [noAnswerGap, weakGap] } });
    const rows = markup.split("<tr").slice(2); // drop the table head
    expect(rows).toHaveLength(2);

    const [first, second] = rows.map(textOf);
    expect(first).toContain("寵物證書");
    expect(first).toContain("沒有答案");
    expect(first).toContain("中文");
    expect(first).toContain("12");
    expect(first).toContain("2026年10月7日 (三)");
    expect(first).toContain("測試");
    expect(first).toContain("以此新增問題");

    expect(second).toContain("tax receipt for cheque");
    expect(second).toContain("配對較弱");
    expect(second).toContain("English");
    expect(second).toContain("3");
    expect(second).toContain("2026年9月29日 (二)");
    expect(second).toContain("測試");
    expect(second).toContain("以此新增問題");

    expect(textOf(markup)).not.toContain("過去 30 日未有訪客搜尋找不到答案。");
  });

  test("escapes a topic instead of rendering it as markup", () => {
    const markup = render({
      data: {
        days: 30,
        gaps: [{ ...noAnswerGap, topic: '<img src=x onerror="alert(1)">' }],
      },
    });

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
  });

  test("reads the report through fetchAdminJson under its own query key", async () => {
    render({ isLoading: true });

    expect(lastQueryOptions?.queryKey).toEqual(ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY);
    expect(ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY).toEqual(["admin-faq-search-gaps"]);

    const report: SearchGapReport = { days: 30, gaps: [weakGap] };
    fetchAdminJsonMock.mockResolvedValueOnce(report);
    await expect(lastQueryOptions?.queryFn()).resolves.toEqual(report);
    expect(fetchAdminJsonMock).toHaveBeenCalledWith("/api/admin/faq/search-gaps");
  });
});

describe("searchGapRowActions", () => {
  test("test passes the row's topic and language to onTest only", () => {
    const onTest = mock((_topic: string, _language: string) => {});
    const onCreate = mock((_topic: string, _language: string) => {});

    searchGapRowActions(weakGap, { onTest, onCreate }).onTest();

    expect(onTest).toHaveBeenCalledTimes(1);
    expect(onTest).toHaveBeenCalledWith("tax receipt for cheque", "en");
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("create passes the row's topic and language to onCreate only", () => {
    const onTest = mock((_topic: string, _language: string) => {});
    const onCreate = mock((_topic: string, _language: string) => {});

    searchGapRowActions(noAnswerGap, { onTest, onCreate }).onCreate();

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("寵物證書", "zh-HK");
    expect(onTest).not.toHaveBeenCalled();
  });
});
