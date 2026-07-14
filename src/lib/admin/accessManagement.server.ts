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

export type AdminAccessUserInsert = {
  auth_user_id: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  invited_at: string;
  invite_sent_at: string;
  invite_accepted_at?: string | null;
  last_invited_by: string;
};

export type AdminAccessUserUpdate = {
  auth_user_id?: string;
  role?: AdminRole;
  status?: AdminStatus;
  invited_at?: string;
  invite_sent_at?: string;
  invite_accepted_at?: string | null;
  last_invited_by?: string;
  updated_at?: string;
};

export type AdminAccessAuditInsert = {
  actor_user_id: string | null;
  action: string;
  entity: "admin_user";
  entity_id: string;
  timestamp: string;
  detail: Record<string, unknown>;
};

export type AdminAccessRepository = {
  listUsers(): Promise<AdminAccessUser[]>;
  findUserById(id: string): Promise<AdminAccessUser | null>;
  findUserByEmail(email: string): Promise<AdminAccessUser | null>;
  countOtherActiveAdmins(id: string): Promise<number>;
  insertUser(input: AdminAccessUserInsert): Promise<AdminAccessUser>;
  updateUser(id: string, input: AdminAccessUserUpdate): Promise<AdminAccessUser>;
  insertAuditLog(input: AdminAccessAuditInsert): Promise<void>;
  listAudit(): Promise<AdminAccessAuditRow[]>;
};

export type AdminInviteAuthProvider = {
  inviteByEmail(email: string): Promise<{ authUserId: string; email: string | null }>;
  resendInvite(email: string): Promise<void>;
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

function auditDetail(user: AdminAccessUser, input: UpdateInput) {
  return {
    targetEmail: user.email,
    oldRole: user.role,
    newRole: input.role ?? user.role,
    oldStatus: user.status,
    newStatus: input.status ?? user.status,
  };
}

function updateAuditAction(user: AdminAccessUser, input: UpdateInput) {
  if (input.role !== undefined && input.role !== user.role) return "admin_user.role_update";
  if (input.status === "disabled" && user.status !== "disabled") return "admin_user.disable";
  if (input.status === "active" && user.status === "disabled") return "admin_user.reactivate";
  return "admin_user.update";
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

      const invited = await auth.inviteByEmail(input.email);
      const sentAt = timestamp(now);
      const payload = {
        auth_user_id: invited.authUserId,
        role: input.role,
        status: "pending" as const,
        invited_at: sentAt,
        invite_sent_at: sentAt,
        invite_accepted_at: null,
        last_invited_by: args.actor.authUserId,
      };
      const user = existing
        ? await repo.updateUser(existing.id, { ...payload, updated_at: sentAt })
        : await repo.insertUser({ ...payload, email: input.email });

      await repo.insertAuditLog({
        actor_user_id: args.actor.authUserId,
        action: "admin_user.invite",
        entity: "admin_user",
        entity_id: user.id,
        timestamp: sentAt,
        detail: { targetEmail: user.email, role: user.role, status: user.status },
      });
      return user;
    },

    async resendInvite(args: { actor: AdminAccessActor; userId: string }) {
      const user = await repo.findUserById(args.userId);
      if (!user) throw notFound();
      if (user.status !== "pending") {
        throw new AdminAccessError("invite_not_pending", "Only pending invites can be resent", 422);
      }

      await auth.resendInvite(user.email);
      const sentAt = timestamp(now);
      const updated = await repo.updateUser(user.id, {
        invite_sent_at: sentAt,
        last_invited_by: args.actor.authUserId,
        updated_at: sentAt,
      });

      await repo.insertAuditLog({
        actor_user_id: args.actor.authUserId,
        action: "admin_user.invite_resend",
        entity: "admin_user",
        entity_id: user.id,
        timestamp: sentAt,
        detail: { targetEmail: user.email, role: user.role, status: user.status },
      });
      return updated;
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

      const updatedAt = timestamp(now);
      const updated = await repo.updateUser(user.id, {
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
        updated_at: updatedAt,
      });

      await repo.insertAuditLog({
        actor_user_id: args.actor.authUserId,
        action: updateAuditAction(user, input),
        entity: "admin_user",
        entity_id: user.id,
        timestamp: updatedAt,
        detail: auditDetail(user, input),
      });
      return updated;
    },

    async listAudit() {
      return { audit: await repo.listAudit() };
    },
  };
}
