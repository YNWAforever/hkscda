import { describe, expect, test } from "bun:test";

import {
  AdminAccessError,
  createAdminAccessService,
  type AdminAccessRepository,
  type AdminAccessUser,
} from "./accessManagement.server";

const actor = {
  id: "actor-row",
  authUserId: "actor-auth",
  email: "owner@example.com",
  role: "admin" as const,
  status: "active" as const,
};

const now = () => new Date("2026-07-01T10:00:00.000Z");

function adminUser(overrides: Partial<AdminAccessUser> = {}): AdminAccessUser {
  return {
    id: "target-row",
    authUserId: "target-auth",
    email: "target@example.com",
    role: "staff",
    status: "active",
    invitedAt: null,
    inviteSentAt: null,
    inviteAcceptedAt: null,
    lastInvitedBy: null,
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
    ...overrides,
  };
}

function makeRepo(overrides: Partial<AdminAccessRepository> = {}) {
  const calls: Record<string, unknown[]> = {
    insertUser: [],
    updateUser: [],
    insertAuditLog: [],
  };
  const repo: AdminAccessRepository = {
    async listUsers() {
      return [];
    },
    async findUserById() {
      return adminUser();
    },
    async findUserByEmail() {
      return null;
    },
    async countOtherActiveAdmins() {
      return 1;
    },
    async insertUser(input) {
      calls.insertUser.push(input);
      return adminUser({
        id: "new-row",
        authUserId: input.auth_user_id,
        email: input.email,
        role: input.role,
        status: input.status,
        invitedAt: input.invited_at,
        inviteSentAt: input.invite_sent_at,
        lastInvitedBy: input.last_invited_by,
      });
    },
    async updateUser(id, input) {
      calls.updateUser.push({ id, input });
      return adminUser({
        id,
        role: input.role ?? "staff",
        status: input.status ?? "active",
        inviteSentAt: input.invite_sent_at ?? null,
      });
    },
    async insertAuditLog(input) {
      calls.insertAuditLog.push(input);
    },
    async listAudit() {
      return [];
    },
    ...overrides,
  };
  return { repo, calls };
}

describe("createAdminAccessService", () => {
  test("invites a new admin user as pending and writes audit history", async () => {
    const { repo, calls } = makeRepo();
    const invited: string[] = [];
    const service = createAdminAccessService({
      repo,
      auth: {
        async inviteByEmail(email) {
          invited.push(email);
          return { authUserId: "invite-auth-id", email };
        },
      },
      now,
    });

    const result = await service.inviteUser({
      actor,
      input: { email: " New.Admin@Example.COM ", role: "treasurer" },
    });

    expect(invited).toEqual(["new.admin@example.com"]);
    expect(result.status).toBe("pending");
    expect(calls.insertUser[0]).toMatchObject({
      auth_user_id: "invite-auth-id",
      email: "new.admin@example.com",
      role: "treasurer",
      status: "pending",
      invited_at: "2026-07-01T10:00:00.000Z",
      invite_sent_at: "2026-07-01T10:00:00.000Z",
      last_invited_by: "actor-auth",
    });
    expect(calls.insertAuditLog[0]).toMatchObject({
      actor_user_id: "actor-auth",
      action: "admin_user.invite",
      entity: "admin_user",
      entity_id: "new-row",
    });
  });

  test("rejects duplicate active or pending admin records for an email", async () => {
    const { repo } = makeRepo({
      async findUserByEmail() {
        return adminUser({ status: "pending" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: { inviteByEmail: async () => ({ authUserId: "unused", email: "a@example.com" }) },
      now,
    });

    await expect(
      service.inviteUser({ actor, input: { email: "target@example.com", role: "staff" } }),
    ).rejects.toMatchObject({ status: 409, code: "duplicate_admin_user" });
  });

  test("resends only pending invites", async () => {
    const { repo, calls } = makeRepo({
      async findUserById() {
        return adminUser({ status: "pending", email: "pending@example.com" });
      },
    });
    const resent: string[] = [];
    const service = createAdminAccessService({
      repo,
      auth: {
        async inviteByEmail(email) {
          resent.push(email);
          return { authUserId: "pending-auth", email };
        },
      },
      now,
    });

    await service.resendInvite({ actor, userId: "target-row" });

    expect(resent).toEqual(["pending@example.com"]);
    expect(calls.updateUser[0]).toMatchObject({
      id: "target-row",
      input: {
        invite_sent_at: "2026-07-01T10:00:00.000Z",
        last_invited_by: "actor-auth",
      },
    });
    expect(calls.insertAuditLog[0]).toMatchObject({ action: "admin_user.invite_resend" });
  });

  test("rejects resend for non-pending users", async () => {
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ status: "active" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: { inviteByEmail: async () => ({ authUserId: "unused", email: "a@example.com" }) },
      now,
    });

    await expect(service.resendInvite({ actor, userId: "target-row" })).rejects.toMatchObject({
      status: 422,
      code: "invite_not_pending",
    });
  });

  test("blocks self-demotion and self-disable", async () => {
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ id: "actor-row", authUserId: "actor-auth", role: "admin" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: { inviteByEmail: async () => ({ authUserId: "unused", email: "a@example.com" }) },
      now,
    });

    await expect(
      service.updateUser({ actor, userId: "actor-row", input: { role: "staff" } }),
    ).rejects.toMatchObject({ status: 422, code: "self_demote" });
    await expect(
      service.updateUser({ actor, userId: "actor-row", input: { status: "disabled" } }),
    ).rejects.toMatchObject({ status: 422, code: "self_disable" });
  });

  test("blocks disabling or demoting the last active admin", async () => {
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ role: "admin", status: "active" });
      },
      async countOtherActiveAdmins() {
        return 0;
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: { inviteByEmail: async () => ({ authUserId: "unused", email: "a@example.com" }) },
      now,
    });

    await expect(
      service.updateUser({ actor, userId: "target-row", input: { role: "treasurer" } }),
    ).rejects.toMatchObject({ status: 422, code: "last_active_admin" });
    await expect(
      service.updateUser({ actor, userId: "target-row", input: { status: "disabled" } }),
    ).rejects.toMatchObject({ status: 422, code: "last_active_admin" });
  });

  test("records distinct audit actions for role update, disable, and reactivate", async () => {
    const targetStates = [
      adminUser({ status: "active" }),
      adminUser({ status: "active" }),
      adminUser({ status: "disabled" }),
    ];
    const { repo, calls } = makeRepo({
      async findUserById() {
        return targetStates.shift() ?? adminUser();
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: { inviteByEmail: async () => ({ authUserId: "unused", email: "a@example.com" }) },
      now,
    });

    await service.updateUser({ actor, userId: "target-row", input: { role: "treasurer" } });
    await service.updateUser({ actor, userId: "target-row", input: { status: "disabled" } });
    await service.updateUser({ actor, userId: "target-row", input: { status: "active" } });

    expect(calls.insertAuditLog.map((entry) => (entry as { action: string }).action)).toEqual([
      "admin_user.role_update",
      "admin_user.disable",
      "admin_user.reactivate",
    ]);
  });

  test("exposes typed access errors for handlers", () => {
    const error = new AdminAccessError("invalid_role", "Invalid role", 422);
    expect(error).toMatchObject({ code: "invalid_role", status: 422 });
  });
});
