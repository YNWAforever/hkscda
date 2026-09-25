import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminAccessError } from "./accessManagement.server";

import { getEmailConfig } from "../donations/config.server";

import type {
  AdminAccessAuditRow,
  AdminAccessRepository,
  AdminAccessUser,
  AdminInviteAuthProvider,
} from "./accessManagement.server";

type AdminAccessUserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  role: AdminAccessUser["role"];
  status: AdminAccessUser["status"];
  invited_at: string | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  last_invited_by: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

const adminUserSelect =
  "id,auth_user_id,email,role,status,invited_at,invite_sent_at,invite_accepted_at,last_invited_by,created_at,updated_at";

const ADMIN_RPC_ERRORS: Record<string, { message: string; status: number }> = {
  admin_actor_denied: { message: "Active admin access is required", status: 403 },
  admin_user_not_found: { message: "Admin user not found", status: 404 },
  duplicate_admin_user: {
    message: "An active or pending admin already exists for this email",
    status: 409,
  },
  invite_not_pending: { message: "Only pending invites can be resent", status: 422 },
  empty_admin_user_update: { message: "At least one admin user field is required", status: 422 },
  invalid_role: { message: "Invalid admin role", status: 422 },
  invalid_status: { message: "Invalid admin status", status: 422 },
  invalid_status_transition: { message: "Invalid admin status transition", status: 422 },
  self_demote: { message: "You cannot remove your own admin role", status: 422 },
  self_disable: { message: "You cannot disable your own admin user", status: 422 },
  last_active_admin: { message: "At least one active admin user must remain", status: 422 },
};

const ACCESS_AUDIT_ACTIONS = [
  "admin_user.invite",
  "admin_user.invite_resend",
  "admin_user.role_update",
  "admin_user.disable",
  "admin_user.reactivate",
  "admin_user.activate_from_invite",
  "admin_user.update",
] as const;

function mapUser(row: AdminAccessUserRow): AdminAccessUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    inviteSentAt: row.invite_sent_at,
    inviteAcceptedAt: row.invite_accepted_at,
    lastInvitedBy: row.last_invited_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAudit(row: AuditRow): AdminAccessAuditRow {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityId: row.entity_id,
    detail: row.detail,
    timestamp: row.timestamp,
  };
}

export function createSupabaseAdminAccessRepository(client: SupabaseClient): AdminAccessRepository {
  return {
    async listUsers() {
      const { data, error } = await client
        .from("admin_user")
        .select(adminUserSelect)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as AdminAccessUserRow[]).map(mapUser);
    },

    async findUserById(id) {
      const { data, error } = await client
        .from("admin_user")
        .select(adminUserSelect)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapUser(data as AdminAccessUserRow) : null;
    },

    async findUserByEmail(email) {
      const { data, error } = await client
        .from("admin_user")
        .select(adminUserSelect)
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      return data ? mapUser(data as AdminAccessUserRow) : null;
    },

    async countOtherActiveAdmins(id) {
      const { count, error } = await client
        .from("admin_user")
        .select("id", { count: "exact", head: true })
        .neq("id", id)
        .eq("role", "admin")
        .eq("status", "active");
      if (error) throw error;
      return count ?? 0;
    },

    async inviteUserWithAudit(input) {
      const { data, error } = await client.rpc("invite_admin_user_with_audit", {
        p_actor_user_id: input.actorUserId,
        p_auth_user_id: input.authUserId,
        p_email: input.email,
        p_role: input.role,
        p_sent_at: input.sentAt,
      });
      if (error) {
        const known = error.code === "P0001" ? ADMIN_RPC_ERRORS[error.message] : undefined;
        if (known) throw new AdminAccessError(error.message, known.message, known.status);
        throw error;
      }
      if (!data) throw new Error("Admin invite RPC returned no user");
      return mapUser(data as AdminAccessUserRow);
    },

    async resendInviteWithAudit(input) {
      const { data, error } = await client.rpc("resend_admin_invite_with_audit", {
        p_actor_user_id: input.actorUserId,
        p_target_id: input.userId,
        p_sent_at: input.sentAt,
      });
      if (error) {
        const known = error.code === "P0001" ? ADMIN_RPC_ERRORS[error.message] : undefined;
        if (known) throw new AdminAccessError(error.message, known.message, known.status);
        throw error;
      }
      if (!data) throw new Error("Admin resend RPC returned no user");
      return mapUser(data as AdminAccessUserRow);
    },
    async updateUserWithAudit(input) {
      const { data, error } = await client.rpc("update_admin_user_with_audit", {
        p_actor_user_id: input.actorUserId,
        p_target_id: input.userId,
        p_role: input.role ?? null,
        p_status: input.status ?? null,
      });
      if (error) {
        const known = error.code === "P0001" ? ADMIN_RPC_ERRORS[error.message] : undefined;
        if (known) throw new AdminAccessError(error.message, known.message, known.status);
        throw error;
      }
      if (!data) throw new Error("Admin update RPC returned no user");
      return mapUser(data as AdminAccessUserRow);
    },

    async listAudit(page = 1) {
      const { data, error } = await client
        .from("audit_log")
        .select("id,actor_user_id,action,entity_id,detail,timestamp")
        .in("action", ACCESS_AUDIT_ACTIONS as unknown as string[])
        .order("timestamp", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * 50, page * 50);
      if (error) throw error;
      return ((data ?? []) as AuditRow[]).map(mapAudit);
    },
  };
}

type InviteEmail = {
  to: string;
  actionLink: string;
};

type InviteEmailSender = (input: InviteEmail) => Promise<void>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

async function sendAdminInviteEmail({ to, actionLink }: InviteEmail) {
  const config = getEmailConfig();
  if (!config.resendApiKey) {
    throw new Error("Missing RESEND_API_KEY for admin invite email");
  }

  const safeEmail = escapeHtml(to);
  const safeActionLink = escapeHtml(actionLink);
  const result = await new Resend(config.resendApiKey).emails.send({
    from: config.from,
    to,
    replyTo: config.replyTo,
    subject: "HKSCDA admin access invitation",
    html:
      "<p>You have been invited to the HKSCDA admin panel.</p>" +
      "<p>Invited email: <strong>" +
      safeEmail +
      '</strong></p><p><a href="' +
      safeActionLink +
      '">Accept invitation</a></p>' +
      "<p>This link lets you finish setting up your admin access.</p>",
  });

  if (result.error) throw result.error;
}

export function createSupabaseInviteAuthProvider(
  client: SupabaseClient,
  options: { sendInviteEmail?: InviteEmailSender } = {},
): AdminInviteAuthProvider {
  return {
    async inviteByEmail(email) {
      const { data, error } = await client.auth.admin.generateLink({
        type: "invite",
        email,
      });
      if (error) throw error;
      if (!data.user?.id) {
        throw new Error("Supabase invite link generation did not return a user id");
      }
      const actionLink = data.properties?.action_link;
      if (!actionLink) {
        throw new Error("Supabase invite link generation did not return an action link");
      }
      return { authUserId: data.user.id, email: data.user.email ?? email, actionLink };
    },

    async sendInviteEmail(input) {
      await (options.sendInviteEmail ?? sendAdminInviteEmail)(input);
    },

    async resendInvite(email) {
      const { data, error } = await client.auth.admin.generateLink({
        type: "invite",
        email,
      });
      if (error) throw error;

      const actionLink = data?.properties?.action_link;
      if (!actionLink) {
        throw new Error("Supabase invite link generation did not return an action link");
      }

      return { actionLink };
    },
  };
}
