import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const realReactQuery = await import("@tanstack/react-query");

let entriesError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: () => ({
    data: entriesError ? undefined : [],
    error: entriesError,
    isLoading: false,
    isError: entriesError !== null,
    refetch: () => {},
  }),
}));

const { FaqManagement } = await import("./FaqManagement");

describe("FaqManagement", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    entriesError = new Error("boom");
    const markup = renderToStaticMarkup(<FaqManagement />);
    expect(markup).toContain("無法載入常見問題");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    entriesError = null;
  });
});
