import { describe, expect, test } from "bun:test";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createCrmHandlers } from "./http.server";

const admin: AdminUser = {
  id: "treasurer-row",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "treasurer@example.com",
  role: "treasurer",
  status: "active",
};

function createService(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const service = {
    calls,
    async listSupporters() {
      calls.push("listSupporters");
      return { supporters: [], total: 0 };
    },
    async createSupporter() {
      calls.push("createSupporter");
      return { id: "supporter-1", email: "ada@example.com" };
    },
    async getSupporterDetail() {
      calls.push("getSupporterDetail");
      return null;
    },
    async updateSupporter() {
      calls.push("updateSupporter");
    },
    async appendConsents() {
      calls.push("appendConsents");
      return [];
    },
    async createManualDonation() {
      calls.push("createManualDonation");
      return {
        donationId: "donation-1",
        paymentId: "payment-1",
        deliveryJobId: null,
        replayed: false,
      };
    },
    async exportSupporters() {
      calls.push("exportSupporters");
      return "supporter_id,name\nsupporter-1,Ada\n";
    },
    async exportDonations() {
      calls.push("exportDonations");
      return "donation_id,amount_hkd\ndonation-1,300\n";
    },
    ...overrides,
  };

  return service;
}

describe("createCrmHandlers", () => {
  test("rejects missing auth before exporting supporters", async () => {
    const service = createService();
    const handlers = createCrmHandlers({
      requireTreasurer: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service,
    });

    const response = await handlers.exportSupporters({
      request: new Request("https://example.com/api/admin/exports/supporters.csv"),
    });

    expect(response.status).toBe(401);
    expect(service.calls).toEqual([]);
  });

  test("returns supporters CSV with download headers", async () => {
    const service = createService();
    const handlers = createCrmHandlers({
      requireTreasurer: async () => admin,
      service,
    });

    const response = await handlers.exportSupporters({
      request: new Request("https://example.com/api/admin/exports/supporters.csv?q=ada"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="supporters.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("supporter_id,name");
    expect(service.calls).toEqual(["exportSupporters"]);
  });

  test("maps Zod errors to a 400 JSON response", async () => {
    const service = createService({
      async createSupporter() {
        throw new z.ZodError([]);
      },
    });
    const handlers = createCrmHandlers({
      requireTreasurer: async () => admin,
      service,
    });

    const response = await handlers.createSupporter({
      request: new Request("https://example.com/api/admin/supporters", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Invalid CRM request" });
  });

  test("maps malformed JSON bodies to a 400 response before service work", async () => {
    const service = createService();
    const handlers = createCrmHandlers({
      requireTreasurer: async () => admin,
      service,
    });

    const response = await handlers.createSupporter({
      request: new Request("https://example.com/api/admin/supporters", {
        method: "POST",
        body: "{",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(service.calls).toEqual([]);
  });

  test("rejects malformed supporter ids before service work", async () => {
    const service = createService();
    let authCalls = 0;
    const handlers = createCrmHandlers({
      requireTreasurer: async () => {
        authCalls += 1;
        return admin;
      },
      service,
    });

    const response = await handlers.getSupporter({
      request: new Request("https://example.com/api/admin/supporters/not-a-uuid"),
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid supporter id" });
    expect(authCalls).toBe(0);
    expect(service.calls).toEqual([]);
  });

  test("sets no-store on supporter JSON responses", async () => {
    const service = createService({
      async listSupporters() {
        return { supporters: [], total: 0 };
      },
    });
    const handlers = createCrmHandlers({
      requireTreasurer: async () => admin,
      service,
    });

    const response = await handlers.listSupporters({
      request: new Request("https://example.com/api/admin/supporters"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
