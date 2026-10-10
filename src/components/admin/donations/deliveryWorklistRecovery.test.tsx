import { expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";
let options:
  | {
      mutationFn: (id: string) => Promise<unknown>;
      onError?: (error: Error) => unknown;
      onSettled?: () => Promise<unknown>;
    }
  | undefined;
const invalidated: string[] = [];
mock.module("@tanstack/react-query", () => ({
  // session.ts (read by the confirm dialog) builds its identity query with this.
  queryOptions: <T,>(value: T) => value,
  useQuery: () => ({ data: { jobs: [], total: 0, page: 1, pageSize: 25 }, isFetching: false }),
  useQueryClient: () => ({
    invalidateQueries: async ({ queryKey }: { queryKey: string[] }) => {
      invalidated.push(queryKey[0]!);
    },
  }),
  useMutation: (value: typeof options) => {
    options = value;
    return { isPending: false };
  },
}));
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async () => {
    throw new Error("reply lost after committed delivery");
  },
}));
const { DonationDeliveryWorklist } = await import("./DonationDeliveryWorklist");
test("unknown POST outcome refreshes both durable worklist and task overview", async () => {
  renderAdminInChinese(<DonationDeliveryWorklist />);
  try {
    await options!.mutationFn("synthetic-job");
  } catch (e) {
    await options!.onError?.(e as Error);
  } finally {
    await options!.onSettled?.();
  }
  expect(invalidated.sort()).toEqual(["admin-task-overview", "finance-delivery-worklist"]);
});
