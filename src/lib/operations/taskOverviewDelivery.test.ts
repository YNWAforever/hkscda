import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { createSupabaseTaskRepository } from "./taskOverview.server";

test("failed delivery task count includes retryable and attention-required jobs", async () => {
  const calls: unknown[][] = [];
  const query = {
    select() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    eq(...args: unknown[]) {
      calls.push(["eq", ...args]);
      return this;
    },
    or(...args: unknown[]) {
      calls.push(["or", ...args]);
      return this;
    },
    then(resolve: (value: unknown) => void) {
      resolve({ data: [], count: 2, error: null });
    },
  };
  const client = { from: () => query } as unknown as SupabaseClient;
  expect((await createSupabaseTaskRepository(client).count("delivery_attention")).count).toBe(2);
  expect(calls).toContainEqual(["or", "status.eq.retryable,status.eq.attention_required"]);
});
