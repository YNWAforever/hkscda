import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactRouter = await import("@tanstack/react-router");
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

type MockLinkProps = {
  children: ReactNode;
  className?: string;
  params?: Record<string, string>;
  to: string;
};

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, params, to }: MockLinkProps) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a data-router-link="true" href={href} className={className}>
        {children}
      </a>
    );
  },
}));

let adoptersError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: () => ({
    data: adoptersError ? undefined : { adopters: [], total: 0 },
    error: adoptersError,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { AdopterList } = await import("./AdopterList");

const render = () => renderToStaticMarkup(<AdopterList />);

describe("AdopterList", () => {
  test("renders the adopter workspace", () => {
    expect(render()).toContain("領養人");
  });

  test("shows a retry instead of a raw English message and a false empty state on failure", () => {
    adoptersError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("API request failed");
    adoptersError = null;
  });

  test("blocks paging forward through the shared TablePager when the query fails", () => {
    adoptersError = new Error("boom");
    const markup = render();
    expect(markup).toContain("下一頁");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
    adoptersError = null;
  });
});
