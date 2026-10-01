import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { listDonationDeliveryWorklist } from "./deliveryWorklist.server";

test("private worklist forwards the verified actor to a bounded service-only RPC", async () => {
  const calls: unknown[][] = [];
  const client = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return {
        data: { page: 2, pageSize: 25, total: 26, jobs: [] },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const result = await listDonationDeliveryWorklist(client, "actor-id", 2);
  expect(result).toEqual({ page: 2, pageSize: 25, total: 26, jobs: [] });
  expect(calls).toEqual([
    ["list_failed_donation_delivery_jobs", { p_actor: "actor-id", p_page: 2 }],
  ]);
});
