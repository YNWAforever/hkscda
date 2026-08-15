import type { SupabaseClient } from "@supabase/supabase-js";

import { createCodClient } from "./cod-client.server";
import { reconcileProviderPayment, type ReconcileProviderArgs } from "./reconcile.server";

type PendingCodPayment = {
  id: string;
  provider_ref: string | null;
};

type RefreshDependencies = {
  donationId: string;
  client: SupabaseClient;
  createClient?: () => Pick<ReturnType<typeof createCodClient>, "refreshTransactionStatus">;
  reconcile?: (args: ReconcileProviderArgs) => Promise<unknown>;
};

export async function refreshPendingCodDonation({
  donationId,
  client,
  createClient = () => createCodClient(),
  reconcile = reconcileProviderPayment,
}: RefreshDependencies) {
  const { data, error } = await client
    .from("payment")
    .select("id,provider_ref")
    .eq("donation_id", donationId)
    .eq("provider", "cod")
    .eq("status", "pending")
    .maybeSingle<PendingCodPayment>();
  if (error) throw error;
  if (!data?.provider_ref) return { kind: "not_applicable" as const };

  let providerStatus;
  try {
    ({ status: providerStatus } = await createClient().refreshTransactionStatus({
      outTradeNo: data.provider_ref,
    }));
  } catch {
    return { kind: "pending" as const, providerStatus: "unavailable" as const };
  }

  if (providerStatus !== "paid") {
    return { kind: "pending" as const, providerStatus };
  }

  const result = await reconcile({
    client,
    provider: "cod",
    providerRef: data.provider_ref,
    providerEventId: `refresh:${data.provider_ref}:${providerStatus}`,
    eventType: `refresh_transaction_status.${providerStatus}`,
    payload: {
      source: "status_refresh",
      status: providerStatus,
      providerRef: data.provider_ref,
    },
  });
  return { kind: "reconciled" as const, result };
}
