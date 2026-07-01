import { describe, expect, test } from "bun:test";

import { AdminAccessError } from "./accessManagement.server";
import { createAdminAccessHandlers } from "./accessManagement.http.server";

const actor = {
  id: "actor-row",
  authUserId: "actor-auth",
  email: "owner@example.com",
  role: "admin" as const,
  status: "active" as const,
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createAdminAccessHandlers", () => {
  test("returns 401/403 auth responses before service work", async () => {
    let calls = 0;
    const handlers = createAdminAccessHandlers({
      requireAccessAdmin: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service: {
        listUsers: async () => {
          calls += 1;
          return { users: [], summary: { active: 0, pending: 0, disabled: 0 } };
        },
        inviteUser: async () => {
          throw new Error("unused");
        },
        resendInvite: async () => {
          throw new Error("unused");
        },
        updateUser: async () => {
          throw new Error("unused");
        },
        listAudit: async () => ({ audit: [] }),
      },
    });

    const missing = await handlers.listUsers({
      request: new Request("https://example.test/api/admin/access/users"),
    });

    expect(missing.status).toBe(401);
    expect(calls).toBe(0);
  });

  test("maps duplicate invite errors to 409 JSON", async () => {
    const handlers = createAdminAccessHandlers({
      requireAccessAdmin: async () => actor,
      service: {
        listUsers: async () => ({ users: [], summary: { active: 0, pending: 0, disabled: 0 } }),
        inviteUser: async () => {
          throw new AdminAccessError(
            "duplicate_admin_user",
            "An active or pending admin already exists for this email",
            409,
          );
        },
        resendInvite: async () => {
          throw new Error("unused");
        },
        updateUser: async () => {
          throw new Error("unused");
        },
        listAudit: async () => ({ audit: [] }),
      },
    });

    const response = await handlers.inviteUser({
      request: jsonRequest("/api/admin/access/invites", {
        email: "user@example.com",
        role: "staff",
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "An active or pending admin already exists for this email",
      code: "duplicate_admin_user",
    });
  });

  test("maps lockout guardrail errors to 422 JSON", async () => {
    const handlers = createAdminAccessHandlers({
      requireAccessAdmin: async () => actor,
      service: {
        listUsers: async () => ({ users: [], summary: { active: 0, pending: 0, disabled: 0 } }),
        inviteUser: async () => {
          throw new Error("unused");
        },
        resendInvite: async () => {
          throw new Error("unused");
        },
        updateUser: async () => {
          throw new AdminAccessError("self_demote", "You cannot remove your own admin role", 422);
        },
        listAudit: async () => ({ audit: [] }),
      },
    });

    const response = await handlers.updateUser({
      request: new Request("https://example.test/api/admin/access/users/target-row", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "staff" }),
      }),
      params: { id: "target-row" },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "You cannot remove your own admin role",
      code: "self_demote",
    });
  });

  test("returns 201 for successful invite creation", async () => {
    const handlers = createAdminAccessHandlers({
      requireAccessAdmin: async () => actor,
      service: {
        listUsers: async () => ({ users: [], summary: { active: 0, pending: 0, disabled: 0 } }),
        inviteUser: async ({ input }) => {
          const invite = input as { email: string; role: "staff" | "treasurer" | "admin" };
          return {
            id: "new-row",
            authUserId: "new-auth",
            email: invite.email,
            role: invite.role,
            status: "pending",
            invitedAt: "2026-07-01T10:00:00.000Z",
            inviteSentAt: "2026-07-01T10:00:00.000Z",
            inviteAcceptedAt: null,
            lastInvitedBy: "actor-auth",
            createdAt: "2026-07-01T10:00:00.000Z",
            updatedAt: "2026-07-01T10:00:00.000Z",
          };
        },
        resendInvite: async () => {
          throw new Error("unused");
        },
        updateUser: async () => {
          throw new Error("unused");
        },
        listAudit: async () => ({ audit: [] }),
      },
    });

    const response = await handlers.inviteUser({
      request: jsonRequest("/api/admin/access/invites", {
        email: "new@example.com",
        role: "staff",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      user: { email: "new@example.com", role: "staff", status: "pending" },
    });
  });
});
