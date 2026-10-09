import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { expectNoChineseText, findChineseRuns } from "../../components/admin/i18n/testing";
import type { VolunteerServerErrorCode } from "./serverErrors";

/**
 * The volunteer API messages that reach the English admin. This drives the real handlers, the way the
 * browser reads them (through `fetchAdminJson`), and checks that every message that arrives as Chinese
 * has an English text that says what to do, and that every Chinese string the volunteer server code
 * holds is either one of those, one that never arrives, or not an admin message at all.
 */
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "session-token", user: { id: "auth-1" } } },
      }),
    },
  },
}));

/** What the handlers that create their own database client are given. */
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
mock.module("../donations/supabase.server", () => ({
  createSupabaseServiceClient: () => ({ rpc: async () => rpcResult }),
  requireAdmin: async () => ({ authUserId: "admin-1" }),
}));

const { AdminApiError, fetchAdminJson } = await import("../admin/session");
const { volunteerAdminErrorMessage } = await import("./adminErrors");
const { volunteerErrorMessage, volunteerCodeMessage } = await import("./apiResult");
const { VOLUNTEER_SERVER_ERROR_CODES, volunteerServerErrorCode, volunteerServerErrorText } =
  await import("./serverErrors");
const { createOverviewHandler } = await import("./overview");
const { readVolunteerCalendar } = await import("./policy/calendar.server");
const { handleVolunteerTask } = await import("./jobs/tasks.server");
const { handleQualificationCommand } = await import("./policy/qualifications.server");
const { createDirectoryHandler } = await import("./directory/http.server");
const { createBulkHandlers } = await import("./bulk/http.server");
const { createOperationHandlers } = await import("./policy/operations.http.server");
const { createVolunteerHandlers } = await import("./http.server");
const { createSupabaseVolunteerRepository } = await import("./repository.server");
const { volunteerPolicyFailure } = await import("./policy/errors");
const { createPolicyHandlers } = await import("./policy/http.server");
const { createDailyPolicyHandlers } = await import("./policy/dailyHttp.server");
const { createSimulationHandlers } = await import("./policy/simulation.http.server");
const { createAssessmentHandlers } = await import("./assessment/http.server");
const { createHandlers: createSourceHandlers } =
  await import("../../routes/api/admin/volunteers/sources/-handlers");
const { initialPolicyCatalogue } = await import("./policy/catalogue");

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  rpcResult = { data: null, error: null };
});
// The handlers log the failures they hide from the browser; the log is not what is tested here.
const quiet = [
  spyOn(console, "error").mockImplementation(() => {}),
  spyOn(console, "info").mockImplementation(() => {}),
];
afterAll(() => quiet.forEach((spy) => spy.mockRestore()));
beforeAll(() => {
  quiet.forEach((spy) => spy.mockClear());
});

/** The error the admin screen gets when the handler answers with `respond()`. */
async function reach(respond: () => Response | Promise<Response>): Promise<unknown> {
  globalThis.fetch = (async () => respond()) as unknown as typeof fetch;
  return fetchAdminJson("/api/admin/volunteers/anything", {
    method: "POST",
    body: "{}",
  }).catch((error: unknown) => error);
}
const get = (path: string) => new Request("http://localhost" + path);
const post = (path: string, body: unknown) =>
  new Request("http://localhost" + path, { method: "POST", body: JSON.stringify(body) });

/** Checks one message end to end: the browser gets Chinese, the English admin gets English. */
function expectReaches(error: unknown, code: VolunteerServerErrorCode | null, status: number) {
  expect(error).toBeInstanceOf(AdminApiError);
  const failure = error as InstanceType<typeof AdminApiError>;
  expect(failure.status).toBe(status);
  const english = volunteerAdminErrorMessage(failure, "en") ?? "";
  expectNoChineseText(english);
  expect(english.length).toBeGreaterThan(20);
  if (code) {
    expect(failure.message).toBe(volunteerServerErrorText(code));
    expect(volunteerServerErrorCode(failure.message)).toBe(code);
    expect(english).toBe(volunteerServerErrorText(code, "en"));
  }
  // The Chinese admin still gets exactly the text it always did.
  expect(volunteerAdminErrorMessage(failure, "zh")).toBe(failure.message);
  return failure;
}

describe("the table of volunteer server messages", () => {
  test("has a distinct zh-HK text and an English text that gives a next step for each code", () => {
    const zh = VOLUNTEER_SERVER_ERROR_CODES.map((code) => volunteerServerErrorText(code));
    expect(new Set(zh).size).toBe(zh.length);
    for (const code of VOLUNTEER_SERVER_ERROR_CODES) {
      const english = volunteerServerErrorText(code, "en");
      expectNoChineseText(english);
      expect(findChineseRuns(volunteerServerErrorText(code)).length, code).toBeGreaterThan(0);
      expect(english.endsWith("."), code).toBe(true);
      // Every English message says what to do: it has a second sentence or an instruction.
      expect(
        /(Try|Check|Choose|Preview|Reload|Refresh|Ask|Verify|Set|Start|Go|Enter|Use|Select|Narrow|Copy|Publish|Contact|Change|Create)/.test(
          english,
        ),
        `${code}: ${english}`,
      ).toBe(true);
    }
    expect(VOLUNTEER_SERVER_ERROR_CODES.length).toBe(40);
  });
});

describe("the overview, the calendar, the tasks and the directory", () => {
  test("a bad location and a failed read reach the admin as coded messages", async () => {
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async () => {
        throw new Error("database is down");
      },
    });
    expectReaches(
      await reach(() => handler(get("/api/admin/volunteers/overview?centre=BAD"))),
      "overview_invalid_centre",
      400,
    );
    expectReaches(
      await reach(() => handler(get("/api/admin/volunteers/overview"))),
      "overview_load_failed",
      500,
    );
  });

  test("a range that is too long and a failed read of the calendar", async () => {
    const tooLong = get(
      "/api/admin/volunteers/calendar?from=2026-01-01T00:00:00%2B08:00&until=2026-12-01T00:00:00%2B08:00",
    );
    expectReaches(
      await reach(() => readVolunteerCalendar(tooLong)),
      "calendar_range_too_long",
      400,
    );
    rpcResult = { data: null, error: { code: "XX000", message: "down" } };
    const valid = get(
      "/api/admin/volunteers/calendar?from=2026-10-01T00:00:00%2B08:00&until=2026-10-02T00:00:00%2B08:00",
    );
    expectReaches(await reach(() => readVolunteerCalendar(valid)), "calendar_load_failed", 500);
  });

  test("an invalid follow-up and a failed update of one", async () => {
    expectReaches(
      await reach(() =>
        handleVolunteerTask(post("/api/admin/volunteers/tasks", { action: "nope" })),
      ),
      "tasks_invalid",
      400,
    );
    rpcResult = { data: null, error: { code: "XX000", message: "down" } };
    expectReaches(
      await reach(() =>
        handleVolunteerTask(post("/api/admin/volunteers/tasks", { action: "list" })),
      ),
      "tasks_update_failed",
      500,
    );
  });

  test("a profile that does not exist, a bad search, no permission and a failed read", async () => {
    const make = (read: () => Promise<unknown>) =>
      createDirectoryHandler({ authorize: async () => "actor", read: read as never });
    const people = "/api/admin/volunteers/people";
    expectReaches(
      await reach(() => make(async () => null)(get(people + "?profile_id=" + crypto.randomUUID()))),
      "directory_not_found",
      404,
    );
    expectReaches(
      await reach(() => make(async () => null)(get(people + "?page=abc"))),
      "directory_invalid_search",
      400,
    );
    expectReaches(
      await reach(() =>
        make(async () => {
          throw Object.assign(new Error("denied"), { code: "42501" });
        })(get(people)),
      ),
      "directory_forbidden",
      403,
    );
    expectReaches(
      await reach(() =>
        make(async () => {
          throw new Error("down");
        })(get(people)),
      ),
      "directory_load_failed",
      500,
    );
  });
});

describe("the activity workspace's bulk commands", () => {
  const bulk = (execute: () => Promise<unknown>) =>
    createBulkHandlers({
      requireActor: async () => ({ authUserId: "a" }),
      execute: execute as never,
    });
  const run = (handlers: ReturnType<typeof bulk>, body: unknown) =>
    handlers.POST(post("/api/admin/volunteers/bulk", body));

  test("an unreadable request, bad fields, a rule the database refused and a failure", async () => {
    const ok = bulk(async () => ({}));
    expectReaches(
      await reach(() =>
        ok.POST(
          new Request("http://localhost/api/admin/volunteers/bulk", {
            method: "POST",
            body: "not json",
          }),
        ),
      ),
      "invalid_request_body",
      400,
    );
    expectReaches(await reach(() => run(ok, { action: "nope" })), "bulk_invalid_fields", 400);
    const refused = bulk(async () => {
      throw Object.assign(new Error("invalid"), { code: "22023" });
    });
    expectReaches(
      await reach(() => run(refused, { action: "templates" })),
      "bulk_invalid_input",
      422,
    );
    const failing = bulk(async () => {
      throw new Error("down");
    });
    expectReaches(await reach(() => run(failing, { action: "templates" })), "bulk_failed", 500);
  });

  test("no permission arrives as the shared message that is already in apiResult, not as the server's text", async () => {
    const forbidden = bulk(async () => {
      throw Object.assign(new Error("denied"), { code: "42501" });
    });
    const failure = expectReaches(
      await reach(() => run(forbidden, { action: "templates" })),
      null,
      403,
    );
    expect(failure.message).toBe(volunteerErrorMessage({ code: "forbidden" }, 403));
    expect(volunteerAdminErrorMessage(failure, "en")).toBe(volunteerCodeMessage("forbidden", "en"));
  });

  test("a result that is not applied arrives as the apiResult message for its reason", async () => {
    const stale = bulk(async () => ({ kind: "conflict", reason: "stale_preview" }));
    const failure = expectReaches(
      await reach(() => run(stale, { action: "templates" })),
      null,
      409,
    );
    expect(failure.message).toBe(volunteerErrorMessage({ reason: "stale_preview" }, 409));
    expect(volunteerAdminErrorMessage(failure, "en")).toBe(
      "The data changed after the preview. Preview again and confirm the impact.",
    );
  });
});

describe("the group and rescheduling commands", () => {
  const reasons = [
    "group_window_closed",
    "group_policy_conflict",
    "paired_policy_not_published",
    "late_group_review_required",
    "volunteer_terms_consent_required",
    "overlapping_duty",
    "capacity_full",
    "registration_not_reschedulable",
    "duplicate_group_request",
    "group_headcount_out_of_range",
  ];
  const operations = (execute: () => Promise<unknown>) =>
    createOperationHandlers({ authenticate: async () => "actor", execute: execute as never });
  const send = (handlers: ReturnType<typeof operations>, body: unknown) =>
    handlers.POST(post("/api/admin/volunteers/operations", body));
  const listCommand = { action: "list" };

  test("every reason the server writes arrives as a message apiResult already has in English", async () => {
    for (const reason of reasons) {
      const handlers = operations(async () => ({ kind: "denied", reason }));
      const failure = expectReaches(await reach(() => send(handlers, listCommand)), null, 422);
      // The server's own text for the reason is replaced by the message for the kind of result.
      const inTable = volunteerCodeMessage(reason) ?? volunteerCodeMessage("denied");
      expect(failure.message, reason).toBe(inTable ?? "");
    }
    const conflict = operations(async () => ({ kind: "conflict" }));
    const failure = expectReaches(await reach(() => send(conflict, listCommand)), null, 409);
    expect(failure.message).toBe(volunteerErrorMessage({ kind: "conflict" }, 409));
  });

  test("a bad request, no permission and a failure also arrive as apiResult messages", async () => {
    const handlers = operations(async () => ({ kind: "listed" }));
    for (const body of [{ action: "nope" }]) {
      const failure = expectReaches(await reach(() => send(handlers, body)), null, 400);
      expect(failure.message).toBe(volunteerErrorMessage({ code: "invalid" }, 400));
    }
    const forbidden = operations(async () => {
      throw Object.assign(new Error("denied"), { code: "42501" });
    });
    const refused = expectReaches(await reach(() => send(forbidden, listCommand)), null, 403);
    expect(refused.message).toBe(volunteerErrorMessage({ code: "invalid" }, 403));
    const failing = operations(async () => {
      throw new Error("down");
    });
    const down = expectReaches(await reach(() => send(failing, listCommand)), null, 500);
    expect(down.message).toBe(volunteerErrorMessage({ code: "unavailable" }, 500));
  });
});

describe("registrations and activities", () => {
  const id = crypto.randomUUID();
  const client = (result: { data: unknown; error: unknown }) =>
    ({ rpc: async () => result }) as unknown as SupabaseClient;
  /** The handler the screens call, with the real repository answering from the faked database. */
  function handlers(result: { data: unknown; error: unknown }) {
    const repository = createSupabaseVolunteerRepository(client(result));
    return createVolunteerHandlers({
      requireVolunteerAdmin: async () => ({ authUserId: "admin-1" }) as never,
      service: {
        updateRegistrationStatus: ({ registrationId }: { registrationId: string }) =>
          repository.updateRegistrationStatus({
            registrationId,
            actorUserId: "admin-1",
            expectedUpdatedAt: "2026-09-05T00:00:00Z",
            status: "approved",
          }),
        updateAttendance: ({ registrationId }: { registrationId: string }) =>
          repository.updateAttendance({
            registrationId,
            actorUserId: "admin-1",
            expectedUpdatedAt: "2026-09-05T00:00:00Z",
            attendanceStatus: "completed",
            command: "record",
          }),
        cloneActivity: async () => 1,
      } as never,
    });
  }
  const status = (result: { data: unknown; error: unknown }) =>
    handlers(result).updateRegistrationStatus({
      request: new Request("http://localhost/x", { method: "PATCH", body: "{}" }),
      params: { id },
    });

  test("a change that was refused arrives with its code and a coded message", async () => {
    const cases: Array<[string, VolunteerServerErrorCode, number]> = [
      ["capacity_full", "update_capacity_full", 409],
      ["future_attendance", "update_future_attendance", 409],
      ["attendance_correction_required", "update_attendance_correction_required", 409],
      ["invalid_attendance_status", "update_invalid_attendance_status", 409],
      ["conflict", "update_changed", 409],
      ["not_found", "update_changed", 404],
    ];
    for (const [kind, code, httpStatus] of cases) {
      const failure = expectReaches(
        await reach(() => status({ data: { kind }, error: null })),
        code,
        httpStatus,
      );
      expect(failure.code, kind).toBe(kind);
    }
  });

  test("a booking rule the database refused arrives as the apiResult message or as a coded one", async () => {
    const policyCodes = [
      "current_terms_required",
      "current_policy_required",
      "verified_profile_required",
      "terms_required",
      "credentials_required",
      "minimum_age_not_met",
      "tier_not_allowed",
      "role_not_allowed",
      "overlapping_duty",
      "duplicate_booking",
      "group_scenario_mismatch",
      "activity_closed",
      "date_closed",
      "not_open",
      "registration_closed",
      "capacity_full",
      "role_full",
      "reserved_for_core_role",
      "tier_quota_full",
      "daily_quota_full",
      "tier_weekday_not_allowed",
      "daily_policy_not_bound",
      "attendance_correction_required",
      "attendance_activity_time_immutable",
      "immutable_policy_booking_shape",
      "policy_change_requires_versioned_preview",
      "policy_identity_requires_review",
    ];
    for (const rule of policyCodes) {
      const result = { data: null, error: { message: "volunteer_policy_denied:" + rule } };
      expect(volunteerPolicyFailure(result.error), rule).not.toBeNull();
      const failure = expectReaches(await reach(() => status(result)), null, 409);
      const inTable = volunteerCodeMessage(rule);
      if (inTable) {
        // The server's text for this rule is replaced by the shared message for its code.
        expect(failure.message, rule).toBe(inTable);
      } else {
        expect(volunteerServerErrorCode(failure.message), rule).toBe(
          ("policy_" + rule) as VolunteerServerErrorCode,
        );
      }
    }
  });

  test("an unknown database failure arrives as an English message, never as the database's text", async () => {
    const failure = expectReaches(
      await reach(() =>
        status({ data: null, error: { message: "relation volunteer_x does not exist" } }),
      ),
      null,
      500,
    );
    // The server's English text is replaced by the shared message for a failure, in both languages.
    expect(failure.message).toBe(volunteerErrorMessage({}, 500));
    expect(volunteerAdminErrorMessage(failure, "en")).toBe(
      volunteerCodeMessage("unavailable", "en"),
    );
  });

  test("a server message that is already English arrives as the message for its HTTP status, in both languages", async () => {
    const empty = { data: null, error: null };
    const badId = expectReaches(
      await reach(() =>
        handlers(empty).getRegistration({
          request: new Request("http://localhost/x"),
          params: { id: "not-a-uuid" },
        }),
      ),
      null,
      400,
    );
    const tooBig = expectReaches(
      await reach(() =>
        handlers(empty).updateRegistrationStatus({
          request: new Request("http://localhost/x", {
            method: "PATCH",
            body: "x".repeat(1024 * 1024 + 16),
          }),
          params: { id },
        }),
      ),
      null,
      413,
    );
    for (const [failure, sent] of [
      [badId, "Invalid volunteer id"],
      [tooBig, "Request body too large"],
    ] as const) {
      // The browser gets the zh-HK message for the status, so the server's English is not what shows.
      expect(failure.message).toBe(volunteerErrorMessage({}, failure.status));
      expect(failure.message).not.toContain(sent);
      expect(volunteerAdminErrorMessage(failure, "en")).toBe(
        volunteerErrorMessage({}, failure.status, "en"),
      );
      expect(volunteerAdminErrorMessage(failure, "en")).not.toContain(sent);
    }
  });

  test("the retired copy command arrives as the apiResult message", async () => {
    const failure = expectReaches(
      await reach(() =>
        handlers({ data: null, error: null }).cloneActivity({
          request: new Request("http://localhost/x", { method: "POST", body: "{}" }),
          params: { id },
        }),
      ),
      null,
      410,
    );
    expect(failure.message).toBe(
      volunteerErrorMessage({ code: "target_date_preview_required" }, 410),
    );
  });
});

describe("qualifications", () => {
  test("a bad command, no permission and a failure arrive as coded messages", async () => {
    expectReaches(
      await reach(() =>
        handleQualificationCommand(
          post("/api/admin/volunteers/qualifications", { action: "nope" }),
        ),
      ),
      "qualifications_invalid",
      400,
    );
    rpcResult = { data: null, error: { code: "42501", message: "denied" } };
    expectReaches(
      await reach(() =>
        handleQualificationCommand(
          post("/api/admin/volunteers/qualifications", { action: "list" }),
        ),
      ),
      "qualifications_forbidden",
      403,
    );
    rpcResult = { data: null, error: { code: "XX000", message: "down" } };
    expectReaches(
      await reach(() =>
        handleQualificationCommand(
          post("/api/admin/volunteers/qualifications", { action: "list" }),
        ),
      ),
      "qualifications_failed",
      500,
    );
  });
});

describe("the policy settings, the daily quota, the sources, the simulation and the assessments", () => {
  const actor = async () => ({ authUserId: "admin-1" });
  const url = (path: string) => "http://localhost" + path;
  const unreadable = (path: string) => new Request(url(path), { method: "POST", body: "not json" });

  /** The body the handler wrote, and the error the admin screen got from it. */
  async function both(make: () => Promise<Response>) {
    const written = await make();
    return {
      body: (await written.json()) as Record<string, unknown>,
      failure: expectReaches(await reach(make), null, written.status),
    };
  }

  describe("the settings and the daily quota (normalised, so a shared message replaces the server's text)", () => {
    const cases = [
      {
        name: "settings",
        path: "/api/admin/volunteers/settings",
        make: (execute: () => Promise<Record<string, unknown>>) =>
          createPolicyHandlers({ requireActor: actor, execute: execute as never }),
        texts: {
          fields: "請檢查設定欄位",
          refused: "設定無效，請重新檢查及預覽",
          failed: "未能處理義工設定，請稍後重試",
        },
      },
      {
        name: "daily quota",
        path: "/api/admin/volunteers/daily-settings",
        make: (execute: () => Promise<Record<string, unknown>>) =>
          createDailyPolicyHandlers({ requireActor: actor, execute: execute as never }),
        texts: {
          fields: "請檢查全日配額設定",
          refused: "請重新檢查及預覽全日設定",
          failed: "未能處理全日配額，請稍後重試",
        },
      },
    ];

    for (const { name, path, make, texts } of cases) {
      test(`${name}: every refusal arrives as the shared invalid or unavailable message`, async () => {
        const ok = make(async () => ({}));
        const invalid = volunteerCodeMessage("invalid") ?? "";
        const unavailable = volunteerCodeMessage("unavailable") ?? "";

        const unreadableBody = await both(() => ok.POST(unreadable(path)));
        expect(unreadableBody.body.error).toBe("無效的要求內容");
        expect(unreadableBody.failure.message).toBe(invalid);

        const badFields = await both(() => ok.POST(post(path, { action: "nope" })));
        expect(badFields.body.error).toBe(texts.fields);
        expect(Array.isArray(badFields.body.issues)).toBe(true);
        expect(badFields.failure.message).toBe(invalid);
        // The issues are not part of the error the screen gets.
        expect(Object.keys(badFields.failure)).not.toContain("issues");

        const denied = make(async () => {
          throw Object.assign(new Error("denied"), { code: "42501" });
        });
        const noPermission = await both(() => denied.POST(post(path, { action: "list" })));
        expect(noPermission.body.error).toBe("沒有此操作權限");
        expect(noPermission.failure.message).toBe(invalid);

        const refused = make(async () => {
          throw Object.assign(new Error("invalid"), { code: "22023" });
        });
        const refusedCommand = await both(() => refused.POST(post(path, { action: "list" })));
        expect(refusedCommand.body.error).toBe(texts.refused);
        expect(refusedCommand.failure.status).toBe(422);
        expect(refusedCommand.failure.message).toBe(invalid);

        const broken = make(async () => {
          throw new Error("down");
        });
        const failed = await both(() => broken.POST(post(path, { action: "list" })));
        expect(failed.body.error).toBe(texts.failed);
        expect(failed.failure.status).toBe(500);
        expect(failed.failure.message).toBe(unavailable);
      });
    }

    test("a draft that breaks a rule is refused with the zh-HK rule text, which the screen never gets", async () => {
      const draft = structuredClone(initialPolicyCatalogue[0]);
      draft.eligibility.allowed_tiers = ["regular", "regular"];
      const handlers = createPolicyHandlers({
        requireActor: actor,
        execute: (async () => ({})) as never,
      });
      const path = "/api/admin/volunteers/settings";
      const save = await both(() =>
        handlers.POST(
          post(path, {
            action: "save",
            template_key: draft.template_key,
            expected_revision: 0,
            body: draft,
          }),
        ),
      );
      const issues = save.body.issues as { message: string }[];
      expect(issues.map((issue) => issue.message)).toContain("級別不可重複");
      expect(save.failure.message).toBe(volunteerCodeMessage("invalid") ?? "");
    });

    test("a command for another template is refused with the zh-HK text for a mismatch", async () => {
      const draft = structuredClone(initialPolicyCatalogue[0]);
      const handlers = createPolicyHandlers({
        requireActor: actor,
        execute: (async () => ({})) as never,
      });
      const path = "/api/admin/volunteers/settings";
      const save = await both(() =>
        handlers.POST(
          post(path, {
            action: "save",
            template_key: "another-template",
            expected_revision: 0,
            body: draft,
          }),
        ),
      );
      const issues = save.body.issues as { message: string }[];
      expect(issues.map((issue) => issue.message)).toEqual(["模板識別不一致"]);
    });

    test("a result that is not applied arrives as the apiResult message for its kind", async () => {
      for (const [kind, status] of [
        ["conflict", 409],
        ["invalid", 422],
        ["not_found", 404],
      ] as const) {
        const handlers = createPolicyHandlers({
          requireActor: actor,
          execute: (async () => ({ kind })) as never,
        });
        const path = "/api/admin/volunteers/settings";
        const result = await both(() => handlers.POST(post(path, { action: "list" })));
        expect(result.failure.status).toBe(status);
        expect(result.failure.message).toBe(volunteerErrorMessage({ kind }, status));
        expect(volunteerAdminErrorMessage(result.failure, "en")).toBe(
          volunteerErrorMessage({ kind }, status, "en"),
        );
      }
    });
  });

  describe("the simulation and the sources (the text arrives, and the screens show their own message)", () => {
    const simulation = (execute: () => Promise<Record<string, unknown>>) =>
      createSimulationHandlers({ authenticate: async () => "admin-1", execute: execute as never });
    const simulationPath = "/api/admin/volunteers/simulation/";

    test("the simulation's own refusals arrive as the zh-HK text and the English admin gets the message for the status", async () => {
      const ok = simulation(async () => ({}));
      const cases: [string, () => Promise<Response>, number][] = [
        ["無效內容", () => ok.POST(unreadable(simulationPath)), 400],
        ["請核對模擬欄位", () => ok.POST(post(simulationPath, { action: "nope" })), 400],
        [
          "只限管理員",
          () =>
            simulation(async () => {
              throw Object.assign(new Error("denied"), { code: "42501" });
            }).POST(post(simulationPath, { action: "list" })),
          403,
        ],
        [
          "未能完成模擬",
          () =>
            simulation(async () => {
              throw new Error("down");
            }).POST(post(simulationPath, { action: "list" })),
          500,
        ],
      ];
      for (const [text, make, status] of cases) {
        const failure = expectReaches(await reach(make), null, status);
        expect(failure.message, text).toBe(text);
        expect(volunteerAdminErrorMessage(failure, "en")).toBe(
          volunteerErrorMessage({}, status, "en"),
        );
      }
    });

    test("a simulation that is not allowed or not found arrives as the apiResult message for its kind", async () => {
      for (const [kind, status] of [
        ["conflict", 409],
        ["denied", 422],
        ["not_found", 404],
      ] as const) {
        const handlers = simulation(async () => ({ kind }));
        const failure = expectReaches(
          await reach(() => handlers.POST(post(simulationPath, { action: "list" }))),
          null,
          status,
        );
        expect(failure.message).toBe(volunteerErrorMessage({ kind }, status));
      }
    });

    const sourcesPath = "/api/admin/volunteers/sources/";

    test("the sources' own refusals arrive as the zh-HK text and the English admin gets the message for the status", async () => {
      const handlers = createSourceHandlers();
      const refuse = (code: string) => {
        rpcResult = { data: null, error: { code, message: "refused" } };
        return handlers.POST(post(sourcesPath, { action: "list" }));
      };
      const cases: [string, () => Promise<Response>, number][] = [
        ["無效要求", () => handlers.POST(unreadable(sourcesPath)), 400],
        ["請核對設定欄位", () => handlers.POST(post(sourcesPath, { action: "nope" })), 400],
        ["設定未符合權限或有效性要求", () => refuse("42501"), 403],
        ["設定未符合權限或有效性要求", () => refuse("22023"), 422],
        ["未能儲存來源設定", () => refuse("XX000"), 500],
      ];
      for (const [text, make, status] of cases) {
        const failure = expectReaches(await reach(make), null, status);
        expect(failure.message, text).toBe(text);
        // "無效要求" is also what the assessments send, so the table already gives it an English text.
        const english =
          text === "無效要求"
            ? volunteerServerErrorText("assessments_invalid_request", "en")
            : volunteerErrorMessage({}, status, "en");
        expect(volunteerAdminErrorMessage(failure, "en")).toBe(english);
      }
    });

    test("a source that is stale or not valid arrives as the apiResult message for its kind", async () => {
      const handlers = createSourceHandlers();
      for (const [kind, status] of [
        ["conflict", 409],
        ["invalid", 422],
      ] as const) {
        rpcResult = { data: { kind, issues: ["unresolved_settings"] }, error: null };
        const failure = expectReaches(
          await reach(() => handlers.POST(post(sourcesPath, { action: "list" }))),
          null,
          status,
        );
        expect(failure.message).toBe(volunteerErrorMessage({ kind }, status));
      }
    });
  });

  describe("the monthly assessment (the messages reach the page, so each has a code)", () => {
    const assessments = (execute: () => Promise<Record<string, unknown>>) =>
      createAssessmentHandlers({ requireActor: actor, execute: execute as never });
    const path = "/api/admin/volunteers/assessments/";

    test("an unreadable request, bad settings, no permission and a failure arrive as coded messages", async () => {
      const ok = assessments(async () => ({ kind: "listed" }));
      expectReaches(
        await reach(() => ok.POST(unreadable(path))),
        "assessments_invalid_request",
        400,
      );
      expectReaches(
        await reach(() => ok.POST(post(path, { kind: "nope" }))),
        "assessments_invalid",
        400,
      );
      const denied = assessments(async () => {
        throw Object.assign(new Error("denied"), { code: "42501" });
      });
      expectReaches(
        await reach(() => denied.POST(post(path, { kind: "list" }))),
        "assessments_forbidden",
        403,
      );
      const broken = assessments(async () => {
        throw new Error("down");
      });
      expectReaches(
        await reach(() => broken.POST(post(path, { kind: "list" }))),
        "assessments_failed",
        500,
      );
    });

    test("settings that are not applied arrive as the apiResult message for their kind", async () => {
      for (const [result, status] of [
        [{ kind: "conflict" }, 409],
        [{ kind: "invalid", issues: ["notification_channel_unavailable:email"] }, 422],
        [{ kind: "not_found" }, 404],
      ] as const) {
        const handlers = assessments(async () => result);
        const failure = expectReaches(
          await reach(() => handlers.POST(post(path, { kind: "list" }))),
          null,
          status,
        );
        expect(failure.message).toBe(volunteerErrorMessage({ kind: result.kind }, status));
      }
    });

    test("the English page shows the English text of each coded message", async () => {
      const failure = await reach(() => assessments(async () => ({})).POST(unreadable(path)));
      expect(volunteerAdminErrorMessage(failure, "en")).toBe(
        "The request could not be read. Reload the page and try again.",
      );
    });
  });
});

/**
 * Every `raise` statement in some SQL, from the word to its closing semicolon, where a semicolon
 * inside a quoted string does not end it.
 */
function raiseStatements(sql: string): string[] {
  const found: string[] = [];
  const word = /\braise\b/gi;
  for (let match = word.exec(sql); match; match = word.exec(sql)) {
    let end = match.index + match[0].length;
    let quoted = false;
    for (; end < sql.length; end += 1) {
      const char = sql[end];
      if (char === "'") quoted = !quoted;
      else if (char === ";" && !quoted) break;
    }
    found.push(sql.slice(match.index, end + 1));
    word.lastIndex = end;
  }
  return found;
}

describe("every Chinese string the volunteer server code holds", () => {
  const ROOTS = [
    "src/lib/volunteers",
    "src/lib/groupEnquiries",
    "src/routes/api/admin/volunteers",
    "src/routes/api/volunteer",
  ];

  /** Why a whole file may hold Chinese that is not a message an English admin screen shows. */
  const NOT_ADMIN_MESSAGES: Record<string, string> = {
    "src/lib/volunteers/apiResult.ts": "the bilingual message table itself",
    "src/lib/volunteers/labels.ts":
      "the zh-HK status labels, which the emails and public pages read",
    "src/lib/volunteers/serverErrors.ts": "the table above",
    "src/lib/volunteers/adminVolunteerServerMessages.test.ts": "this test",
    "src/lib/volunteers/bulk/service.ts":
      "zod issue messages, which the screens never show, and the coded input errors",
    "src/lib/volunteers/directory/reviewerBulkSelection.ts": "the coded selection errors",
    "src/lib/volunteers/notifications.server.ts": "emails to volunteers",
    "src/lib/volunteers/jobs/repository.server.ts":
      "emails and an internal note that no volunteer screen shows",
    "src/lib/volunteers/policy/booking.http.server.ts": "the public booking page",
    "src/lib/volunteers/policy/booking.repository.server.ts": "the public booking page",
    "src/lib/volunteers/policy/catalogue.ts":
      "the policy template catalogue: the names, notes and places staff edit as data",
    "src/lib/volunteers/policy/messages.ts":
      "the bilingual table of the policy validation messages and unresolved reasons: the server sends the zh-HK text inside zod issues and stored reasons, and the admin screens name them in English",
    "src/routes/api/volunteer/policy.ts": "the public booking page",
    "src/routes/api/volunteer/operations.ts": "the public group and rescheduling page",
    // The messages below are in the table, or are shadowed, so they are checked by their strings.
  };

  /** The Chinese string literals of a source file, one per match. */
  function chineseLiterals(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      if (findChineseRuns(match[2]).length > 0) found.push(match[2]);
    }
    return found;
  }

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path.split("\\").join("/")] : [];
    });
  }

  /** Messages the server writes that never arrive intact, because a shared message replaces them. */
  const SHADOWED = new Set([
    // operations.http.server.ts: the result is normalised, so the kind's message replaces these.
    "已超出團體預約窗口，不能確認新的團體。",
    "團體人數或現有義工資格／名額與目標政策衝突，請調整後重新預覽。",
    "尚未發布適用日期的配對 A／B 政策。",
    "已過團體凍結時間，請明確確認已核對臨時變更。",
    "需要義工本人先同意目的場次的條款，職員不能代為同意。",
    "義工在目的時段已有重疊當值。",
    "目的場次名額已滿。",
    "此報名已有出席事實、已開始或不可改期。",
    "此團體已在該場次提出申請。",
    "團體人數超出政策範圍。",
    "資料已更新，請重新預覽。",
    "不能套用此變更，請核對現行政策與名單。",
    "請檢查團體或改期欄位",
    "沒有此操作權限",
    "此變更不符合現行政策，請重新預覽",
    "未能處理，請稍後重試",
    "請完成驗證",
    // http.server.ts: the code replaces the text.
    "請在活動工作台使用「複製至指定日期」，先選日期並預覽適用政策。",
    // policy/errors.ts: the rules apiResult also has a message for.
    "義工已有另一個已確認的重疊時段，請先處理時間衝突。",
    "請先取得義工的明確條款同意。",
    "義工身份尚未核實或已暫停，請先核實身份。",
    "本場次目前未開放報名。",
    "此日期不在目前政策的開放範圍。",
    "尚未到報名開放時間。",
    "已過報名截止時間。",
    "本場次名額已滿。",
    "此職務名額已滿。",
    "剩餘名額保留予指定核心職務。",
    "此級別的場次名額已滿。",
    "此義工已達共享每日名額限制。",
    "此報名已有出席事實，請先使用附原因的出席更正流程。",
    // policy/errors.ts: only the public registration form can raise these.
    "此報名識別已用於其他內容，請重新開始報名。",
    "此報名連結已過期，請重新開始報名。",
    "你已報名此活動；請使用原有的狀態連結或聯絡職員。",
    // repository.server.ts: replaced by the English 500 before it leaves the server.
    "操作識別已用於其他內容，請重新開啟表格",
    // http.server.ts: a prefix of the public registration form.
    "未能完成報名：",
    // policy/http.server.ts and policy/dailyHttp.server.ts: both normalise the result, so the shared
    // invalid or unavailable message replaces the text (the tests above prove it for each).
    "請檢查設定欄位",
    "設定無效，請重新檢查及預覽",
    "未能處理義工設定，請稍後重試",
    "請檢查全日配額設定",
    "請重新檢查及預覽全日設定",
    "未能處理全日配額，請稍後重試",
  ]);

  /**
   * Messages that arrive intact but that no screen shows: the screens that call these routes write
   * their own message when a call fails (the English tests of the simulation and the sources prove
   * it), so the server's text never reaches the English admin. If a screen ever shows one, it has to
   * go into the table with an English text.
   */
  const SCREEN_SHOWS_ITS_OWN_MESSAGE = new Set([
    // policy/simulation.http.server.ts: the policy simulation screen.
    "無效內容",
    "請核對模擬欄位",
    "只限管理員",
    "未能完成模擬",
    // routes/api/admin/volunteers/sources/-handlers.ts: the sources screen, the policy settings'
    // source table and the registry read of the policy settings and its advanced fields.
    "請核對設定欄位",
    "設定未符合權限或有效性要求",
    "未能儲存來源設定",
  ]);

  test("is in the table, is shadowed, or is not an admin message", () => {
    const known = new Set<string>(
      VOLUNTEER_SERVER_ERROR_CODES.map((code) => volunteerServerErrorText(code)),
    );
    const unaccounted: string[] = [];
    let scanned = 0;
    for (const root of ROOTS) {
      for (const path of walk(root)) {
        scanned++;
        if (NOT_ADMIN_MESSAGES[path]) continue;
        const literals = chineseLiterals(readFileSync(path, "utf8"));
        for (const literal of literals) {
          if (known.has(literal) || SHADOWED.has(literal)) continue;
          if (SCREEN_SHOWS_ITS_OWN_MESSAGE.has(literal)) continue;
          unaccounted.push(`${path}: ${literal}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(100);
    expect(
      unaccounted,
      "Add each of these to serverErrors.ts (with an English text), or explain it above.",
    ).toEqual([]);
  });

  test("every entry of the table is a string the server code holds", () => {
    const held = new Set<string>();
    for (const root of ROOTS) {
      for (const path of walk(root)) {
        if (NOT_ADMIN_MESSAGES[path]) continue;
        for (const literal of chineseLiterals(readFileSync(path, "utf8"))) held.add(literal);
      }
    }
    // The overview handler reads its two messages from the table.
    const fromTable = new Set(["overview_invalid_centre", "overview_load_failed"]);
    const missing = VOLUNTEER_SERVER_ERROR_CODES.filter(
      (code) => !fromTable.has(code) && !held.has(volunteerServerErrorText(code)),
    );
    expect(missing).toEqual([]);
  });

  test("no migration raises a Chinese message that a volunteer screen can reach", () => {
    // The two Chinese `raise` statements in the migrations are content review ones.
    const allowed = new Set([
      "20260914161341_admin_content_quality_review.sql",
      "20260914162305_animal_nonpublic_review_transition.sql",
    ]);
    const hits: string[] = [];
    for (const name of readdirSync("supabase/migrations")) {
      const sql = readFileSync(join("supabase/migrations", name), "utf8");
      for (const statement of raiseStatements(sql)) {
        if (findChineseRuns(statement).length > 0 && !allowed.has(name)) hits.push(name);
      }
    }
    expect(hits).toEqual([]);
  });
});
