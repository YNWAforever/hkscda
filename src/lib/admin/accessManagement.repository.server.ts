import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailConfig } from "../donations/config.server";

import type {
  AdminAccessAuditRow,
  AdminAccessRepository,
  AdminAccessUser,
  AdminAccessUserInsert,
  AdminAccessUserUpdate,
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

    async insertUser(input: AdminAccessUserInsert) {
      const { data, error } = await client
        .from("admin_user")
        .insert(input)
        .select(adminUserSelect)
        .single();
      if (error) throw error;
      return mapUser(data as AdminAccessUserRow);
    },

    async updateUser(id: string, input: AdminAccessUserUpdate) {
      const { data, error } = await client
        .from("admin_user")
        .update(input)
        .eq("id", id)
        .select(adminUserSelect)
        .single();
      if (error) throw error;
      return mapUser(data as AdminAccessUserRow);
    },

    async insertAuditLog(input) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },

    async listAudit() {
      const { data, error } = await client
        .from("audit_log")
        .select("id,actor_user_id,action,entity_id,detail,timestamp")
        .in("action", ACCESS_AUDIT_ACTIONS as unknown as string[])
        .order("timestamp", { ascending: false })
        .limit(50);
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
      const { data, error } = await client.auth.admin.inviteUserByEmail(email);
      if (error) throw error;
      if (!data.user?.id) {
        throw new Error("Supabase invite did not return a user id");
      }
      return { authUserId: data.user.id, email: data.user.email ?? email };
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

      await (options.sendInviteEmail ?? sendAdminInviteEmail)({
        to: email,
        actionLink,
      });
    },
  };
}
