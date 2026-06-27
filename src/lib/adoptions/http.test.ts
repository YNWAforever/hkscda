import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../donations/supabase.server";
import { createAdoptionCoordinatorHandlers } from "./http.server";
import { createAdoptionCoordinatorService } from "./service";

type AdoptionCoordinatorService = ReturnType<typeof createAdoptionCoordinatorService>;

const admin: AdminUser = {
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "admin@example.com",
  role: "admin",
};

const staff: AdminUser = {
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
};

const caseId = "33333333-4444-4333-8444-555555555555";
const statusId = "44444444-5555-4333-8444-555555555555";
const animalId = "88888888-9999-4333-8444-555555555555";
const outcomeStatusId = "99999999-aaaa-4333-8444-555555555555";
const status = {
  id: statusId,
  category: "adoption_case",
  key: "new",
  labelZh: "新申請",
  labelEn: "New",
  sortOrder: 10,
  color: "coral",
  isActive: true,
  isSystem: false,
  isClosing: false,
  isFinal: false,
};

const matchId = "55555555-6666-4333-8444-555555555555";
const followupId = "66666666-7777-4333-8444-555555555555";
const adoptionId = "77777777-8888-4333-8444-555555555555";

const matchRequestBody = {
  animalId,
  statusId,
  notes: "Strong match",
};

const followupRequestBody = {
  title: "Home visit",
  statusId,
  scheduledAt: "2026-06-30T08:00:00.000Z",
  remarks: "Check adoption setup",
};

const finalizeRequestBody = {
  matchId,
  outcomeStatusId,
  caseNumber: "AC-2026-001",
  approvalDate: "2026-06-26",
  pickupDate: "2026-06-30",
  adoptionFeeCents: 80000,
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

function expectNoStoreJson(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
}

function createFakeService(overrides: Partial<AdoptionCoordinatorService> = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const service = {
    async listStatuses(category?: string) {
      calls.push({ name: "listStatuses", payload: category });
      return [status];
    },
    async getStatus(id) {
      calls.push({ name: "getStatus", payload: id });
      return status;
    },
    async createStatus(payload) {
      calls.push({ name: "createStatus", payload });
      return { id: statusId, ...payload.input };
    },
    async updateStatus(payload) {
      calls.push({ name: "updateStatus", payload });
      return { id: payload.statusId, ...payload.input };
    },
    async deleteStatus(payload) {
      calls.push({ name: "deleteStatus", payload });
    },
    async listCases(rawSearch) {
      calls.push({ name: "listCases", payload: rawSearch });
      return { cases: [], total: 0 };
    },
    async getCaseDetail(caseId) {
      calls.push({ name: "getCaseDetail", payload: caseId });
      return null;
    },
    async changeCaseStatus(payload) {
      calls.push({ name: "changeCaseStatus", payload });
    },
    async createMatch(payload) {
      calls.push({ name: "createMatch", payload });
      return { id: matchId };
    },
    async createFollowup(payload) {
      calls.push({ name: "createFollowup", payload });
      return { id: followupId };
    },
    async finalizeAdoption(payload) {
      calls.push({ name: "finalizeAdoption", payload });
      return { id: adoptionId };
    },
    ...overrides,
  } satisfies AdoptionCoordinatorService;

  return { calls, service };
}

function createHandlers({
  service,
  requireCoordinator = async () => staff,
  requireStatusAdmin = async () => admin,
}: {
  service: AdoptionCoordinatorService;
  requireCoordinator?: (request: Request) => Promise<AdminUser>;
  requireStatusAdmin?: (request: Request) => Promise<AdminUser>;
}) {
  return createAdoptionCoordinatorHandlers({
    requireCoordinator,
    requireStatusAdmin,
    service,
  });
}

describe("createAdoptionCoordinatorHandlers", () => {
  test("rejects missing auth before listing cases and does not call service", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
    });

    const response = await handlers.listCases({
      request: new Request("https://example.test/api/admin/adoptions/cases"),
    });

    expect(response.status).toBe(401);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Missing authorization token" });
    expect(calls).toEqual([]);
  });

  test("rejects forbidden auth before listing cases and does not call service", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
    });

    const response = await handlers.listCases({
      request: new Request("https://example.test/api/admin/adoptions/cases"),
    });

    expect(response.status).toBe(403);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(calls).toEqual([]);
  });

  test("passes list-case query params to the service as a plain object", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.listCases({
      request: new Request(
        "https://example.test/api/admin/adoptions/cases?page=2&pageSize=10&openOnly=true&q=ginger%20cat",
      ),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        name: "listCases",
        payload: {
          page: "2",
          pageSize: "10",
          openOnly: "true",
          q: "ginger cat",
        },
      },
    ]);
  });

  test("returns no-store JSON for statuses", async () => {
    const { service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.listStatuses({
      request: new Request("https://example.test/api/admin/adoptions/statuses?category=match"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      statuses: [status],
    });
  });

  test("status GET uses coordinator auth callback and returns no-store { status }", async () => {
    const { calls, service } = createFakeService();
    const authCalls: string[] = [];
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      requireStatusAdmin: async () => {
        authCalls.push("status-admin");
        return admin;
      },
    });

    const response = await handlers.getStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${statusId}`),
      params: { id: statusId },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(authCalls).toEqual(["coordinator"]);
    expect(calls).toEqual([{ name: "getStatus", payload: statusId }]);
    expect(await response.json()).toEqual({ status });
  });

  test("status GET missing returns 404", async () => {
    const { calls, service } = createFakeService({
      async getStatus(id) {
        calls.push({ name: "getStatus", payload: id });
        return null;
      },
    });
    const handlers = createHandlers({ service });

    const response = await handlers.getStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${statusId}`),
      params: { id: statusId },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls).toEqual([{ name: "getStatus", payload: statusId }]);
    expect(await response.json()).toEqual({ error: "Status not found" });
  });

  test("status create uses admin-only auth callback and returns 201", async () => {
    const { calls, service } = createFakeService();
    const authCalls: string[] = [];
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      requireStatusAdmin: async () => {
        authCalls.push("status-admin");
        return admin;
      },
    });

    const response = await handlers.createStatus({
      request: jsonRequest("https://example.test/api/admin/adoptions/statuses", {
        category: "match",
        key: "screening",
        labelZh: "審核中",
        labelEn: "Screening",
      }),
    });

    expect(response.status).toBe(201);
    expect(authCalls).toEqual(["status-admin"]);
    expect(calls.map((call) => call.name)).toEqual(["createStatus"]);
    expect(await response.json()).toEqual({
      status: {
        id: statusId,
        category: "match",
        key: "screening",
        labelZh: "審核中",
        labelEn: "Screening",
      },
    });
  });

  test("status update uses admin-only auth callback", async () => {
    const { calls, service } = createFakeService();
    const authCalls: string[] = [];
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      requireStatusAdmin: async () => {
        authCalls.push("status-admin");
        return admin;
      },
    });

    const response = await handlers.updateStatus({
      request: jsonRequest(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        labelEn: "Updated",
      }),
      params: { id: statusId },
    });

    expect(response.status).toBe(200);
    expect(authCalls).toEqual(["status-admin"]);
    expect(calls.map((call) => call.name)).toEqual(["updateStatus"]);
  });

  test("status update validates UUID param before auth or service work", async () => {
    const { calls, service } = createFakeService();
    let authCalled = false;
    const handlers = createHandlers({
      service,
      requireStatusAdmin: async () => {
        authCalled = true;
        return admin;
      },
    });

    const response = await handlers.updateStatus({
      request: jsonRequest("https://example.test/api/admin/adoptions/statuses/not-a-uuid", {
        labelEn: "Updated",
      }),
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authCalled).toBe(false);
    expect(calls).toEqual([]);
  });

  test("status not found domain errors return 404 JSON", async () => {
    const { service } = createFakeService({
      async updateStatus() {
        throw new Error("Status not found");
      },
    });
    const handlers = createHandlers({ service });

    const response = await handlers.updateStatus({
      request: jsonRequest(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        labelEn: "Updated",
      }),
      params: { id: statusId },
    });

    expect(response.status).toBe(404);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Status not found" });
  });

  test("protected status mutation domain errors return 409 JSON", async () => {
    const { service } = createFakeService({
      async deleteStatus() {
        throw new Error("System statuses cannot be deleted");
      },
    });
    const handlers = createHandlers({ service });

    const response = await handlers.deleteStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        method: "DELETE",
      }),
      params: { id: statusId },
    });

    expect(response.status).toBe(409);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "System statuses cannot be deleted" });
  });

  test("status delete uses admin-only auth callback", async () => {
    const { calls, service } = createFakeService();
    const authCalls: string[] = [];
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      requireStatusAdmin: async () => {
        authCalls.push("status-admin");
        return admin;
      },
    });

    const response = await handlers.deleteStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        method: "DELETE",
      }),
      params: { id: statusId },
    });

    expect(response.status).toBe(200);
    expect(authCalls).toEqual(["status-admin"]);
    expect(calls.map((call) => call.name)).toEqual(["deleteStatus"]);
  });

  test("status delete validates UUID param before auth or service work", async () => {
    const { calls, service } = createFakeService();
    let authCalled = false;
    const handlers = createHandlers({
      service,
      requireStatusAdmin: async () => {
        authCalled = true;
        return admin;
      },
    });

    const response = await handlers.deleteStatus({
      request: new Request("https://example.test/api/admin/adoptions/statuses/not-a-uuid", {
        method: "DELETE",
      }),
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authCalled).toBe(false);
    expect(calls).toEqual([]);
  });

  test("malformed JSON maps to 400 JSON and does not call service", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.createStatus({
      request: malformedJsonRequest("https://example.test/api/admin/adoptions/statuses"),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(calls).toEqual([]);
  });

  test("case detail missing returns 404 with no-store", async () => {
    const { service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.getCase({
      request: new Request(`https://example.test/api/admin/adoptions/cases/${caseId}`),
      params: { id: caseId },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Case not found" });
  });

  test("case status change calls service with actor, case, and body", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });
    const body = {
      statusId,
      note: "Ready for home visit",
    };

    const response = await handlers.changeCaseStatus({
      request: jsonRequest(`https://example.test/api/admin/adoptions/cases/${caseId}/status`, body),
      params: { id: caseId },
    });

    expect(response.status).toBe(200);
    expectNoStoreJson(response);
    expect(calls).toEqual([
      {
        name: "changeCaseStatus",
        payload: {
          actorUserId: staff.authUserId,
          caseId,
          input: body,
        },
      },
    ]);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("case status change validates UUID param before auth or service work", async () => {
    const { calls, service } = createFakeService();
    let authCalled = false;
    const handlers = createHandlers({
      service,
      requireCoordinator: async () => {
        authCalled = true;
        return staff;
      },
    });

    const response = await handlers.changeCaseStatus({
      request: jsonRequest("https://example.test/api/admin/adoptions/cases/not-a-uuid/status", {
        statusId,
      }),
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authCalled).toBe(false);
    expect(calls).toEqual([]);
  });

  test("invalid case status domain errors return 400 JSON", async () => {
    const { service } = createFakeService({
      async changeCaseStatus() {
        throw new Error("Invalid case status");
      },
    });
    const handlers = createHandlers({ service });

    const response = await handlers.changeCaseStatus({
      request: jsonRequest(`https://example.test/api/admin/adoptions/cases/${caseId}/status`, {
        statusId,
      }),
      params: { id: caseId },
    });

    expect(response.status).toBe(400);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Invalid case status" });
  });

  test("task completion validation errors return 400 JSON from followup create", async () => {
    const { service } = createFakeService({
      async createFollowup() {
        throw new Error("Completed tasks require a completed date");
      },
    });
    const handlers = createHandlers({ service });

    const response = await handlers.createFollowup({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/cases/${caseId}/followups`,
        followupRequestBody,
      ),
      params: { id: caseId },
    });

    expect(response.status).toBe(400);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual({ error: "Completed tasks require a completed date" });
  });

  test("repository not-found domain errors return 404 JSON", async () => {
    const notFoundCases = [
      {
        message: "Adoption case not found",
        run: async () => {
          const { service } = createFakeService({
            async changeCaseStatus() {
              throw new Error("Adoption case not found");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.changeCaseStatus({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/status`,
              {
                statusId,
              },
            ),
            params: { id: caseId },
          });
        },
      },
      {
        message: "Match not found for adoption case",
        run: async () => {
          const { service } = createFakeService({
            async finalizeAdoption() {
              throw new Error("Match not found for adoption case");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.finalizeAdoption({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/finalize`,
              finalizeRequestBody,
            ),
            params: { id: caseId },
          });
        },
      },
    ];

    for (const scenario of notFoundCases) {
      const response = await scenario.run();

      expect(response.status).toBe(404);
      expectNoStoreJson(response);
      expect(await response.json()).toEqual({ error: scenario.message });
    }
  });

  test("repository conflict domain errors return 409 JSON", async () => {
    const conflictCases = [
      {
        message: "Match must be approved before finalization",
        run: async () => {
          const { service } = createFakeService({
            async finalizeAdoption() {
              throw new Error("Match must be approved before finalization");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.finalizeAdoption({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/finalize`,
              finalizeRequestBody,
            ),
            params: { id: caseId },
          });
        },
      },
      {
        message: "Adoption case is missing adopter profile",
        run: async () => {
          const { service } = createFakeService({
            async createMatch() {
              throw new Error("Adoption case is missing adopter profile");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.createMatch({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/matches`,
              matchRequestBody,
            ),
            params: { id: caseId },
          });
        },
      },
      {
        message: "Adoption case is missing supporter",
        run: async () => {
          const { service } = createFakeService({
            async createFollowup() {
              throw new Error("Adoption case is missing supporter");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.createFollowup({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/followups`,
              followupRequestBody,
            ),
            params: { id: caseId },
          });
        },
      },
      {
        message: "Approved match has no animal",
        run: async () => {
          const { service } = createFakeService({
            async finalizeAdoption() {
              throw new Error("Approved match has no animal");
            },
          });
          const handlers = createHandlers({ service });

          return handlers.finalizeAdoption({
            request: jsonRequest(
              `https://example.test/api/admin/adoptions/cases/${caseId}/finalize`,
              finalizeRequestBody,
            ),
            params: { id: caseId },
          });
        },
      },
    ];

    for (const scenario of conflictCases) {
      const response = await scenario.run();

      expect(response.status).toBe(409);
      expectNoStoreJson(response);
      expect(await response.json()).toEqual({ error: scenario.message });
    }
  });

  test("match create calls service with actor, case, and body", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.createMatch({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/cases/${caseId}/matches`,
        matchRequestBody,
      ),
      params: { id: caseId },
    });

    expect(response.status).toBe(201);
    expectNoStoreJson(response);
    expect(calls).toEqual([
      {
        name: "createMatch",
        payload: {
          actorUserId: staff.authUserId,
          caseId,
          input: matchRequestBody,
        },
      },
    ]);
    expect(await response.json()).toEqual({ match: { id: matchId } });
  });

  test("followup create calls service with actor, case, and body", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.createFollowup({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/cases/${caseId}/followups`,
        followupRequestBody,
      ),
      params: { id: caseId },
    });

    expect(response.status).toBe(201);
    expectNoStoreJson(response);
    expect(calls).toEqual([
      {
        name: "createFollowup",
        payload: {
          actorUserId: staff.authUserId,
          caseId,
          input: followupRequestBody,
        },
      },
    ]);
    expect(await response.json()).toEqual({ followup: { id: followupId } });
  });

  test("finalize adoption calls service with actor, case, and body and returns 201", async () => {
    const { calls, service } = createFakeService();
    const handlers = createHandlers({ service });

    const response = await handlers.finalizeAdoption({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/cases/${caseId}/finalize`,
        finalizeRequestBody,
      ),
      params: { id: caseId },
    });

    expect(response.status).toBe(201);
    expectNoStoreJson(response);
    expect(calls).toEqual([
      {
        name: "finalizeAdoption",
        payload: {
          actorUserId: staff.authUserId,
          caseId,
          input: finalizeRequestBody,
        },
      },
    ]);
    expect(await response.json()).toEqual({ adoption: { id: adoptionId } });
  });
});
