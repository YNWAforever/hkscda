import { describe, expect, mock, test } from "bun:test";

import { createAdminFaqHandlers } from "./http";
import type { createFaqService } from "./service";

const actorId = "11111111-1111-4111-8111-111111111111";
const admin = { id: actorId, role: "admin" } as never;

function createService(overrides: Partial<ReturnType<typeof createFaqService>> = {}) {
  return {
    listAdmin: mock(async () => []),
    upsert: mock(async () => ({ id: "e1" })),
    deactivate: mock(async () => undefined),
    ...overrides,
  } as unknown as ReturnType<typeof createFaqService>;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createAdminFaqHandlers", () => {
  test("list requires an admin and returns the service's data with no-store", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });

    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(requireFaqAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(200);
  });

  test("list propagates a Response thrown by requireFaqAdmin (auth failure)", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(403);
  });

  test("upsert parses the JSON body and calls service.upsert with the actor id", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ category: "sponsorship" }),
      }),
    });

    expect(response.status).toBe(200);
    expect(service.upsert).toHaveBeenCalledWith({
      actorUserId: actorId,
      input: { category: "sponsorship" },
    });
  });

  test("upsert returns 400 on invalid JSON", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "POST", body: "not json" }),
    });
    expect(response.status).toBe(400);
  });

  test("upsert returns 400 on a zod validation error", async () => {
    const service = createService({
      upsert: mock(async () => {
        const { z } = await import("zod");
        throw new z.ZodError([]);
      }),
    });
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "POST", body: "{}" }),
    });
    expect(response.status).toBe(400);
  });

  test("deactivate returns 400 when the id is missing", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.deactivate({
      request: request("http://localhost/x", { method: "DELETE", body: "{}" }),
    });
    expect(response.status).toBe(400);
  });

  test("deactivate calls the service and returns ok", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.deactivate({
      request: request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ id: "e1" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(service.deactivate).toHaveBeenCalledWith({ actorUserId: actorId, id: "e1" });
  });

  test("an unexpected error falls through to a generic 500", async () => {
    const service = createService({
      listAdmin: mock(async () => {
        throw new Error("db exploded");
      }),
    });
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(500);
  });
});
