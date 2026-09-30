import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");
const realAdminPageCopy = await import("../adminPageCopy");

// mock.module patches the shared module registry for the whole process, not
// just this file, so every consumer's language is pinned here explicitly
// rather than left to whatever AdminLanguageProvider default happens to be
// live when this file's imports run relative to any other test file's mocks.
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

let casesError: Error | null = null;
let currentRole: "staff" | "admin" = "staff";

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (String(queryKey[0]) === "admin-me") {
      return { data: { admin: { role: currentRole } }, isLoading: false, isFetching: false };
    }
    if (String(queryKey[0]) === "admin-access-users") {
      return { data: { users: [] }, isLoading: false, isFetching: false };
    }
    if (String(queryKey[0]) === "coordinator-statuses") {
      return {
        data: { statuses: [] },
        error: null,
        isLoading: false,
        isFetching: false,
        refetch: () => {},
      };
    }
    return {
      data: casesError ? undefined : { cases: [], total: 0 },
      error: casesError,
      isLoading: false,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { CaseList } = await import("./CaseList");

const render = () => renderToStaticMarkup(<CaseList />);

describe("CaseList", () => {
  test("renders the case queue", () => {
    expect(render()).toContain("領養個案");
  });

  test("only admins see bounded bulk assignment controls", () => {
    currentRole = "staff";
    expect(render()).not.toContain("批量分派領養個案負責職員");
    currentRole = "admin";
    expect(render()).toContain("批量分派領養個案負責職員");
    expect(render()).toContain("選取全部符合條件（最多 1000 筆）");
    currentRole = "staff";
  });

  test("shows a retry instead of a raw English message and a false empty state on failure", () => {
    // Previously: a raw `{error.message}` alert (English "API request failed"
    // unless the API supplies its own text) rendered directly above a
    // DataTable that unconditionally showed empty={copy.empty} underneath it.
    casesError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("API request failed");
    casesError = null;
  });

  test("blocks paging forward through the shared TablePager when the query fails", () => {
    casesError = new Error("boom");
    const markup = render();
    expect(markup).toContain("下一頁");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
    casesError = null;
  });
});
