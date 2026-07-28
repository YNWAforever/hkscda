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
  handlerName: "changeCaseStatus" | "createMatch" | "createFollowup" | "finalizeAdoption",
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

  test("validates a status-change case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("changeCaseStatus");
  });

  test("validates a match case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("createMatch");
  });

  test("validates a follow-up case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("createFollowup");
  });

  test("validates a finalization case ID before authorization", async () => {
    await expectInvalidIdBeforeAuthorization("finalizeAdoption");
  });
});
