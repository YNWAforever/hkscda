import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRole, AdminStatus } from "./access";
import { createSupabaseServiceClient } from "../supabase.server";
import { requestTimingContext } from "../operations/requestTiming.server";
export type AdminSessionOptions = {
  activatePendingInvite?: boolean;
  observeTiming?: (stage: "auth" | "role", durationMs: number) => void;
  now?: () => number;
};

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
  options: AdminSessionOptions = {},
): Promise<AdminUser> {
  const admin = await getAdminUserFromRequest(request, client, options);
  if (!allowedRoles.includes(admin.role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return admin;
}

export async function getAdminUserFromRequest(
  request: Request,
  client: SupabaseClient = createSupabaseServiceClient(),
  options: AdminSessionOptions = {},
): Promise<AdminUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Response("Missing authorization token", { status: 401 });
  }
  const measure = async <T>(stage: "auth" | "role", operation: () => PromiseLike<T>) => {
    const clock = options.now ?? (() => performance.now());
    const start = clock();
    try {
      return await operation();
    } finally {
      try {
        (options.observeTiming ?? requestTimingContext.getStore()?.observe)?.(
          stage,
          Math.max(0, clock() - start),
        );
      } catch {
        /* Diagnostics cannot change authorization. */
      }
    }
  };

  const {
    data: { user },
    error: userError,
  } = await measure("auth", () => client.auth.getUser(token));

  if (userError || !user?.id || !user.email) {
    throw new Response("Invalid authorization token", { status: 401 });
  }

  const { data: admin, error: adminError } = await measure("role", () =>
    client
      .from("admin_user")
      .select("id,auth_user_id,email,role,status")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
  );

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
