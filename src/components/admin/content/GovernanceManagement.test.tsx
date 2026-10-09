import { describe, expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

const realReactQuery = await import("@tanstack/react-query");

let membersError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: () => ({
    data: membersError ? undefined : [],
    error: membersError,
    isLoading: false,
    isError: membersError !== null,
    refetch: () => {},
  }),
}));

const { GovernanceManagement } = await import("./GovernanceManagement");

describe("GovernanceManagement", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    membersError = new Error("boom");
    const markup = renderAdminInChinese(<GovernanceManagement />);
    expect(markup).toContain("無法載入團隊名單");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    membersError = null;
  });
});
