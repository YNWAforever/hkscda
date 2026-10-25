import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import { requireAdmin } from "../../admin/session.server";

const requester = "00000000-0000-4000-8000-000000000001";
const worker = "00000000-0000-4000-8000-000000000002";
const previousActor = process.env.VOLUNTEER_JOB_ACTOR_ID;
process.env.VOLUNTEER_JOB_ACTOR_ID = worker;
const now = () => new Date("2026-10-25T03:20:00Z");
let role = "admin",
  status = "active",
  result: unknown = false,
  rpcError: unknown = null;
const calls: { name: string; args: Record<string, unknown> }[] = [];
const actorLookups: string[] = [];
const client = {
  auth: {
    getUser: async () => ({
      data: { user: { id: requester, email: "synthetic@example.invalid" } },
      error: null,
    }),
    admin: {
      getUserById: async (id: string) => {
        actorLookups.push(id);
        return { data: { user: { id, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null };
      },
    },
  },
  from(table: string) {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      gt: () => query,
      lte: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({
        error: null,
        data:
          table === "admin_user"
            ? {
                id: requester,
                auth_user_id: filters.auth_user_id,
                email: "synthetic@example.invalid",
                role,
                status,
              }
            : null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "retry_volunteer_runtime_job_with_audit") return { data: result, error: rpcError };
    if (name === "finish_volunteer_runtime_job") return { data: true, error: null };
    if (name === "generate_due_volunteer_sessions" || name === "volunteer_persist_due_releases")
      return { data: 0, error: null };
    if (name === "claim_volunteer_operation_outbox") return { data: [], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  },
};
// Preserve the real shared authorization and actual job repository; replace only the client factory.
mock.module("../../donations/supabase.server", () => ({
  createSupabaseServiceClient: () => client,
  requireAdmin,
}));
const { handleHourlyRetry } = await import("./hourlyRetry.server");
afterEach(() => {
  role = "admin";
  status = "active";
  result = false;
  rpcError = null;
  calls.length = 0;
  actorLookups.length = 0;
});
function request(authorized = true) {
  return new Request("https://example.invalid/api/admin/volunteers/runtime/retry", {
    method: "POST",
    headers: authorized ? { authorization: "Bearer synthetic-only" } : {},
    body: JSON.stringify({
      bucket: "2026-10-25T03:00:00Z",
      expectedUpdatedAt: "2026-10-25T03:15:00.123456+00:00",
      confirmed: true,
      reason: "  Synthetic checked reason  ",
    }),
  });
}
for (const deniedRole of ["staff", "treasurer"]) {
  test(`real shared guard denies ${deniedRole} before any RPC`, async () => {
    role = deniedRole;
    expect((await handleHourlyRetry(request(), now)).status).toBe(403);
    expect(calls).toEqual([]);
  });
}
for (const deniedStatus of ["pending", "disabled"]) {
  test(`real shared guard denies ${deniedStatus} admin without activating it`, async () => {
    status = deniedStatus;
    expect((await handleHourlyRetry(request(), now)).status).toBe(403);
    expect(calls).toEqual([]);
  });
}
test("missing authorization never reaches a claim", async () => {
  expect((await handleHourlyRetry(request(false), now)).status).toBe(401);
  expect(calls).toEqual([]);
});
test("a conflicting atomic claim sends only the requester and exact observed revision", async () => {
  expect((await handleHourlyRetry(request(), now)).status).toBe(409);
  expect(calls).toEqual([
    {
      name: "retry_volunteer_runtime_job_with_audit",
      args: {
        p_actor: requester,
        p_bucket: "2026-10-25T03:00:00Z",
        p_expected_updated_at: "2026-10-25T03:15:00.123456+00:00",
        p_owner: expect.stringMatching(/^[0-9a-f-]{36}$/),
        p_confirmed: true,
        p_reason: "Synthetic checked reason",
      },
    },
  ]);
  expect(actorLookups).toEqual([]);
});
test("unavailable RPC cannot fall back to a cron claim or worker Auth", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  rpcError = { code: "PGRST202", message: "synthetic-private-schema-details" };
  try {
    const response = await handleHourlyRetry(request(), now);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-private");
    expect(calls.map((call) => call.name)).toEqual(["retry_volunteer_runtime_job_with_audit"]);
    expect(actorLookups).toEqual([]);
    expect(log.mock.calls).toEqual([
      [JSON.stringify({ event: "volunteer_failure", action: "hourly_retry", code: "PGRST202" })],
    ]);
  } finally {
    log.mockRestore();
  }
});
test("audited claim keeps configured actor and owner-fenced finish in the actual repository", async () => {
  result = true;
  const response = await handleHourlyRetry(request(), now);
  expect(response.status).toBe(200);
  expect((await response.json()).kind).toBe("complete");
  expect(actorLookups).toEqual([worker]);
  expect(calls.map((call) => call.name)).toEqual([
    "retry_volunteer_runtime_job_with_audit",
    "generate_due_volunteer_sessions",
    "volunteer_persist_due_releases",
    "claim_volunteer_operation_outbox",
    "finish_volunteer_runtime_job",
  ]);
  expect(calls[1].args.p_actor).toBe(worker);
  expect(calls[2].args.p_actor).toBe(worker);
  expect(calls.at(-1)?.args).toMatchObject({
    p_job_key: "volunteer-hourly",
    p_bucket: "2026-10-25T03:00:00.000Z",
    p_owner: calls[0].args.p_owner,
    p_status: "complete",
  });
});
// Restore only our synthetic actor override; no credentials are read or created.
afterAll(() => {
  if (previousActor === undefined) delete process.env.VOLUNTEER_JOB_ACTOR_ID;
  else process.env.VOLUNTEER_JOB_ACTOR_ID = previousActor;
});
