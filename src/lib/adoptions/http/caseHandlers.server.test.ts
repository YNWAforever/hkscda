import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import { createCaseHandlers, type CaseService } from "./caseHandlers.server";

const staff: AdminUser = {
  id: "staff-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

const manualCaseResult = {
  caseId: "aaaaaaaa-bbbb-4333-8444-555555555555",
  supporterId: "bbbbbbbb-cccc-4333-8444-555555555555",
  adopterProfileId: "cccccccc-dddd-4333-8444-555555555555",
  taskId: "dddddddd-eeee-4333-8444-555555555555",
};

function createService(overrides: Partial<CaseService> = {}) {
  const service = {
    async listCases() {
      return undefined as never;
    },
    async listIntakeItems() {
      return undefined as never;
    },
    async listAnimalPipeline() {
      return undefined as never;
    },
    async createManualCase() {
      return manualCaseResult;
    },
    async getCaseDetail() {
      return null;
    },
    async changeCaseStatus() {
      return undefined as never;
    },
    async createMatch() {
      return undefined as never;
    },
    async createFollowup() {
      return undefined as never;
    },
    async finalizeAdoption() {
      return undefined as never;
    },
    async recordAdoptionReturn() {
      return undefined as never;
    },
    ...overrides,
  } satisfies CaseService;

  return service;
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectInvalidIdBeforeAuthorization(
  handlerName:
    | "changeCaseStatus"
    | "createMatch"
    | "createFollowup"
    | "finalizeAdoption"
    | "recordAdoptionReturn",
) {
  let authorizationCalls = 0;
  const handlers = createCaseHandlers({
    requireCoordinator: async () => {
      authorizationCalls += 1;
      return staff;
    },
    service: createService(),
  });

  const response = await handlers[handlerName]({
    request: jsonRequest(`https://example.test/api/admin/adoptions/cases/bad/${handlerName}`, {}),
    params: { id: "bad" },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid id" });
  expect(authorizationCalls).toBe(0);
}

describe("createCaseHandlers", () => {
  test("creates manual intake with coordinator actor and preserves the 201 response", async () => {
    const calls: unknown[] = [];
    const handlers = createCaseHandlers({
      requireCoordinator: async () => staff,
      service: createService({
        async createManualCase(payload) {
          calls.push(payload);
          return manualCaseResult;
        },
      }),
    });

    const response = await handlers.createManualCase({
      request: jsonRequest("https://example.test/api/admin/adoptions/cases/manual", {
        case: { animalId: "animal-row" },
      }),
    });

    expect(calls).toEqual([
      {
        actorUserId: staff.authUserId,
        input: { case: { animalId: "animal-row" } },
      },
    ]);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      case: { id: manualCaseResult.caseId },
      supporterId: manualCaseResult.supporterId,
      adopterProfileId: manualCaseResult.adopterProfileId,
      taskId: manualCaseResult.taskId,
    });
  });

  test("BUG-41: a closing initial status at manual intake is a 400", async () => {
    const handlers = createCaseHandlers({
      requireCoordinator: async () => staff,
      service: createService({
        async createManualCase() {
          throw new Error("Closing case status not allowed at intake");
        },
      }),
    });

    const response = await handlers.createManualCase({
      request: jsonRequest("https://example.test/api/admin/adoptions/cases/manual", {}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Closing case status not allowed at intake" });
  });

  test("BUG-34: a finalised case's status change is a 409 and a reopen without a reason is a 400", async () => {
    const caseId = "aaaaaaaa-bbbb-4333-8444-555555555555";
    async function statusChangeFailingWith(message: string) {
      const handlers = createCaseHandlers({
        requireCoordinator: async () => staff,
        service: createService({
          async changeCaseStatus() {
            // supabase-js hands RPC exceptions back as plain objects.
            throw { code: "P0001", message, details: "Private detail" };
          },
        }),
      });
      return handlers.changeCaseStatus({
        request: jsonRequest(`https://example.test/api/admin/adoptions/cases/${caseId}/status`, {
          statusId: "bbbbbbbb-cccc-4333-8444-555555555555",
        }),
        params: { id: caseId },
      });
    }

    const finalised = await statusChangeFailingWith("Finalized adoption case status cannot change");
    expect(finalised.status).toBe(409);
    expect(await finalised.json()).toEqual({
      error: "Finalized adoption case status cannot change",
    });

    const reopen = await statusChangeFailingWith("reason_required");
    expect(reopen.status).toBe(400);
    expect(await reopen.json()).toEqual({ error: "reason_required" });
  });

  test("validates a status-change case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("changeCaseStatus");
  });

  test("validates a match case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("createMatch");
  });

  test("validates a follow-up case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("createFollowup");
  });

  test("BUG-33: validates a successful adoption ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("recordAdoptionReturn");
  });

  test("BUG-33: records a return as the coordinator and answers 200 with the adoption", async () => {
    const adoptionId = "cccccccc-dddd-4333-8444-555555555555";
    const calls: unknown[] = [];
    const handlers = createCaseHandlers({
      requireCoordinator: async () => staff,
      service: createService({
        async recordAdoptionReturn(args) {
          calls.push(args);
          return { id: adoptionId, returnedAt: "2026-11-01T00:00:00.000Z" };
        },
      }),
    });

    const response = await handlers.recordAdoptionReturn({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/successful-adoptions/${adoptionId}/return`,
        { reason: "Returned after two weeks" },
      ),
      params: { id: adoptionId },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      adoption: { id: adoptionId, returnedAt: "2026-11-01T00:00:00.000Z" },
    });
    expect(calls).toEqual([
      {
        actorUserId: staff.authUserId,
        successfulAdoptionId: adoptionId,
        input: { reason: "Returned after two weeks" },
      },
    ]);
  });

  test("validates a finalization case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("finalizeAdoption");
  });
  test("BUG-15: finalising with a duplicate case number (23505) returns 409, not 500", async () => {
    const caseId = "aaaaaaaa-bbbb-4333-8444-555555555555";
    const handlers = createCaseHandlers({
      requireCoordinator: async () => staff,
      service: createService({
        async finalizeAdoption() {
          // PostgREST hands the RPC error back as a plain object.
          throw {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "successful_adoption_case_number_key"',
            details: "Key (case_number)=(AC-2026-001) already exists.",
            hint: null,
          };
        },
      }),
    });

    const response = await handlers.finalizeAdoption({
      request: jsonRequest(`https://example.test/api/admin/adoptions/cases/${caseId}/finalize`, {
        caseNumber: "AC-2026-001",
      }),
      params: { id: caseId },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
  });
});
