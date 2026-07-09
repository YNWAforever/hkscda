import { describe, expect, test } from "bun:test";

import type { AdminRole, AdminStatus } from "./access";

const activeAdmin = {
  id: "admin-row",
  auth_user_id: "auth-user",
  email: "admin@example.com",
  role: "admin" as AdminRole,
  status: "active" as AdminStatus,
};

function createAdminClient(admin = activeAdmin) {
  return {
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === "valid-token" ? { id: "auth-user", email: admin.email } : null },
        error: token === "valid-token" ? null : new Error("Invalid authorization token"),
      }),
    },
    from: (table: string) => {
      if (table !== "admin_user") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: admin, error: null }),
          }),
        }),
      };
    },
  };
}

const { getAdminUserFromRequest, requireAdmin } = await import("./session.server");

describe("admin server session", () => {
  test("loads an active admin from a bearer token", async () => {
    await expect(
      getAdminUserFromRequest(
        new Request("https://example.test/api/admin/me", {
          headers: { authorization: "Bearer valid-token" },
        }),
        createAdminClient() as never,
      ),
    ).resolves.toEqual({
      id: "admin-row",
      authUserId: "auth-user",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    });
  });

  test("returns a 401 response when the bearer token is missing", async () => {
    try {
      await getAdminUserFromRequest(
        new Request("https://example.test/api/admin/me"),
        createAdminClient() as never,
      );
      throw new Error("expected response");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });

  test("returns a 403 response when the role is not allowed", async () => {
    try {
      await requireAdmin(
        new Request("https://example.test/api/admin/content", {
          headers: { authorization: "Bearer valid-token" },
        }),
        ["staff"],
        createAdminClient() as never,
      );
      throw new Error("expected response");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(403);
    }
  });
});
