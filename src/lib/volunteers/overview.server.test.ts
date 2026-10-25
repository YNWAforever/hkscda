import { expect, mock, spyOn, test } from "bun:test";
import type { VolunteerHealthRun } from "./jobs/health";
const tables: string[] = [];
const rpcs: string[] = [];
let allowed = true;
let stalledSource: string | null = null;
let failedSource: string | null = null;
let role: "admin" | "staff" = "admin";
const jobSelections: string[] = [];
const client = {
  from(table: string) {
    tables.push(table);
    if (table === "volunteer_runtime_job_run") {
      let fields = "";
      const runs: VolunteerHealthRun[] = [
        {
          status: "failed",
          bucket: "2026-10-25T02:00:00Z",
          finished_at: "2026-10-25T02:15:00Z",
          result: { error: "42501", stage: "generate", message: "synthetic-private-detail" },
        },
        { status: "failed", bucket: "2026-10-25T01:00:00Z", finished_at: "2026-10-25T01:15:00Z" },
        { status: "complete", bucket: "2026-10-25T00:00:00Z", finished_at: "2026-10-25T00:15:00Z" },
      ];
      const projected = () =>
        runs.map((row) => {
          const value = { ...row };
          if (!fields.includes("result")) delete value.result;
          return value;
        });
      const query = {
        select: (value: string) => {
          fields = value;
          jobSelections.push(value);
          return query;
        },
        eq: () => query,
        order: () => query,
        limit: () => query,
        abortSignal: () => query,
        maybeSingle: async () => ({ data: projected().at(-1), error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: projected(), error: null }).then(resolve),
      };
      return query;
    }
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      lt: () => query,
      abortSignal: (signal: AbortSignal) =>
        failedSource === table
          ? (() => {
              signal.addEventListener("abort", () => {}, { once: true });
              return Promise.resolve({ count: null, data: null, error: { code: "42501" } });
            })()
          : stalledSource === table
            ? new Promise((resolve) =>
                signal.addEventListener(
                  "abort",
                  () => resolve({ count: null, data: null, error: { code: "TIMEOUT" } }),
                  { once: true },
                ),
              )
            : Promise.resolve({ count: 7, data: null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        (stalledSource === table
          ? new Promise(() => {})
          : Promise.resolve({ count: 7, data: null, error: null })
        ).then(resolve),
    };
    return query;
  },
  rpc: (name: string, args: { p_as_of: string }) => {
    rpcs.push(name);
    const result = {
      data: {
        counts: { upcoming: 11, overdue: 0, total: 11, asOf: args.p_as_of },
        registrations: [],
        page: 1,
        pageSize: 0,
      },
      error: null,
    };
    return {
      abortSignal: (signal: AbortSignal) =>
        stalledSource === name
          ? new Promise((resolve) =>
              signal.addEventListener(
                "abort",
                () => setTimeout(() => resolve({ data: null, error: { code: "TIMEOUT" } }), 5),
                { once: true },
              ),
            )
          : Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) =>
        (stalledSource === name ? new Promise(() => {}) : Promise.resolve(result)).then(resolve),
    };
  },
};
mock.module("../donations/supabase.server", () => ({
  createSupabaseServiceClient: () => client,
  requireAdmin: async () => {
    if (!allowed) throw new Response("Forbidden", { status: 403 });
    return { authUserId: "00000000-0000-4000-8000-000000000001", role };
  },
}));
const { handleVolunteerOverview } = await import("./overview.server");
for (const [key, expectedTables, expectedRpcs] of [
  ["pendingProfiles", ["volunteer_profile"], []],
  ["pendingRegistrations", [], ["volunteer_pending_snapshot"]],
  ["todayActivities", ["volunteer_activity"], []],
] as const) {
  test(`a retry of ${key} reads only its own data source`, async () => {
    tables.length = 0;
    rpcs.length = 0;
    const response = await handleVolunteerOverview(
      new Request("https://example.invalid?stats=" + key),
    );
    expect(response.status).toBe(200);
    expect(tables).toEqual([...expectedTables]);
    expect(rpcs).toEqual([...expectedRpcs]);
    expect((await response.json()).counts[key]).toBe(key === "pendingRegistrations" ? 11 : 7);
  });
}
test("denied selected reads never reach the repository", async () => {
  tables.length = 0;
  rpcs.length = 0;
  allowed = false;
  try {
    expect(
      (await handleVolunteerOverview(new Request("https://example.invalid?stats=pendingProfiles")))
        .status,
    ).toBe(403);
    expect(tables).toEqual([]);
    expect(rpcs).toEqual([]);
  } finally {
    allowed = true;
  }
});

test("only an authorized admin reads and receives sanitized job diagnostics", async () => {
  try {
    for (const current of ["admin", "staff"] as const) {
      role = current;
      jobSelections.length = 0;
      const response = await handleVolunteerOverview(new Request("https://example.invalid"));
      const body = await response.json();
      expect(body.runtimeHealth.state).toBe("degraded");
      if (current === "admin") {
        expect(body.runtimeHealth.diagnostic).toEqual({
          code: "42501",
          stage: "generate",
          since: "2026-10-25T01:15:00Z",
        });
        expect(jobSelections.some((fields) => fields.includes("result"))).toBe(true);
      } else {
        expect(body.runtimeHealth.diagnostic).toBeUndefined();
        expect(jobSelections.some((fields) => fields.includes("result"))).toBe(false);
      }
      expect(jobSelections.some((fields) => fields.includes("lease_until"))).toBe(true);
      expect(JSON.stringify(body)).not.toContain("synthetic-private");
    }
  } finally {
    role = "admin";
  }
});

for (const source of ["volunteer_profile", "volunteer_pending_snapshot", "volunteer_activity"]) {
  test(`a stalled ${source} times out without discarding other counts`, async () => {
    stalledSource = source;
    try {
      const response = await Promise.race([
        handleVolunteerOverview(new Request("https://example.invalid"), 10),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
      ]);
      expect(response).not.toBeNull();
      const body = await response?.json();
      expect(body.counts.todayActivities).toBe(source === "volunteer_activity" ? null : 7);
      expect(body.counts.pendingProfiles).toBe(source === "volunteer_profile" ? null : 7);
      expect(body.counts.pendingRegistrations).toBe(
        source === "volunteer_pending_snapshot" ? null : 11,
      );
    } finally {
      stalledSource = null;
    }
  });
}

test("a fast provider failure retains its code when a sibling later times out", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  failedSource = "volunteer_profile";
  stalledSource = "volunteer_pending_snapshot";
  try {
    const response = await handleVolunteerOverview(new Request("https://example.invalid"), 10);
    expect((await response.json()).counts.todayActivities).toBe(7);
    const event = log.mock.calls
      .map((call) => JSON.parse(String(call[0])))
      .find((item) => item.action === "overview_pending_profiles");
    expect(event).toEqual({
      event: "volunteer_failure",
      action: "overview_pending_profiles",
      code: "42501",
    });
  } finally {
    failedSource = null;
    stalledSource = null;
    log.mockRestore();
  }
});
