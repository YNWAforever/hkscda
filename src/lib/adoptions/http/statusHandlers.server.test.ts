import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import { createStatusHandlers, type StatusService } from "./statusHandlers.server";
import type { CoordinatorStatus } from "../types";

const coordinator: AdminUser = {
  id: "coordinator-row",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "coordinator@example.com",
  role: "staff",
  status: "active",
};

const statusAdmin: AdminUser = {
  id: "status-admin-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "status-admin@example.com",
  role: "admin",
  status: "active",
};

const statusId = "33333333-4444-4333-8444-555555555555";
const missingStatusId = "44444444-5555-4333-8444-555555555555";
const status: CoordinatorStatus = {
  id: statusId,
  category: "adoption_case",
  key: "new",
  labelZh: "新建",
  labelEn: "New",
  sortOrder: 10,
  color: "coral",
  isActive: true,
  isSystem: false,
  isClosing: false,
  isFinal: false,
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createService(overrides: Partial<StatusService> = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const service = {
    async listStatuses(category?: string) {
      calls.push({ name: "listStatuses", payload: category });
      return [status];
    },
    async getStatus(id: string) {
      calls.push({ name: "getStatus", payload: id });
      return id === missingStatusId ? null : status;
    },
    async createStatus(payload) {
      calls.push({ name: "createStatus", payload });
      return { ...status, ...(payload.input as Partial<CoordinatorStatus>) };
    },
    async updateStatus(payload) {
      calls.push({ name: "updateStatus", payload });
      return {
        ...status,
        ...(payload.input as Partial<CoordinatorStatus>),
        id: payload.statusId,
      };
    },
    async deleteStatus(payload) {
      calls.push({ name: "deleteStatus", payload });
    },
    ...overrides,
  } satisfies StatusService;

  return { calls, service };
}

describe("createStatusHandlers", () => {
  test("uses coordinator auth for listing and status-admin auth for creation", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createStatusHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return coordinator;
      },
      requireStatusAdmin: async () => {
        authCalls.push("status-admin");
        return statusAdmin;
      },
      service,
    });

    const listResponse = await handlers.listStatuses({
      request: new Request("https://example.test/api/admin/adoptions/statuses?category=match"),
    });
    const createResponse = await handlers.createStatus({
      request: jsonRequest("https://example.test/api/admin/adoptions/statuses", {
        category: "match",
        key: "screening",
        labelZh: "審核中",
        labelEn: "Screening",
      }),
    });

    expect(authCalls).toEqual(["coordinator", "status-admin"]);
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ statuses: [status] });
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({
      status: {
        ...status,
        category: "match",
        key: "screening",
        labelZh: "審核中",
        labelEn: "Screening",
      },
    });
    expect(calls).toEqual([
      { name: "listStatuses", payload: "match" },
      {
        name: "createStatus",
        payload: {
          actorUserId: statusAdmin.authUserId,
          input: {
            category: "match",
            key: "screening",
            labelZh: "審核中",
            labelEn: "Screening",
          },
        },
      },
    ]);
  });

  test("returns a not-found response and preserves update and delete payloads", async () => {
    const { calls, service } = createService();
    const handlers = createStatusHandlers({
      requireCoordinator: async () => coordinator,
      requireStatusAdmin: async () => statusAdmin,
      service,
    });

    const missingResponse = await handlers.getStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${missingStatusId}`),
      params: { id: missingStatusId },
    });
    const updateResponse = await handlers.updateStatus({
      request: jsonRequest(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        labelEn: "Updated",
      }),
      params: { id: statusId },
    });
    const deleteResponse = await handlers.deleteStatus({
      request: new Request(`https://example.test/api/admin/adoptions/statuses/${statusId}`, {
        method: "DELETE",
      }),
      params: { id: statusId },
    });

    expect(await missingResponse.json()).toEqual({ error: "Status not found" });
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({ status: { ...status, labelEn: "Updated" } });
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ ok: true });
    expect(calls).toEqual([
      { name: "getStatus", payload: missingStatusId },
      {
        name: "updateStatus",
        payload: {
          actorUserId: statusAdmin.authUserId,
          statusId,
          input: { labelEn: "Updated" },
        },
      },
      {
        name: "deleteStatus",
        payload: { actorUserId: statusAdmin.authUserId, statusId },
      },
    ]);
  });

  test("validates the update UUID before status-admin authorization", async () => {
    const { calls, service } = createService();
    let statusAdminCalls = 0;
    const handlers = createStatusHandlers({
      requireCoordinator: async () => coordinator,
      requireStatusAdmin: async () => {
        statusAdminCalls += 1;
        return statusAdmin;
      },
      service,
    });

    const response = await handlers.updateStatus({
      request: jsonRequest("https://example.test/api/admin/adoptions/statuses/bad", {
        labelEn: "Updated",
      }),
      params: { id: "bad" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(statusAdminCalls).toBe(0);
    expect(calls).toEqual([]);
  });
});
