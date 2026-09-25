import { z } from "zod";

import type { AdminRole, AdminStatus } from "./access";

export type AdminAccessUser = {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  invitedAt: string | null;
  inviteSentAt: string | null;
  inviteAcceptedAt: string | null;
  lastInvitedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAccessActor = Pick<
  AdminAccessUser,
  "id" | "authUserId" | "email" | "role" | "status"
>;

export type AdminAccessAuditRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityId: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export type AdminAccessAtomicInvite = {
  actorUserId: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  sentAt: string;
};

export type AdminAccessAtomicResend = {
  actorUserId: string;
  userId: string;
  sentAt: string;
};
export type AdminAccessAtomicUpdate = {
  actorUserId: string;
  userId: string;
  role?: AdminRole;
  status?: AdminStatus;
};

export type AdminAccessRepository = {
  listUsers(): Promise<AdminAccessUser[]>;
  findUserById(id: string): Promise<AdminAccessUser | null>;
  findUserByEmail(email: string): Promise<AdminAccessUser | null>;
  countOtherActiveAdmins(id: string): Promise<number>;
  inviteUserWithAudit(input: AdminAccessAtomicInvite): Promise<AdminAccessUser>;
  resendInviteWithAudit(input: AdminAccessAtomicResend): Promise<AdminAccessUser>;
  updateUserWithAudit(input: AdminAccessAtomicUpdate): Promise<AdminAccessUser>;
  listAudit(page?: number): Promise<AdminAccessAuditRow[]>;
};

export type AdminInviteAuthProvider = {
  // Preparation creates a link, but does not deliver it.
  inviteByEmail(email: string): Promise<{
    authUserId: string;
    email: string | null;
    actionLink: string;
  }>;
  sendInviteEmail(input: { to: string; actionLink: string }): Promise<void>;
  // Resend also prepares a link without delivering it.
  resendInvite(email: string): Promise<{ actionLink: string }>;
};

export class AdminAccessError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AdminAccessError";
    this.code = code;
    this.status = status;
  }
}

const roleSchema = z.enum(["staff", "treasurer", "admin"]);
const statusSchema = z.enum(["pending", "active", "disabled"]);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: roleSchema,
});

const updateSchema = z
  .object({
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((input) => input.role !== undefined || input.status !== undefined, {
    message: "At least one admin user field is required",
  });

type InviteInput = z.infer<typeof inviteSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function timestamp(now: () => Date) {
  return now().toISOString();
}

function summary(users: AdminAccessUser[]) {
  return {
    active: users.filter((user) => user.status === "active").length,
    pending: users.filter((user) => user.status === "pending").length,
    disabled: users.filter((user) => user.status === "disabled").length,
  };
}

function notFound() {
  return new AdminAccessError("admin_user_not_found", "Admin user not found", 404);
}

function duplicateAdmin() {
  return new AdminAccessError(
    "duplicate_admin_user",
    "An active or pending admin already exists for this email",
    409,
  );
}

function assertPatchStatusTransition(current: AdminStatus, next: AdminStatus) {
  if (current === next) return;
  if (next === "pending") {
    throw new AdminAccessError("invalid_status_transition", "Cannot move a user to pending", 422);
  }
  if (current === "pending" && next === "active") {
    throw new AdminAccessError(
      "invalid_status_transition",
      "Pending users activate when they accept their invite",
      422,
    );
  }
}

function removesActiveAdmin(user: AdminAccessUser, nextRole: AdminRole, nextStatus: AdminStatus) {
  return (
    user.role === "admin" &&
    user.status === "active" &&
    !(nextRole === "admin" && nextStatus === "active")
  );
}

export function createAdminAccessService({
  repo,
  auth,
  now = () => new Date(),
}: {
  repo: AdminAccessRepository;
  auth: AdminInviteAuthProvider;
  now?: () => Date;
}) {
  return {
    async listUsers() {
      const users = await repo.listUsers();
      return { users, summary: summary(users) };
    },

    async inviteUser(args: { actor: AdminAccessActor; input: unknown }) {
      const input: InviteInput = inviteSchema.parse(args.input);
      const existing = await repo.findUserByEmail(input.email);
      if (existing && (existing.status === "active" || existing.status === "pending")) {
        throw duplicateAdmin();
      }

      // Link generation may create an Auth identity, but it does not send an email.
      // A failed database commit must not deliver an unusable invitation. Do not
      // delete the Auth identity here: the provider may have returned an existing user.
      const invited = await auth.inviteByEmail(input.email);
      const sentAt = timestamp(now);
      const user = await repo.inviteUserWithAudit({
        actorUserId: args.actor.authUserId,
        authUserId: invited.authUserId,
        email: input.email,
        role: input.role,
        sentAt,
      });
      await auth.sendInviteEmail({ to: input.email, actionLink: invited.actionLink });
      return user;
    },

    async resendInvite(args: { actor: AdminAccessActor; userId: string }) {
      const user = await repo.findUserById(args.userId);
      if (!user) throw notFound();
      if (user.status !== "pending") {
        throw new AdminAccessError("invite_not_pending", "Only pending invites can be resent", 422);
      }

      const prepared = await auth.resendInvite(user.email);
      const sentAt = timestamp(now);
      const resent = await repo.resendInviteWithAudit({
        actorUserId: args.actor.authUserId,
        userId: user.id,
        sentAt,
      });
      await auth.sendInviteEmail({ to: user.email, actionLink: prepared.actionLink });
      return resent;
    },

    async updateUser(args: { actor: AdminAccessActor; userId: string; input: unknown }) {
      const input = updateSchema.parse(args.input);
      const user = await repo.findUserById(args.userId);
      if (!user) throw notFound();

      const nextRole = input.role ?? user.role;
      const nextStatus = input.status ?? user.status;

      if (user.authUserId === args.actor.authUserId && input.role && input.role !== "admin") {
        throw new AdminAccessError("self_demote", "You cannot remove your own admin role", 422);
      }
      if (user.authUserId === args.actor.authUserId && input.status === "disabled") {
        throw new AdminAccessError("self_disable", "You cannot disable your own admin user", 422);
      }

      if (input.status) assertPatchStatusTransition(user.status, input.status);
      if (removesActiveAdmin(user, nextRole, nextStatus)) {
        const otherActiveAdmins = await repo.countOtherActiveAdmins(user.id);
        if (otherActiveAdmins < 1) {
          throw new AdminAccessError(
            "last_active_admin",
            "At least one active admin user must remain",
            422,
          );
        }
      }

      return repo.updateUserWithAudit({
        actorUserId: args.actor.authUserId,
        userId: user.id,
        role: input.role,
        status: input.status,
      });
    },

    async listAudit(page = 1) {
      const rows = await repo.listAudit(page);
      return { audit: rows.slice(0, 50), hasMore: rows.length > 50, page };
    },
  };
}
