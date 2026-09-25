import { describe, expect, test } from "bun:test";

import {
  AdminAccessError,
  createAdminAccessService,
  type AdminAccessRepository,
  type AdminAccessUser,
} from "./accessManagement.server";
import { createSupabaseInviteAuthProvider } from "./accessManagement.repository.server";

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
    inviteUserWithAudit: [],
    resendInviteWithAudit: [],
    updateUserWithAudit: [],
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
    async inviteUserWithAudit(input) {
      calls.inviteUserWithAudit.push(input);
      return adminUser({
        id: "new-row",
        authUserId: input.authUserId,
        email: input.email,
        role: input.role,
        status: "pending",
        invitedAt: input.sentAt,
        inviteSentAt: input.sentAt,
        lastInvitedBy: input.actorUserId,
      });
    },
    async resendInviteWithAudit(input) {
      calls.resendInviteWithAudit.push(input);
      return adminUser({
        id: input.userId,
        status: "pending",
        inviteSentAt: input.sentAt,
        lastInvitedBy: input.actorUserId,
      });
    },
    async updateUserWithAudit(input) {
      calls.updateUserWithAudit.push(input);
      return adminUser({
        id: input.userId,
        role: input.role ?? "staff",
        status: input.status ?? "active",
      });
    },
    async listAudit() {
      return [];
    },
    ...overrides,
  };
  return { repo, calls };
}

describe("createAdminAccessService", () => {
  test("does not deliver an invite when the pending row and audit cannot commit", async () => {
    const events: string[] = [];
    const client = {
      auth: {
        admin: {
          async inviteUserByEmail() {
            events.push("delivered");
            return {
              data: { user: { id: "invite-auth-id", email: "new@example.com" } },
              error: null,
            };
          },
          async generateLink() {
            events.push("prepared");
            return {
              data: {
                user: { id: "invite-auth-id", email: "new@example.com" },
                properties: { action_link: "https://example.test/invite" },
              },
              error: null,
            };
          },
        },
      },
    };
    const { repo } = makeRepo({
      async inviteUserWithAudit() {
        events.push("database-failed");
        throw new Error("database-failed");
      },
    });
    const auth = createSupabaseInviteAuthProvider(client as never, {
      sendInviteEmail: async () => {
        events.push("delivered");
      },
    });
    const service = createAdminAccessService({ repo, auth, now });

    await expect(
      service.inviteUser({ actor, input: { email: "new@example.com", role: "staff" } }),
    ).rejects.toThrow("database-failed");
    expect(events).not.toContain("delivered");
  });
  test("delivers the prepared invite only after the pending row and audit commit", async () => {
    const events: string[] = [];
    const client = {
      auth: {
        admin: {
          async inviteUserByEmail() {
            throw new Error("eager invite delivery is forbidden");
          },
          async generateLink() {
            events.push("prepared");
            return {
              data: {
                user: { id: "invite-auth-id", email: "new@example.com" },
                properties: { action_link: "https://example.test/invite" },
              },
              error: null,
            };
          },
        },
      },
    };
    const { repo } = makeRepo({
      async inviteUserWithAudit(input) {
        events.push("committed");
        return adminUser({
          id: "new-row",
          authUserId: input.authUserId,
          email: input.email,
          role: input.role,
          status: "pending",
        });
      },
    });
    const auth = createSupabaseInviteAuthProvider(client as never, {
      sendInviteEmail: async () => {
        events.push("delivered");
      },
    });
    const service = createAdminAccessService({ repo, auth, now });

    const result = await service.inviteUser({
      actor,
      input: { email: "new@example.com", role: "staff" },
    });

    expect(result.status).toBe("pending");
    expect(events).toEqual(["prepared", "committed", "delivered"]);
  });
  test("invites a new admin user as pending and writes audit history", async () => {
    const { repo, calls } = makeRepo();
    const invited: string[] = [];
    const service = createAdminAccessService({
      repo,
      auth: {
        async inviteByEmail(email) {
          invited.push(email);
          return { authUserId: "invite-auth-id", email, actionLink: "https://example.test/invite" };
        },
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    const result = await service.inviteUser({
      actor,
      input: { email: " New.Admin@Example.COM ", role: "treasurer" },
    });

    expect(invited).toEqual(["new.admin@example.com"]);
    expect(result.status).toBe("pending");
    expect(calls.inviteUserWithAudit[0]).toEqual({
      actorUserId: "actor-auth",
      authUserId: "invite-auth-id",
      email: "new.admin@example.com",
      role: "treasurer",
      sentAt: "2026-07-01T10:00:00.000Z",
    });
  });

  test("invites through an atomic row-and-audit operation", async () => {
    const calls: unknown[] = [];
    const { repo } = makeRepo();
    Object.assign(repo, {
      async insertUser() {
        throw new Error("Separate insert cannot guarantee audit");
      },
      async insertAuditLog() {
        throw new Error("Separate audit cannot roll back an insert");
      },
      async inviteUserWithAudit(input: unknown) {
        calls.push(input);
        return adminUser({ id: "new-row", status: "pending", role: "treasurer" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: {
        inviteByEmail: async () => ({
          authUserId: "invite-auth-id",
          email: "new@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    const result = await service.inviteUser({
      actor,
      input: { email: "new@example.com", role: "treasurer" },
    });

    expect(result.status).toBe("pending");
    expect(calls).toEqual([
      {
        actorUserId: "actor-auth",
        authUserId: "invite-auth-id",
        email: "new@example.com",
        role: "treasurer",
        sentAt: "2026-07-01T10:00:00.000Z",
      },
    ]);
  });

  test("does not deliver a resent invite when its audit commit fails", async () => {
    const events: string[] = [];
    const client = {
      auth: {
        admin: {
          async generateLink() {
            events.push("prepared");
            return {
              data: {
                user: { id: "target-auth", email: "pending@example.com" },
                properties: { action_link: "https://example.test/resent-invite" },
              },
              error: null,
            };
          },
        },
      },
    };
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ status: "pending", email: "pending@example.com" });
      },
      async resendInviteWithAudit() {
        events.push("database-failed");
        throw new Error("database-failed");
      },
    });
    const auth = createSupabaseInviteAuthProvider(client as never, {
      sendInviteEmail: async () => {
        events.push("delivered");
      },
    });
    const service = createAdminAccessService({ repo, auth, now });

    await expect(service.resendInvite({ actor, userId: "target-row" })).rejects.toThrow(
      "database-failed",
    );
    expect(events).not.toContain("delivered");
  });
  test("resends through an atomic row-and-audit operation", async () => {
    const calls: unknown[] = [];
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ status: "pending", email: "pending@example.com" });
      },
    });
    Object.assign(repo, {
      async updateUser() {
        throw new Error("Separate update cannot guarantee audit");
      },
      async insertAuditLog() {
        throw new Error("Separate audit cannot roll back an update");
      },
      async resendInviteWithAudit(input: unknown) {
        calls.push(input);
        return adminUser({ status: "pending", email: "pending@example.com" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    const result = await service.resendInvite({ actor, userId: "target-row" });

    expect(result.status).toBe("pending");
    expect(calls).toEqual([
      {
        actorUserId: "actor-auth",
        userId: "target-row",
        sentAt: "2026-07-01T10:00:00.000Z",
      },
    ]);
  });
  test("rejects duplicate active or pending admin records for an email", async () => {
    const { repo } = makeRepo({
      async findUserByEmail() {
        return adminUser({ status: "pending" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
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
        async inviteByEmail() {
          return {
            authUserId: "unused",
            email: "unused@example.com",
            actionLink: "https://example.test/invite",
          };
        },
        async sendInviteEmail() {},
        async resendInvite(email) {
          resent.push(email);
          return { actionLink: "https://example.test/invite" };
        },
      },
      now,
    });

    await service.resendInvite({ actor, userId: "target-row" });

    expect(resent).toEqual(["pending@example.com"]);
    expect(calls.resendInviteWithAudit[0]).toEqual({
      actorUserId: "actor-auth",
      userId: "target-row",
      sentAt: "2026-07-01T10:00:00.000Z",
    });
  });

  test("resends an existing pending auth user without inviting a duplicate", async () => {
    const { repo, calls } = makeRepo({
      async findUserById() {
        return adminUser({ status: "pending", email: "pending@example.com" });
      },
    });
    const resent: string[] = [];
    const service = createAdminAccessService({
      repo,
      auth: {
        async inviteByEmail() {
          throw new Error("inviteUserByEmail must not be used for resend");
        },
        async sendInviteEmail() {},
        async resendInvite(email) {
          resent.push(email);
          return { actionLink: "https://example.test/invite" };
        },
      },
      now,
    });

    await service.resendInvite({ actor, userId: "target-row" });

    expect(resent).toEqual(["pending@example.com"]);
    expect(calls.resendInviteWithAudit[0]).toEqual({
      actorUserId: "actor-auth",
      userId: "target-row",
      sentAt: "2026-07-01T10:00:00.000Z",
    });
  });
  test("rejects resend for non-pending users", async () => {
    const { repo } = makeRepo({
      async findUserById() {
        return adminUser({ status: "active" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
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
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
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
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    await expect(
      service.updateUser({ actor, userId: "target-row", input: { role: "treasurer" } }),
    ).rejects.toMatchObject({ status: 422, code: "last_active_admin" });
    await expect(
      service.updateUser({ actor, userId: "target-row", input: { status: "disabled" } }),
    ).rejects.toMatchObject({ status: 422, code: "last_active_admin" });
  });

  test("persists a role change and its audit record through one atomic repository call", async () => {
    const calls: unknown[] = [];
    const { repo } = makeRepo();
    Object.assign(repo, {
      async updateUser() {
        throw new Error("A separate update can commit before audit insertion");
      },
      async insertAuditLog() {
        throw new Error("A separate audit insertion is not atomic");
      },
      async updateUserWithAudit(input: unknown) {
        calls.push(input);
        return adminUser({ role: "treasurer" });
      },
    });
    const service = createAdminAccessService({
      repo,
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    const result = await service.updateUser({
      actor,
      userId: "target-row",
      input: { role: "treasurer" },
    });

    expect(result.role).toBe("treasurer");
    expect(calls).toEqual([
      {
        actorUserId: "actor-auth",
        userId: "target-row",
        role: "treasurer",
        status: undefined,
      },
    ]);
  });

  test("sends role, disable, and reactivate changes through atomic updates", async () => {
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
      auth: {
        inviteByEmail: async () => ({
          authUserId: "unused",
          email: "a@example.com",
          actionLink: "https://example.test/invite",
        }),
        sendInviteEmail: async () => {},
        resendInvite: async () => ({ actionLink: "https://example.test/invite" }),
      },
      now,
    });

    await service.updateUser({ actor, userId: "target-row", input: { role: "treasurer" } });
    await service.updateUser({ actor, userId: "target-row", input: { status: "disabled" } });
    await service.updateUser({ actor, userId: "target-row", input: { status: "active" } });

    expect(calls.updateUserWithAudit).toEqual([
      { actorUserId: "actor-auth", userId: "target-row", role: "treasurer", status: undefined },
      { actorUserId: "actor-auth", userId: "target-row", role: undefined, status: "disabled" },
      { actorUserId: "actor-auth", userId: "target-row", role: undefined, status: "active" },
    ]);
  });

  test("exposes typed access errors for handlers", () => {
    const error = new AdminAccessError("invalid_role", "Invalid role", 422);
    expect(error).toMatchObject({ code: "invalid_role", status: 422 });
  });
});
