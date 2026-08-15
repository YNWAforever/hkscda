import type { SupabaseClient } from "@supabase/supabase-js";

import type { CodConfig } from "./config.server";
import { decodeBase64Strict, verifyRsaSha256 } from "./cod-crypto.server";
import {
  flagProviderWebhookForReview,
  reconcileProviderPayment,
  refundProviderPayment,
  type ReconcileProviderArgs,
} from "./reconcile.server";

export type CodNotificationErrorCode = "invalid_envelope" | "invalid_signature" | "malformed_data";

export class CodNotificationError extends Error {
  constructor(public readonly code: CodNotificationErrorCode) {
    super(`COD notification ${code.replaceAll("_", " ")}`);
    this.name = "CodNotificationError";
  }
}

type CodNotificationConfig = Pick<CodConfig, "merchantId" | "segmentId" | "notificationPublicKey">;

type CodNotificationEnvelope = {
  data: string;
  signature: string;
  algorithm: "rsa-sha256";
};

type CodNotificationBase = {
  transactionId: string;
  amountCents: number;
  amount: number;
  providerRef: string;
  type: string;
  status: string;
  eventId: string;
};

export type CodNotificationAction =
  | (CodNotificationBase & { kind: "payment"; type: "payment"; status: "paid" })
  | (CodNotificationBase & {
      kind: "refund";
      type: "refund";
      status: "paid";
      outReturnNo: string;
    })
  | (CodNotificationBase & { kind: "manual_review"; reason: string });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseAmountCents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return null;
  const cents = value * 100;
  if (!Number.isSafeInteger(Math.round(cents)) || Math.abs(cents - Math.round(cents)) > 1e-7) {
    return null;
  }
  return Math.abs(Math.round(cents));
}

function parseEnvelope(value: unknown): CodNotificationEnvelope {
  if (!isRecord(value)) throw new CodNotificationError("invalid_envelope");
  if (
    typeof value.data !== "string" ||
    typeof value.signature !== "string" ||
    value.algorithm !== "rsa-sha256"
  ) {
    throw new CodNotificationError("invalid_envelope");
  }
  return value as CodNotificationEnvelope;
}

export function parseCodNotificationEnvelope(
  value: unknown,
  config: CodNotificationConfig,
): CodNotificationAction {
  const envelope = parseEnvelope(value);

  let signature: Buffer;
  try {
    signature = decodeBase64Strict(envelope.signature, "COD notification signature");
  } catch {
    throw new CodNotificationError("invalid_signature");
  }
  if (
    !verifyRsaSha256(Buffer.from(envelope.data, "utf8"), signature, config.notificationPublicKey)
  ) {
    throw new CodNotificationError("invalid_signature");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(envelope.data);
  } catch {
    throw new CodNotificationError("malformed_data");
  }
  if (!isRecord(decoded)) throw new CodNotificationError("malformed_data");

  const transactionId = requiredString(decoded.transaction_id);
  const currency = requiredString(decoded.currency);
  const merchantId = requiredString(decoded.merchant_id);
  const segmentId = requiredString(decoded.segment_id);
  const providerRef = requiredString(decoded.out_trade_no);
  const type = requiredString(decoded.type);
  const status = requiredString(decoded.status);
  const amountCents = parseAmountCents(decoded.amount);
  if (
    !transactionId ||
    !currency ||
    !merchantId ||
    !segmentId ||
    !providerRef ||
    !type ||
    !status ||
    amountCents === null
  ) {
    throw new CodNotificationError("malformed_data");
  }
  if (decoded.wallet !== undefined && typeof decoded.wallet !== "string") {
    throw new CodNotificationError("malformed_data");
  }

  const amount = decoded.amount as number;
  const base: CodNotificationBase = {
    transactionId,
    amountCents,
    amount,
    providerRef,
    type,
    status,
    eventId: `${transactionId}:${type}:${status}:${amount}`,
  };
  const mismatch =
    merchantId !== config.merchantId
      ? "merchant_mismatch"
      : segmentId !== config.segmentId
        ? "segment_mismatch"
        : currency !== "HKD"
          ? "currency_mismatch"
          : decoded.wallet !== undefined && decoded.wallet !== "ALIPAYHK"
            ? "wallet_mismatch"
            : type !== "payment" && type !== "refund"
              ? "type_mismatch"
              : status !== "paid"
                ? "status_mismatch"
                : type === "payment" && amount < 0
                  ? "amount_sign_mismatch"
                  : type === "refund" && amount > 0
                    ? "amount_sign_mismatch"
                    : null;
  if (mismatch) return { ...base, kind: "manual_review", reason: mismatch };

  if (type === "refund") {
    const outReturnNo = requiredString(decoded.out_return_no);
    if (!outReturnNo) throw new CodNotificationError("malformed_data");
    return { ...base, kind: "refund", type, status: "paid", outReturnNo };
  }
  return { ...base, kind: "payment", type: "payment", status: "paid" };
}

type CodPayment = {
  id: string;
  amount_cents: number;
  provider_ref: string | null;
};

type ProcessDependencies = {
  envelope: unknown;
  config: CodNotificationConfig;
  client: SupabaseClient;
  reconcile?: (args: ReconcileProviderArgs) => Promise<unknown>;
  refund?: (args: ReconcileProviderArgs) => Promise<unknown>;
  flagForReview?: (
    args: ReconcileProviderArgs,
    review: { reason: string; detail?: Record<string, unknown> },
  ) => Promise<unknown>;
};

function safePayload(action: CodNotificationAction) {
  return {
    transactionId: action.transactionId,
    providerRef: action.providerRef,
    type: action.type,
    status: action.status,
    amountCents: action.amountCents,
  };
}

export async function processCodNotification({
  envelope,
  config,
  client,
  reconcile = reconcileProviderPayment,
  refund = refundProviderPayment,
  flagForReview = flagProviderWebhookForReview,
}: ProcessDependencies) {
  const action = parseCodNotificationEnvelope(envelope, config);
  const providerArgs = {
    client,
    provider: "cod" as const,
    providerRef: action.providerRef,
    providerEventId: action.eventId,
    eventType: `${action.type}.${action.status}`,
    payload: safePayload(action),
  };

  if (action.kind === "manual_review") {
    return flagForReview(providerArgs, { reason: action.reason, detail: safePayload(action) });
  }

  const { data, error } = await client
    .from("payment")
    .select("id,amount_cents,provider_ref")
    .eq("provider", "cod")
    .eq("provider_ref", action.providerRef)
    .maybeSingle<CodPayment>();
  if (error) throw error;

  if (!data) {
    return flagForReview(providerArgs, {
      reason: "payment_not_found",
      detail: safePayload(action),
    });
  }

  if (action.kind === "payment") {
    if (action.amountCents !== data.amount_cents) {
      return flagForReview(providerArgs, {
        reason: "amount_mismatch",
        detail: { expectedCents: data.amount_cents, actualCents: action.amountCents },
      });
    }
    return reconcile(providerArgs);
  }

  if (action.amountCents !== data.amount_cents) {
    return flagForReview(providerArgs, {
      reason: action.amountCents < data.amount_cents ? "partial_refund" : "refund_amount_mismatch",
      detail: { expectedCents: data.amount_cents, actualCents: action.amountCents },
    });
  }
  return refund(providerArgs);
}
