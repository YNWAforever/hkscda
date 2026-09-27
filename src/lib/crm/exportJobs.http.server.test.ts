import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUser } from "../admin/session.server";
import { createCrmExportJobHandlers } from "./exportJobs.http.server";

const actor = {
  id: "d4209833-6407-4f31-b2af-89a365704d49",
  authUserId: "0f52ce98-64e6-48c7-b48e-fca9391678f8",
  email: "synthetic@example.invalid",
  role: "treasurer",
  status: "active",
} as AdminUser;
const id = "7142238c-8dca-4cdd-85f7-0d2e4fd787ef";

test("direct download checks live role, then actor-bound job and artifact", async () => {
  const calls: string[] = [];
  let permitted = false;
  let owned = false;
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === "crm_export_job_status")
        return {
          data: owned ? { id, kind: "supporters", status: "ready", total: 2 } : null,
          error: null,
        };
      if (name === "crm_export_job_download") return { data: "id,name\n1,Synthetic", error: null };
      throw new Error("unexpected RPC");
    },
  } as unknown as SupabaseClient;
  const handlers = createCrmExportJobHandlers({
    client,
    requireTreasurer: async () => {
      if (!permitted) throw new Response("Forbidden", { status: 403 });
      return actor;
    },
  });
  const request = new Request("https://example.invalid/api/admin/exports/jobs/" + id + "/download");
  expect((await handlers.download(request, id)).status).toBe(403);
  expect(calls).toHaveLength(0);
  permitted = true;
  expect((await handlers.download(request, id)).status).toBe(404);
  expect(calls).toEqual(["crm_export_job_status"]);
  owned = true;
  const response = await handlers.download(request, id);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("id,name\n1,Synthetic");
  permitted = false;
  expect((await handlers.download(request, id)).status).toBe(403);
  expect(calls).toEqual([
    "crm_export_job_status",
    "crm_export_job_status",
    "crm_export_job_download",
  ]);
});

test("job creation validates body and role before writing", async () => {
  let writes = 0;
  const client = {
    rpc: async () => {
      writes += 1;
      return { data: { id, kind: "donations", total: 1, status: "pending" }, error: null };
    },
  } as unknown as SupabaseClient;
  const handlers = createCrmExportJobHandlers({ client, requireTreasurer: async () => actor });
  const invalid = await handlers.create(
    new Request("https://example.invalid/api/admin/exports/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "payments", filters: {} }),
    }),
  );
  expect(invalid.status).toBe(400);
  expect(writes).toBe(0);
  const accepted = await handlers.create(
    new Request("https://example.invalid/api/admin/exports/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "donations", filters: { role: "donor" } }),
    }),
  );
  expect(accepted.status).toBe(201);
  expect(writes).toBe(1);
});
