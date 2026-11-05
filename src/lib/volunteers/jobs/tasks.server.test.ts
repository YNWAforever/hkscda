import { expect, test } from "bun:test";
import * as tasks from "./tasks.server";
const actor = "90000000-0000-4000-8000-000000000003";
const snapshot = {
  counts: { upcoming: 26, overdue: 26, total: 52, asOf: "2026-10-16T00:00:00Z" },
  registrations: [],
  filteredTotal: 1,
  page: 2,
  pageSize: 25,
};
const request = (body: unknown) =>
  new Request("http://fixture.invalid/api/admin/volunteers/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("task list uses two bounded reads and suppresses the unused legacy pending projection", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const handler = tasks.createVolunteerTaskHandler({
    authorize: async () => ({ authUserId: actor, role: "staff" }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === "volunteer_task_command"
        ? { tasks: [], notifications: [], pending: [] }
        : snapshot;
    },
  });
  const response = await handler(
    request({ action: "list", scope: "upcoming", page: 2, q: "  same name " }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ filteredTotal: 1, page: 2, pending: [] });
  expect(calls).toHaveLength(2);
  expect(calls.find((c) => c.name === "volunteer_task_command")?.args.p_command).toMatchObject({
    include_pending: false,
  });
  expect(calls.find((c) => c.name === "volunteer_pending_work_snapshot")?.args).toMatchObject({
    p_query: "same name",
    p_page: 2,
    p_actor: actor,
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("task authorization and invalid search fail before any data read", async () => {
  let reads = 0;
  const rpc = async () => {
    reads++;
    return {};
  };
  const denied = tasks.createVolunteerTaskHandler({
    authorize: async () => {
      throw new Response(null, { status: 403 });
    },
    rpc,
  });
  expect((await denied(request({ action: "list" }))).status).toBe(403);
  const allowed = tasks.createVolunteerTaskHandler({
    authorize: async () => ({ authUserId: actor, role: "staff" }),
    rpc,
  });
  expect((await allowed(request({ action: "list", q: "x".repeat(101) }))).status).toBe(400);
  expect(reads).toBe(0);
});
// BUG-63: retrying a failed notification is admin-only, as on /api/admin/volunteers/jobs/{id}/retry.
test("BUG-63: staff cannot retry a notification through the tasks route; admins can", async () => {
  const notification = "90000000-0000-4000-8000-000000000009";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { kind: "retried" };
  };
  const asStaff = tasks.createVolunteerTaskHandler({
    authorize: async () => ({ authUserId: actor, role: "staff" }),
    rpc,
  });
  const refused = await asStaff(request({ action: "retry", id: notification }));
  expect(refused.status).toBe(403);
  expect(refused.headers.get("cache-control")).toBe("no-store");
  expect(calls).toHaveLength(0);

  // Staff keep the rest of the tasks route.
  const completed = await asStaff(
    request({ action: "complete", id: notification, reason: "Called" }),
  );
  expect(completed.status).toBe(200);
  expect(calls).toHaveLength(1);

  const asAdmin = tasks.createVolunteerTaskHandler({
    authorize: async () => ({ authUserId: actor, role: "admin" }),
    rpc,
  });
  const retried = await asAdmin(request({ action: "retry", id: notification }));
  expect(retried.status).toBe(200);
  expect(await retried.json()).toEqual({ kind: "retried" });
  expect(calls.at(-1)).toEqual({
    name: "volunteer_task_command",
    args: { p_actor: actor, p_command: { action: "retry", id: notification } },
  });
});
