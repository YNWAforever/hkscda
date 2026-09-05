import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseDeliveryJobRepository } from "./deliveryJobs.server";
function fixture(data: unknown = { id: "job-1" }, error: unknown = null) {
  const calls: unknown[][] = [];
  const query = {
    update: (input: unknown) => {
      calls.push(["update", input]);
      return query;
    },
    select: (input: unknown) => {
      calls.push(["select", input]);
      return query;
    },
    eq: (key: string, value: unknown) => {
      calls.push(["eq", key, value]);
      return query;
    },
    maybeSingle: async () => ({ data, error }),
  };
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return query;
    },
    rpc: async (name: string, args: unknown) => {
      calls.push(["rpc", name, args]);
      return { data, error };
    },
  } as unknown as SupabaseClient;
  return {
    calls,
    repo: createSupabaseDeliveryJobRepository(client, () => new Date("2026-09-05T00:00:00Z")),
  };
}
test.each(["complete", "fail"] as const)(
  "%s fences the persisted write by processing status and owner",
  async (method) => {
    const { repo, calls } = fixture();
    if (method === "complete") expect(await repo.complete("job-1", "owner-1")).toBe(true);
    else
      expect(
        await repo.fail("job-1", "owner-1", {
          code: "storage",
          retryable: true,
          retryAt: "2026-09-05T00:02:00Z",
        }),
      ).toBe(true);
    expect(calls).toContainEqual(["eq", "id", "job-1"]);
    expect(calls).toContainEqual(["eq", "status", "processing"]);
    expect(calls).toContainEqual(["eq", "lease_owner", "owner-1"]);
    expect(calls).toContainEqual([
      "update",
      expect.objectContaining({
        lease_owner: null,
        lease_until: null,
        updated_at: "2026-09-05T00:00:00.000Z",
      }),
    ]);
  },
);
test("claim uses the atomic RPC and returns a stable payment", async () => {
  const { repo, calls } = fixture([{ payment_id: "payment-1", attempts: 2 }]);
  expect(await repo.claim("job-1", "owner-1", "lease")).toEqual({
    paymentId: "payment-1",
    attempts: 2,
  });
  expect(calls).toEqual([
    [
      "rpc",
      "claim_donation_delivery_job",
      { p_job_id: "job-1", p_owner: "owner-1", p_lease_until: "lease" },
    ],
  ]);
});
test("retry carries the authenticated actor to the audit transaction", async () => {
  const { repo, calls } = fixture(true);
  expect(await repo.retry("job-1", "actor-1")).toBe(true);
  expect(calls).toEqual([
    [
      "rpc",
      "retry_donation_delivery_job_with_audit",
      { p_job_id: "job-1", p_actor_user_id: "actor-1" },
    ],
  ]);
});
test("status loads only a status projection", async () => {
  const { repo, calls } = fixture({ status: "complete" });
  expect(await repo.status("job-1")).toBe("complete");
  expect(calls).toContainEqual(["select", "status"]);
});
test("missing rows and RPC failures are not successful updates", async () => {
  const { repo } = fixture(null);
  expect(await repo.complete("missing", "owner")).toBe(false);
  expect(await repo.status("missing")).toBeNull();
  const bad = fixture(null, new Error("database unavailable")).repo;
  await expect(bad.retry("job", "actor")).rejects.toThrow("database unavailable");
  await expect(bad.complete("job", "owner")).rejects.toThrow("database unavailable");
});
