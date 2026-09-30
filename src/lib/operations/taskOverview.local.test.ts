import { createClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { createSupabaseTaskRepository, selectTaskDefinitions } from "./taskOverview.server";

const localUrl = process.env.TASK_OVERVIEW_TEST_SUPABASE_URL;
const serviceKey = process.env.TASK_OVERVIEW_TEST_SERVICE_KEY;
if (localUrl && localUrl !== "http://127.0.0.1:57321") {
  throw new Error("Task overview integration test requires dedicated loopback Supabase");
}
const enabled =
  Boolean(localUrl && serviceKey) && process.env.TASK_OVERVIEW_TEST_ALLOW_LOCAL === "1";

test.skipIf(!enabled)(
  "every role-scoped task count executes against disposable PostgREST",
  async () => {
    const client = createClient(localUrl!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const repository = createSupabaseTaskRepository(client);
    const keys = new Set(
      (["staff", "treasurer", "admin"] as const).flatMap((role) =>
        selectTaskDefinitions(role).map((card) => card.key),
      ),
    );
    for (const key of keys) {
      const metric = await repository.count(key);
      expect(Number.isSafeInteger(metric.count)).toBe(true);
      expect(metric.count).toBeGreaterThanOrEqual(0);
    }
  },
);
