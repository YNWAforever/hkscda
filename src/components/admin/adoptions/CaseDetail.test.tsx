import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");
const realAdminPageCopy = await import("../adminPageCopy");

type MockLinkProps = { children: ReactNode; className?: string; to: string };

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, to }: MockLinkProps) => (
    <a data-router-link="true" href={to} className={className}>
      {children}
    </a>
  ),
}));

mock.module("../adminPageCopy", () => ({
  ...realAdminPageCopy,
  useAdminPageCopy: () => ({ language: "zh", pageCopy: realAdminPageCopy.adminPageCopy.zh }),
}));

let caseError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (String(queryKey[0]) === "coordinator-statuses") {
      return { data: { statuses: [] }, error: null, isLoading: false, isFetching: false };
    }
    return {
      data: caseError ? undefined : { case: null },
      error: caseError,
      isLoading: false,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { CaseDetail } = await import("./CaseDetail");

const render = () => renderToStaticMarkup(<CaseDetail caseId="case-1" />);

describe("CaseDetail", () => {
  test("shows a retry control on the error path instead of leaving refetch unreachable", () => {
    // refetch previously lived only inside the success return, so a caseError
    // rendered a dead-end alert with the raw error.message and no way back.
    caseError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("boom");
    caseError = null;
  });

  test("still shows the not-found copy when there is genuinely no case and no error", () => {
    const markup = render();
    expect(markup).toContain("找不到");
  });
});
