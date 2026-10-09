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

let tasksError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (String(queryKey[0]) === "coordinator-statuses") {
      return {
        data: { statuses: [] },
        error: null,
        isError: false,
        isLoading: false,
        isFetching: false,
        refetch: () => {},
      };
    }
    return {
      data: tasksError ? undefined : { tasks: [], total: 0 },
      error: tasksError,
      isError: tasksError !== null,
      isLoading: false,
      isFetching: false,
      refetch: () => {},
    };
  },
}));

const { TaskCenter } = await import("./TaskCenter");

const render = () => renderToStaticMarkup(<TaskCenter />);

describe("TaskCenter", () => {
  test("renders the workspace", () => {
    expect(render()).toContain("協調員工作中心");
  });

  test("shows the unavailable marker instead of 0 on every summary tile when the task query fails", () => {
    // buildTaskCenterSummary seeds every bucket at 0 and iterates an empty
    // array on a rejected query, so all six tiles used to read a real 0 next
    // to the error banner -- indistinguishable from "no work outstanding".
    // The failure state now stands where the TaskPanel was, so its subtitle marker is gone and
    // the empty "no tasks" sentence cannot appear beside the error.
    tasksError = new Error("boom");
    const markup = render();
    expect((markup.match(/—/g) ?? []).length).toBe(6);
    tasksError = null;
  });

  test("blocks paging forward through the shared TablePager when the task query fails", () => {
    tasksError = new Error("boom");
    const markup = render();
    expect(markup).toContain("下一頁");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
    tasksError = null;
  });
});
