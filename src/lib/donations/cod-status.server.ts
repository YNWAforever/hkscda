import type { SupabaseClient } from "@supabase/supabase-js";

import { createCodClient, type CodOrderDetails } from "./cod-client.server";
import { getCodConfig, type CodConfig } from "./config.server";
import {
  reconcileProviderPayment,
  retrySucceededDonationSideEffects,
  type ReconcileProviderArgs,
} from "./reconcile.server";

type CodPayment = {
  id: string;
  provider_ref: string | null;
  provider_order_ref: string | null;
  amount_cents: number;
  status: "pending" | "succeeded";
};

type CodStatusClient = Pick<
  ReturnType<typeof createCodClient>,
  "refreshTransactionStatus" | "getOrderDetails"
>;

type RefreshDependencies = {
  donationId: string;
  client: SupabaseClient;
  config?: Pick<CodConfig, "merchantId" | "segmentId">;
  createClient?: () => CodStatusClient;
  reconcile?: (args: ReconcileProviderArgs) => Promise<unknown>;
  recoverSideEffects?: (client: SupabaseClient, paymentId: string) => Promise<unknown>;
};

function amountMatchesCents(amount: number, expectedCents: number) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const scaled = amount * 100;
  return Number.isSafeInteger(expectedCents) && Math.abs(scaled - expectedCents) < 1e-7;
}

function matchesLocalPayment(
  details: CodOrderDetails,
  payment: CodPayment,
  config: Pick<CodConfig, "merchantId" | "segmentId">,
) {
  return (
    details.merchantId === config.merchantId &&
    details.segmentId === config.segmentId &&
    details.currency === "HKD" &&
    details.wallet === "ALIPAYHK" &&
    details.type === "payment" &&
    details.status === "paid" &&
    details.outTradeNo === payment.provider_ref &&
    details.orderRef === payment.provider_order_ref &&
    amountMatchesCents(details.amount, payment.amount_cents) &&
    details.transactionId.length > 0
  );
}

export async function refreshPendingCodDonation({
  donationId,
  client,
  config,
  createClient = () => createCodClient(),
  reconcile = reconcileProviderPayment,
  recoverSideEffects = retrySucceededDonationSideEffects,
}: RefreshDependencies) {
  const { data, error } = await client
    .from("payment")
    .select("id,provider_ref,provider_order_ref,amount_cents,status")
    .eq("donation_id", donationId)
    .eq("provider", "cod")
    .in("status", ["pending", "succeeded"])
    .maybeSingle<CodPayment>();
  if (error) throw error;
  if (!data) return { kind: "not_applicable" as const };

  // A prior reconciliation may have committed the terminal rows before its
  // receipt/email work failed. Re-run those idempotent effects on every public
  // status check until they complete.
  if (data.status === "succeeded") {
    await recoverSideEffects(client, data.id);
    return { kind: "recovered" as const };
  }

  // COD does not support transaction_details by out_trade_no. Without the
  // merchant order_ref persisted at checkout there is no supported, fully
  // bound details lookup, so fail closed rather than crediting status-only.
  if (!data.provider_ref || !data.provider_order_ref) {
    return { kind: "not_applicable" as const };
  }

  let providerStatus;
  let details: CodOrderDetails;
  try {
    const codClient = createClient();
    ({ status: providerStatus } = await codClient.refreshTransactionStatus({
      outTradeNo: data.provider_ref,
    }));
    if (providerStatus !== "paid") {
      return { kind: "pending" as const, providerStatus };
    }
    details = await codClient.getOrderDetails({ orderRef: data.provider_order_ref });
  } catch {
    return { kind: "pending" as const, providerStatus: "unavailable" as const };
  }

  const providerConfig = config ?? getCodConfig();
  if (!matchesLocalPayment(details, data, providerConfig)) {
    return { kind: "pending" as const, providerStatus: "details_mismatch" as const };
  }

  const result = await reconcile({
    client,
    provider: "cod",
    providerRef: data.provider_ref,
    providerEventId: `refresh:${details.transactionId}:${details.outTradeNo}:${details.status}`,
    eventType: `order_details.${details.status}`,
    payload: {
      source: "status_refresh",
      transactionId: details.transactionId,
      outTradeNo: details.outTradeNo,
      orderRef: details.orderRef,
      status: details.status,
      amount: details.amount,
      currency: details.currency,
      wallet: details.wallet,
      type: details.type,
      merchantId: details.merchantId,
      segmentId: details.segmentId,
    },
  });
  return { kind: "reconciled" as const, result };
}
