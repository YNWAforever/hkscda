import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import { createAdopterHandlers, type AdopterService } from "./adopterHandlers.server";

const staff: AdminUser = {
  id: "staff-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

const adopterId = "aaaaaaaa-bbbb-4333-8444-555555555555";

function createService(overrides: Partial<AdopterService> = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const service = {
    async listAdopters(rawSearch) {
      calls.push({ name: "listAdopters", payload: rawSearch });
      return { adopters: [], total: 0 };
    },
    async searchManualCaseIdentity(rawSearch) {
      calls.push({ name: "searchManualCaseIdentity", payload: rawSearch });
      return { candidates: [], total: 0 };
    },
    async getAdopterDetail(id) {
      calls.push({ name: "getAdopterDetail", payload: id });
      return null;
    },
    ...overrides,
  } satisfies AdopterService;

  return { calls, service };
}

describe("createAdopterHandlers", () => {
  test("authorizes and forwards decoded query parameters to adopter searches", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createAdopterHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      service,
    });

    const listResponse = await handlers.listAdopters({
      request: new Request("https://example.test/api/admin/adoptions/adopters?q=Ada%20Lovelace"),
    });
    const identityResponse = await handlers.searchManualCaseIdentity({
      request: new Request(
        "https://example.test/api/admin/adoptions/manual-case-identity?q=Ada%20Lovelace",
      ),
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ adopters: [], total: 0 });
    expect(identityResponse.status).toBe(200);
    expect(await identityResponse.json()).toEqual({ candidates: [], total: 0 });
    expect(authCalls).toEqual(["coordinator", "coordinator"]);
    expect(calls).toEqual([
      { name: "listAdopters", payload: { q: "Ada Lovelace" } },
      {
        name: "searchManualCaseIdentity",
        payload: { q: "Ada Lovelace" },
      },
    ]);
  });

  test("returns the exact no-store not-found response for a missing adopter", async () => {
    const { calls, service } = createService();
    const handlers = createAdopterHandlers({
      requireCoordinator: async () => staff,
      service,
    });

    const response = await handlers.getAdopter({
      request: new Request(`https://example.test/api/admin/adoptions/adopters/${adopterId}`),
      params: { id: adopterId },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Adopter profile not found",
    });
    expect(calls).toEqual([{ name: "getAdopterDetail", payload: adopterId }]);
  });

  test("validates the adopter UUID before authorization", async () => {
    const { calls, service } = createService();
    let authorizationCalls = 0;
    const handlers = createAdopterHandlers({
      requireCoordinator: async () => {
        authorizationCalls += 1;
        return staff;
      },
      service,
    });

    const response = await handlers.getAdopter({
      request: new Request("https://example.test/api/admin/adoptions/adopters/not-a-uuid"),
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authorizationCalls).toBe(0);
    expect(calls).toEqual([]);
  });
});
