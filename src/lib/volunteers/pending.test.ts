import { expect, test } from "bun:test";
import { readPendingSnapshot, pendingQuerySchema } from "./pending";
test("pending read uses one server snapshot and preserves overdue totals", async () => {
  const calls: unknown[] = [];
  const snapshot = await readPendingSnapshot(
    async (args) => {
      calls.push(args);
      return {
        counts: { upcoming: 1, overdue: 2, total: 3, asOf: "2026-10-13T00:00:00.000Z" },
        registrations: [
          {
            id: "90000000-0000-4000-8000-000000000001",
            contact_name: "AUDIT",
            activity_id: "90000000-0000-4000-8000-000000000002",
            title: "AUDIT",
            starts_at: "2026-10-12T00:00:00Z",
          },
        ],
        page: 1,
        pageSize: 25,
      };
    },
    "90000000-0000-4000-8000-000000000003",
    { scope: "all", page: 1, pageSize: 25 },
    () => new Date("2026-10-13T00:00:00Z"),
  );
  expect(snapshot.counts.total).toBe(3);
  expect(calls).toEqual([
    {
      p_actor: "90000000-0000-4000-8000-000000000003",
      p_scope: "all",
      p_page: 1,
      p_page_size: 25,
      p_as_of: "2026-10-13T00:00:00.000Z",
    },
  ]);
});
test("invalid pending requests and failed reads never become zero or empty", async () => {
  expect(pendingQuerySchema.safeParse({ scope: "future", page: 0 }).success).toBe(false);
  await expect(
    readPendingSnapshot(
      async () => {
        throw new Error("read failed");
      },
      "90000000-0000-4000-8000-000000000003",
      {},
      () => new Date(),
    ),
  ).rejects.toThrow("read failed");
});
