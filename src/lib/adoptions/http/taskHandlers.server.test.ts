import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import {
  createTaskHandlers,
  type TaskService,
} from "./taskHandlers.server";

const staff: AdminUser = {
  id: "staff-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

const taskId = "aaaaaaaa-bbbb-4333-8444-555555555555";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createService(overrides: Partial<TaskService> = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const service = {
    async listTasks(rawSearch) {
      calls.push({ name: "listTasks", payload: rawSearch });
      return { tasks: [], total: 0 };
    },
    async createTask(payload) {
      calls.push({ name: "createTask", payload });
      return { id: taskId };
    },
    async getTask(id) {
      calls.push({ name: "getTask", payload: id });
      return null;
    },
    async updateTask(payload) {
      calls.push({ name: "updateTask", payload });
      return { id: payload.taskId };
    },
    ...overrides,
  } satisfies TaskService;

  return { calls, service };
}

describe("createTaskHandlers", () => {
  test("lists tasks after authorization and forwards query parameters", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createTaskHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      service,
    });

    const response = await handlers.listTasks({
      request: new Request(
        "https://example.test/api/admin/adoptions/tasks?due=overdue&priority=urgent",
      ),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tasks: [], total: 0 });
    expect(authCalls).toEqual(["coordinator"]);
    expect(calls).toEqual([
      {
        name: "listTasks",
        payload: { due: "overdue", priority: "urgent" },
      },
    ]);
  });

  test("creates a task with the coordinator actor and returns 201", async () => {
    const serviceCalls: unknown[] = [];
    const { service } = createService({
      async createTask(payload) {
        serviceCalls.push(payload);
        return { id: taskId };
      },
    });
    const handlers = createTaskHandlers({
      requireCoordinator: async () => staff,
      service,
    });

    const response = await handlers.createTask({
      request: jsonRequest("https://example.test/api/admin/adoptions/tasks", {
        title: "Post-adoption call",
      }),
    });

    expect(serviceCalls).toEqual([
      {
        actorUserId: staff.authUserId,
        input: { title: "Post-adoption call" },
      },
    ]);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ task: { id: taskId } });
  });

  test("validates the get task UUID before authorization", async () => {
    const { calls, service } = createService();
    let authorizationCalls = 0;
    const handlers = createTaskHandlers({
      requireCoordinator: async () => {
        authorizationCalls += 1;
        return staff;
      },
      service,
    });

    const response = await handlers.getTask({
      request: new Request("https://example.test/api/admin/adoptions/tasks/bad"),
      params: { id: "bad" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authorizationCalls).toBe(0);
    expect(calls).toEqual([]);
  });

  test("preserves the task not-found response", async () => {
    const { calls, service } = createService();
    const handlers = createTaskHandlers({
      requireCoordinator: async () => staff,
      service,
    });

    const response = await handlers.getTask({
      request: new Request(
        `https://example.test/api/admin/adoptions/tasks/${taskId}`,
      ),
      params: { id: taskId },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Task not found" });
    expect(calls).toEqual([{ name: "getTask", payload: taskId }]);
  });

  test("updates a task with validated id, coordinator actor, and JSON body", async () => {
    const { calls, service } = createService();
    const handlers = createTaskHandlers({
      requireCoordinator: async () => staff,
      service,
    });

    const response = await handlers.updateTask({
      request: jsonRequest(
        `https://example.test/api/admin/adoptions/tasks/${taskId}`,
        { title: "Updated follow-up", priority: "urgent" },
      ),
      params: { id: taskId },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task: { id: taskId } });
    expect(calls).toEqual([
      {
        name: "updateTask",
        payload: {
          actorUserId: staff.authUserId,
          taskId,
          input: { title: "Updated follow-up", priority: "urgent" },
        },
      },
    ]);
  });
});
