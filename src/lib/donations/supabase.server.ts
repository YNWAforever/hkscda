import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../supabase.server";
import { publicDonationStatuses, type PublicDonationStatus } from "./publicStatus";
import type { PublicDonationStatusRepository } from "./publicStatus.server";
import type { DonationRepository } from "./service";

export { createSupabaseServiceClient };
export type { AdminUser } from "../admin/session.server";
export { getAdminUserFromRequest, requireAdmin } from "../admin/session.server";

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
    async deletePayment(paymentId) {
      const { error } = await client.from("payment").delete().eq("id", paymentId);
      if (error) throw error;
    },
    async deleteDonation(donationId) {
      const { error } = await client.from("donation").delete().eq("id", donationId);
      if (error) throw error;
    },
  };
}

export function createSupabaseDonationStatusRepository(
  client: SupabaseClient,
): PublicDonationStatusRepository {
  return {
    async findStatus(donationId) {
      const { data, error } = await client
        .from("donation")
        .select("status")
        .eq("id", donationId)
        .maybeSingle<{ status: string }>();

      if (error) throw error;
      if (!data || !publicDonationStatuses.includes(data.status as PublicDonationStatus)) {
        return null;
      }
      return data.status as PublicDonationStatus;
    },
  };
}

export async function listAdminPayments(client: SupabaseClient) {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at,donation:donation_id(id,purpose,custom_purpose,receipt_requested,status,supporter:supporter_id(id,name,email,phone,language))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

export async function listAdminReceipts(client: SupabaseClient) {
  const { data, error } = await client
    .from("receipt")
    .select("id,receipt_no,donation_ids,status")
    .order("issued_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

const FINANCE_ACTIVITY_ACTIONS = [
  "payment.mark_received",
  "receipt.issue",
  "receipt.void",
] as const;

export type FinanceActivityRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  entityId: string;
  detail: unknown;
  createdAt: string;
};

export async function listFinanceActivity(client: SupabaseClient): Promise<FinanceActivityRow[]> {
  const { data, error } = await client
    .from("audit_log")
    .select("id,action,actor_user_id,entity_id,detail,timestamp")
    .in("action", FINANCE_ACTIVITY_ACTIONS as unknown as string[])
    .order("timestamp", { ascending: false })
    .limit(50);

  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    action: string;
    actor_user_id: string | null;
    entity_id: string;
    detail: unknown;
    timestamp: string;
  }>;

  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter(Boolean))] as string[];
  let emailByAuthId = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: admins, error: adminError } = await client
      .from("admin_user")
      .select("auth_user_id,email")
      .in("auth_user_id", actorIds);
    if (adminError) throw adminError;
    emailByAuthId = new Map(
      ((admins ?? []) as Array<{ auth_user_id: string; email: string }>).map((a) => [
        a.auth_user_id,
        a.email,
      ]),
    );
  }

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actor_user_id ? (emailByAuthId.get(row.actor_user_id) ?? null) : null,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.timestamp,
  }));
}
