import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactQuery = await import("@tanstack/react-query");
const realAdminPageCopy = await import("../adminPageCopy");

mock.module("../adminPageCopy", () => ({
  ...realAdminPageCopy,
  useAdminPageCopy: () => ({ language: "zh", pageCopy: realAdminPageCopy.adminPageCopy.zh }),
}));

let supporterError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: () => ({
    data: supporterError ? undefined : undefined,
    error: supporterError,
    isLoading: false,
    refetch: () => {},
  }),
}));

const { SupporterDetail } = await import("./SupporterDetail");

const render = () => renderToStaticMarkup(<SupporterDetail supporterId="supporter-1" />);

describe("SupporterDetail", () => {
  test("offers a retry when the supporter record fails to load", () => {
    supporterError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入捐款人");
    expect(markup).toContain("重試");
    supporterError = null;
  });

  test("still shows the load-error copy when there is genuinely no data and no error", () => {
    const markup = render();
    expect(markup).toContain("無法載入捐款人");
  });
});
