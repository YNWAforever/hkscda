import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../donations/supabase.server";
import { createAdminGovernanceHandlers } from "./http";

const admin: AdminUser = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "a@example.test",
  role: "admin",
  status: "active",
};

function createHandlers(
  overrides: Partial<Parameters<typeof createAdminGovernanceHandlers>[0]["service"]> = {},
) {
  return createAdminGovernanceHandlers({
    requireGovernanceAdmin: async () => admin,
    service: {
      listAdmin: async () => [],
      upsert: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: 0,
        effectiveDate: "2026-08-01",
        isActive: true,
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
      }),
      deactivate: async () => {},
      ...overrides,
    },
  });
}

describe("createAdminGovernanceHandlers", () => {
  test("list returns the admin roster as JSON with no-store caching", async () => {
    const handlers = createHandlers({ listAdmin: async () => [] });
    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
  });

  test("upsert parses the request body and returns the created member", async () => {
    const handlers = createHandlers();
    const response = await handlers.upsert({
      request: new Request("http://x/api/admin/governance", {
        method: "POST",
        body: JSON.stringify({ name: "陳大文", roleTitle: "主席", effectiveDate: "2026-08-01" }),
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.member.name).toBe("陳大文");
  });

  test("deactivate requires an id in the body", async () => {
    const handlers = createHandlers();
    const response = await handlers.deactivate({
      request: new Request("http://x/api/admin/governance", { method: "DELETE", body: JSON.stringify({}) }),
    });

    expect(response.status).toBe(400);
  });

  test("a thrown Response from requireGovernanceAdmin is returned as-is (e.g. 403 for a non-admin role)", async () => {
    const handlers = createAdminGovernanceHandlers({
      requireGovernanceAdmin: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service: {
        listAdmin: async () => [],
        upsert: async () => {
          throw new Error("unreachable");
        },
        deactivate: async () => {},
      },
    });

    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });
    expect(response.status).toBe(403);
  });

  test("an unexpected service error maps to a 500 without leaking details", async () => {
    const handlers = createHandlers({
      listAdmin: async () => {
        throw new Error("db exploded");
      },
    });
    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Could not process governance request");
  });
});
