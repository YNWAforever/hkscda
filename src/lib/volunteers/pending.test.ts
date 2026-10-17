import { expect, test } from "bun:test";
import { readPendingSnapshot, pendingQuerySchema } from "./pending";
import * as pending from "./pending";

const workRow = {
  id: "90000000-0000-4000-8000-000000000001",
  activity_id: "90000000-0000-4000-8000-000000000002",
  profile_id: null,
  contact_name: "Synthetic same name",
  title: "Synthetic session",
  starts_at: "2026-10-12T00:00:00Z",
  ends_at: "2026-10-12T02:00:00Z",
  location: "Synthetic venue",
  participant_count: 2,
  status: "pending",
  capacity: 10,
  approved_participants: 9,
  remaining_capacity: 1,
};
const workSnapshot = () => ({
  counts: { upcoming: 26, overdue: 26, total: 52, asOf: "2026-10-13T00:00:00Z" },
  registrations: [workRow],
  page: 2,
  pageSize: 25,
  filteredTotal: 26,
});

test("pending DTO preserves current session, applicant count and unreserved capacity fields", async () => {
  const snapshot = await readPendingSnapshot(
    async () => workSnapshot(),
    "90000000-0000-4000-8000-000000000003",
    {},
  );
  expect(snapshot.registrations[0]).toMatchObject({
    location: "Synthetic venue",
    participant_count: 2,
    remaining_capacity: 1,
  });
});

test("work search passes a bounded literal body query and keeps global counts separate from filteredTotal", async () => {
  let input: unknown;
  const snapshot = await pending.readPendingWorkSnapshot(
    async (args) => {
      input = args;
      return workSnapshot();
    },
    "90000000-0000-4000-8000-000000000003",
    { scope: "overdue", page: 2, q: "  50%_  " },
    () => new Date("2026-10-13T00:00:00Z"),
  );
  expect(snapshot.filteredTotal).toBe(26);
  expect(snapshot.counts.total).toBe(52);
  expect(input).toMatchObject({ p_query: "50%_", p_page: 2, p_page_size: 25 });
});

test("work snapshot rejects missing capacity instead of reporting a false zero", () => {
  const raw = workSnapshot();
  const { remaining_capacity: _removed, ...incomplete } = raw.registrations[0];
  expect(
    pending.pendingWorkSnapshotSchema.safeParse({ ...raw, registrations: [incomplete] }).success,
  ).toBe(false);
});

test("work search rejects more than 100 characters and out-of-range pages before reading", async () => {
  let reads = 0;
  for (const query of [{ q: "x".repeat(101) }, { page: 0 }, { page: 100001 }]) {
    await expect(
      pending.readPendingWorkSnapshot(
        async () => {
          reads++;
          return workSnapshot();
        },
        "90000000-0000-4000-8000-000000000003",
        query,
      ),
    ).rejects.toThrow();
  }
  expect(reads).toBe(0);
});
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
