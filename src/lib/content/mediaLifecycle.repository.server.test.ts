import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseContentMediaPorts } from "./mediaLifecycle.repository.server";
test("missing uploaded object returns404 so a failed upload can resume", async () => {
  const client = {
    storage: {
      from: () => ({ download: async () => ({ data: null, error: { statusCode: "404" } }) }),
    },
  } as unknown as SupabaseClient;
  await expect(
    createSupabaseContentMediaPorts(client).download("content-media-private", "synthetic.png"),
  ).rejects.toMatchObject({ status: 404 });
});
