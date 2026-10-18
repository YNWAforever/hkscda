import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBulkRepository } from "./repository.server";
import { createBulkHandlers } from "./http.server";
const id = "90000000-0000-4000-8000-000000000001";
test("scoped attendance reaches only its dedicated atomic RPC with the authenticated actor", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { kind: "not_found" }, error: null };
    },
  } as unknown as SupabaseClient;
  const response = await createBulkRepository(client).execute(id, {
    action: "attendance_apply",
    operation_id: id,
  });
  expect(response).toEqual({ kind: "not_found" });
  expect(calls).toEqual([
    {
      name: "volunteer_roster_attendance_command",
      args: { p_actor: id, p_command: { action: "attendance_apply", operation_id: id } },
    },
  ]);
});
test("roster action projection requires the DB capability marker and uses one shared asOf", async () => {
  const raw = {
    kind: "detail",
    attendance_contract: 1,
    asOf: "2026-10-16T03:00:00Z",
    activity: {
      id,
      title: "Synthetic",
      starts_at: "2026-10-16T01:00:00Z",
      ends_at: "2026-10-16T02:00:00Z",
      status: "published",
    },
    registrations: [
      {
        id,
        contact_name: "Synthetic",
        status: "approved",
        attendance_status: "not_marked",
        participant_count: 1,
        updated_at: "2026-10-16T00:00:00.123456Z",
      },
    ],
    total: 1,
    history_total: 0,
    history: [],
  };
  const client = { rpc: async () => ({ data: raw, error: null }) } as unknown as SupabaseClient;
  const result = (await createBulkRepository(client).execute(id, {
    action: "detail",
    activity_id: id,
    page: 1,
    history_page: 1,
  })) as {
    registrations: Array<{
      attendance_actions?: Array<{ command: string; attendance_status: string; allowed: boolean }>;
    }>;
  };
  expect(
    result.registrations[0].attendance_actions?.find(
      (action) => action.command === "record" && action.attendance_status === "attended",
    )?.allowed,
  ).toBe(true);
  const { attendance_contract: _marker, ...old } = raw;
  const legacy = { rpc: async () => ({ data: old, error: null }) } as unknown as SupabaseClient;
  const previous = await createBulkRepository(legacy).execute(id, {
    action: "detail",
    activity_id: id,
    page: 1,
    history_page: 1,
  });
  expect(previous).not.toHaveProperty("attendance_contract");
});
test("a malformed server roster projection is a service failure, not a caller validation error", async () => {
  const client = {
    rpc: async () => ({
      data: { attendance_contract: 1, asOf: "invalid", registrations: [] },
      error: null,
    }),
  } as unknown as SupabaseClient;
  const handlers = createBulkHandlers({
    requireActor: async () => ({ authUserId: id }),
    execute: createBulkRepository(client).execute,
  });
  const response = await handlers.POST(
    new Request("http://fixture.invalid/api/admin/volunteers/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "detail", activity_id: id, page: 1, history_page: 1 }),
    }),
  );
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
