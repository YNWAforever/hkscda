import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderAdminInChinese } from "../i18n/testing";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");

type MockLinkProps = { children: ReactNode; className?: string; to: string };

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, to }: MockLinkProps) => (
    <a data-router-link="true" href={to} className={className}>
      {children}
    </a>
  ),
}));

let adopterError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (String(queryKey[0]) === "coordinator-statuses") {
      return { data: { statuses: [] }, error: null, isLoading: false, isFetching: false };
    }
    return {
      data: adopterError ? undefined : { adopter: null },
      error: adopterError,
      isLoading: false,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { AdopterDetail } = await import("./AdopterDetail");

const render = () => renderAdminInChinese(<AdopterDetail adopterId="adopter-1" />);

describe("AdopterDetail", () => {
  test("shows a retry control on the error path instead of leaving refetch unreachable", () => {
    adopterError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("boom");
    adopterError = null;
  });

  test("still shows the not-found copy when there is genuinely no adopter and no error", () => {
    const markup = render();
    expect(markup).toContain("找不到");
  });
});
