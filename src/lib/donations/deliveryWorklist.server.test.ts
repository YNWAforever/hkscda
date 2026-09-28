import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { listDonationDeliveryWorklist } from "./deliveryWorklist.server";

test("delivery repository only reads failed jobs with stable 25-row paging and no donor fields", async () => {
  const calls: unknown[][] = [];
  const builder = {
    select(...args: unknown[]) {
      calls.push(["select", ...args]);
      return this;
    },
    in(...args: unknown[]) {
      calls.push(["in", ...args]);
      return this;
    },
    order(...args: unknown[]) {
      calls.push(["order", ...args]);
      return this;
    },
    async range(...args: unknown[]) {
      calls.push(["range", ...args]);
      return {
        data: [
          {
            id: "11111111-2222-4333-8444-555555555555",
            payment_id: "22222222-3333-4444-8555-666666666666",
            status: "retryable",
            attempts: 3,
            error_code: "provider_error",
            created_at: "2026-09-28T00:00:00Z",
            next_attempt_at: null,
            payment: { status: "succeeded" },
            donation: { status: "succeeded" },
          },
        ],
        count: 26,
        error: null,
      };
    },
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  } as unknown as SupabaseClient;
  const result = await listDonationDeliveryWorklist(client, 2);
  expect(result).toMatchObject({ page: 2, pageSize: 25, total: 26 });
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]).toMatchObject({ status: "retryable", paymentStatus: "succeeded" });
  expect(JSON.stringify(result)).not.toContain("email");
  expect(calls).toContainEqual(["from", "donation_delivery_job"]);
  expect(calls).toContainEqual(["in", "status", ["retryable", "attention_required"]]);
  expect(calls).toContainEqual(["range", 25, 49]);
  expect(calls.filter(([action]) => action === "order")).toHaveLength(2);
});
