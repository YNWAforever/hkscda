import { describe, expect, mock, spyOn, test } from "bun:test";

import { createAdminFaqHandlers, createAdminFaqSearchGapHandler } from "./http";
import type { createFaqService } from "./service";
import type { SearchGapReport } from "./searchGaps";

const adminUserId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
// admin_user.id and admin_user.auth_user_id are distinct UUIDs (see CLAUDE.md's
// "critical distinction"). This fixture keeps them different on purpose: the RPCs
// behind upsert/deactivate check auth_user_id, so a handler that reads the wrong
// field must fail this test rather than passing by coincidence.
const admin = { id: adminUserId, authUserId: actorId, role: "admin" } as never;

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

describe("createAdminFaqSearchGapHandler", () => {
  const report: SearchGapReport = {
    days: 30,
    gaps: [
      {
        topic: "寵物證書",
        language: "zh-HK",
        confidence: "none",
        searchCount: 4,
        lastSeenDay: "2026-10-07",
      },
    ],
  };

  test("requires an admin and returns the report with no-store", async () => {
    const requireFaqAdmin = mock(async () => admin);
    const service = { listReport: mock(async () => report) };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });

    const response = await handler({ request: request("http://localhost/x") });

    expect(requireFaqAdmin).toHaveBeenCalledTimes(1);
    expect(service.listReport).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(report);
  });

  test("propagates a Response thrown by requireFaqAdmin and does not read the report", async () => {
    const requireFaqAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const service = { listReport: mock(async () => report) };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });

    const response = await handler({ request: request("http://localhost/x") });

    expect(response.status).toBe(403);
    expect(service.listReport).not.toHaveBeenCalled();
  });

  test("a failing report falls through to the generic 500 without leaking the error", async () => {
    const requireFaqAdmin = mock(async () => admin);
    const service = {
      listReport: mock(async (): Promise<SearchGapReport> => {
        throw new Error("db exploded");
      }),
    };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await handler({ request: request("http://localhost/x") });

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Could not process FAQ request" });
    } finally {
      logged.mockRestore();
    }
  });
});
