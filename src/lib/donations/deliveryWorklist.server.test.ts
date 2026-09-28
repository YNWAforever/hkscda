import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { listDonationDeliveryWorklist } from "./deliveryWorklist.server";

const job = {
  id: "11111111-2222-4333-8444-555555555555",
  paymentId: "22222222-3333-4444-8555-666666666666",
  status: "retryable",
  attempts: 3,
  errorCode: "provider_error",
  createdAt: "2026-09-28T00:00:00Z",
  nextAttemptAt: null,
  paymentStatus: "succeeded",
  donationStatus: "succeeded",
};

test("private delivery worklist validates bounded RPC data without donor fields", async () => {
  const client = {
    rpc: async () => ({
      data: { jobs: [job], total: 26, page: 2, pageSize: 25 },
      error: null,
    }),
  } as unknown as SupabaseClient;
  const result = await listDonationDeliveryWorklist(client, "actor", 2);
  expect(result).toMatchObject({ page: 2, pageSize: 25, total: 26 });
  expect(result.jobs).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("email");

  const tooMany = {
    rpc: async () => ({
      data: { jobs: Array.from({ length: 26 }, () => job), total: 26, page: 1, pageSize: 25 },
      error: null,
    }),
  } as unknown as SupabaseClient;
  await expect(listDonationDeliveryWorklist(tooMany, "actor", 1)).rejects.toThrow();
  const leaked = {
    rpc: async () => ({
      data: {
        jobs: [{ ...job, email: "private@example.invalid" }],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      error: null,
    }),
  } as unknown as SupabaseClient;
  await expect(listDonationDeliveryWorklist(leaked, "actor", 1)).rejects.toThrow();
});
