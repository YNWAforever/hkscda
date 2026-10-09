import { describe, expect, test } from "bun:test";

/**
 * The volunteer policy API messages that reach the English admin: the policy settings, the daily quota,
 * the sources, the simulation and the monthly assessments. Like `adminVolunteerServerMessages.test.ts`
 * it drives the real handlers through `fetchAdminJson`, the way the browser reads them, and checks
 * which message arrives and what the English admin is shown instead.
 */
// The mocks and the helpers are in the support module, which has to load before the handlers do.
const harness = await import("./adminVolunteerServerMessages.test.support");
const { installHarnessHooks, post, setRpcResult } = harness;
installHarnessHooks();
const { expectReaches, reach } = await harness.loadHarness();

const { volunteerAdminErrorMessage } = await import("./adminErrors");
const { volunteerErrorMessage, volunteerCodeMessage } = await import("./apiResult");
const { volunteerServerErrorText } = await import("./serverErrors");
const { createPolicyHandlers } = await import("./policy/http.server");
const { createDailyPolicyHandlers } = await import("./policy/dailyHttp.server");
const { createSimulationHandlers } = await import("./policy/simulation.http.server");
const { createAssessmentHandlers } = await import("./assessment/http.server");
const { createHandlers: createSourceHandlers } =
  await import("../../routes/api/admin/volunteers/sources/-handlers");
const { initialPolicyCatalogue } = await import("./policy/catalogue");

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
        setRpcResult({ data: null, error: { code, message: "refused" } });
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
        setRpcResult({ data: { kind, issues: ["unresolved_settings"] }, error: null });
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
        "action_forbidden",
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
