import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "./config.server";
import type { DonationRepository } from "./service";

export type AdminRole = "staff" | "treasurer" | "admin";

export type AdminUser = {
  authUserId: string;
  email: string;
  role: AdminRole;
};

export function createSupabaseServiceClient() {
  const config = getSupabaseServerConfig();
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseDonationRepository(client: SupabaseClient): DonationRepository {
  return {
    async upsertSupporter(input) {
      const { data, error } = await client
        .from("supporter")
        .upsert(
          {
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            language: input.language,
            source: "donation_form",
          },
          { onConflict: "email" },
        )
        .select("id,email")
        .single();

      if (error) throw error;
      return data;
    },
    async ensureSupporterRole(input) {
      const { error } = await client.from("supporter_role").upsert({
        supporter_id: input.supporterId,
        role: input.role,
      });
      if (error) throw error;
    },
    async replaceConsents(rows) {
      const { error } = await client.from("consent").insert(rows);
      if (error) throw error;
    },
    async createDonation(input) {
      const { data, error } = await client
        .from("donation")
        .insert(input)
        .select("id,amount_cents")
        .single();
      if (error) throw error;
      return data;
    },
    async createPayment(input) {
      const { data, error } = await client.from("payment").insert(input).select("*").single();
      if (error) throw error;
      return data;
    },
    async updatePaymentProviderRef(paymentId, providerRef) {
      const { error } = await client
        .from("payment")
        .update({ provider_ref: providerRef })
        .eq("id", paymentId);
      if (error) throw error;
    },
  };
}

export async function requireAdmin(
  request: Request,
  allowedRoles: AdminRole[],
  client = createSupabaseServiceClient(),
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
    .select("auth_user_id,email,role,status")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin || !allowedRoles.includes(admin.role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    authUserId: admin.auth_user_id,
    email: admin.email,
    role: admin.role,
  };
}

export async function listAdminPayments(client: SupabaseClient) {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at,donation:donation_id(id,purpose,receipt_requested,status,supporter:supporter_id(id,name,email,phone,language))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}
