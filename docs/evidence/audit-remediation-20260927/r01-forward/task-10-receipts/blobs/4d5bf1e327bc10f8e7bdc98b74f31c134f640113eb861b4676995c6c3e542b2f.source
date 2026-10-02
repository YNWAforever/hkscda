import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRole, AdminStatus } from "./access";
import { createSupabaseServiceClient } from "../supabase.server";

export type AdminUser = {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
};

export async function requireAdmin(
  request: Request,
  allowedRoles: AdminRole[],
  client = createSupabaseServiceClient(),
): Promise<AdminUser> {
  const admin = await getAdminUserFromRequest(request, client);
  if (!allowedRoles.includes(admin.role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return admin;
}

export async function getAdminUserFromRequest(
  request: Request,
  client: SupabaseClient = createSupabaseServiceClient(),
  options: { activatePendingInvite?: boolean } = {},
): Promise<AdminUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Response("Missing authorization token", { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(token);

  if (userError || !user?.id || !user.email) {
    throw new Response("Invalid authorization token", { status: 401 });
  }

  const { data: admin, error: adminError } = await client
    .from("admin_user")
    .select("id,auth_user_id,email,role,status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin || admin.status === "disabled") {
    throw new Response("Forbidden", { status: 403 });
  }

  if (admin.status === "pending") {
    if (!options.activatePendingInvite) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { data: activated, error: activateError } = await client.rpc(
      "activate_admin_invite_with_audit",
      { p_auth_user_id: user.id },
    );
    if (activateError) {
      if (
        activateError.code === "P0001" &&
        (activateError.message === "admin_user_not_found" ||
          activateError.message === "invalid_status_transition")
      ) {
        throw new Response("Forbidden", { status: 403 });
      }
      throw activateError;
    }
    if (!activated) throw new Error("Admin invite activation returned no user");

    return {
      id: activated.id,
      authUserId: activated.auth_user_id,
      email: activated.email,
      role: activated.role,
      status: activated.status,
    };
  }

  return {
    id: admin.id,
    authUserId: admin.auth_user_id,
    email: admin.email,
    role: admin.role,
    status: admin.status,
  };
}
