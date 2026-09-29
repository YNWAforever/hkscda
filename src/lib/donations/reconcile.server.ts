import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getReceiptBucket } from "./config.server";
import { isReceiptEligible } from "./domain";
import { buildReconciliationPlan } from "./reconciliation";
import { generateReceiptPdf } from "./receipt-pdf.server";
import { sendDonationAcknowledgement } from "./notifications.server";
import type { OnlinePaymentProvider } from "./contracts";
import type { DeliveryRunResult } from "./deliveryJobs.server";

export type ReconcileProviderArgs = {
  client: SupabaseClient;
  provider: OnlinePaymentProvider;
  providerRef: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
  // Payment id carried in provider metadata (Stripe metadata.payment_id /
  // PayPal custom_id). Used as a fallback when the provider_ref lookup misses —
  // e.g. the provider_ref write failed after checkout — so a genuinely paid
  // donation is reconciled instead of silently dropped.
  fallbackPaymentId?: string;
  // Signed settlement details supplied by the provider success webhook.
  providerSettlement?: { amountCents: number | null; currency: string | null };
};

type ReconcileManualArgs = {
  client: SupabaseClient;
  paymentId: string;
  actorUserId: string;
  bankReference: string;
  runDeliveryJob?: (jobId: string) => Promise<DeliveryRunResult>;
};

type PaymentWithDonation = {
  id: string;
  provider: string;
  provider_ref: string | null;
  amount_cents: number;
  status: string;
  donation: {
    id: string;
    amount_cents: number;
    refunded_cents?: number;
    receipt_requested: boolean;
    status: string;
    supporter_id: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    contact_language: "zh-HK" | "en" | null;
    supporter: {
      id: string;
      name: string;
      email: string;
      language: "zh-HK" | "en";
    };
  };
};

type ReceiptActionContext = {
  supporterId?: string;
};

type ReceiptPdfGenerator = (input: {
  receiptNo: string;
  donorName: string;
  amountCents: number;
  issuedAt: string;
}) => Promise<Uint8Array>;

// Injectable seams so the receipt path (PDF generation + clock) can be tested
// without a real font fetch or wall-clock. Production callers omit these and get
// the real implementations.
export type ReconcileDeps = {
  generatePdf?: ReceiptPdfGenerator;
  now?: () => Date;
  sendAcknowledgement?: typeof sendDonationAcknowledgement;
};

type ApplyOptions = {
  actorUserId?: string;
  bankReference?: string;
  deps?: ReconcileDeps;
  providerSettlement?: ReconcileProviderArgs["providerSettlement"];
};

const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export class WebhookEventInProgressError extends Error {
  constructor() {
    super("Webhook event is still processing");
    this.name = "WebhookEventInProgressError";
  }
}

async function reserveWebhookEvent(args: ReconcileProviderArgs) {
  const processingOwner = randomUUID();
  const now = new Date();
  const processingStartedAt = now.toISOString();
  const processingExpiresAt = new Date(now.getTime() + WEBHOOK_PROCESSING_LEASE_MS).toISOString();

  const { error } = await args.client.from("webhook_event").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    event_type: args.eventType,
    payload: args.payload,
    processing_started_at: processingStartedAt,
    processing_expires_at: processingExpiresAt,
    processing_owner: processingOwner,
  });

  if (!error) return { kind: "claimed" as const, processingOwner };
  if (error.code === "23505") {
    const { data, error: lookupError } = await args.client
      .from("webhook_event")
      .select("processed_at,processing_expires_at")
      .eq("provider", args.provider)
      .eq("provider_event_id", args.providerEventId)
      .single();
    if (lookupError) throw lookupError;
    if (data?.processed_at) return { kind: "duplicate" as const };

    const processingExpires = data?.processing_expires_at
      ? new Date(data.processing_expires_at).getTime()
      : 0;
    if (processingExpires > now.getTime()) throw new WebhookEventInProgressError();

    let claimQuery = args.client
      .from("webhook_event")
      .update({
        processing_started_at: processingStartedAt,
        processing_expires_at: processingExpiresAt,
        processing_owner: processingOwner,
      })
      .eq("provider", args.provider)
      .eq("provider_event_id", args.providerEventId)
      .is("processed_at", null);

    claimQuery = data?.processing_expires_at
      ? claimQuery.eq("processing_expires_at", data.processing_expires_at)
      : claimQuery.is("processing_expires_at", null);

    const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new WebhookEventInProgressError();
    return { kind: "claimed" as const, processingOwner };
  }
  throw error;
}

async function markWebhookEventProcessed(args: ReconcileProviderArgs, processingOwner: string) {
  const { data, error } = await args.client
    .from("webhook_event")
    .update({
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      processing_expires_at: null,
      processing_owner: null,
    })
    .eq("provider", args.provider)
    .eq("provider_event_id", args.providerEventId)
    .eq("processing_owner", processingOwner)
    .is("processed_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new WebhookEventInProgressError();
}

async function releaseWebhookEventReservation(
  args: ReconcileProviderArgs,
  processingOwner: string,
) {
  const { error } = await args.client
    .from("webhook_event")
    .update({
      processing_started_at: null,
      processing_expires_at: null,
      processing_owner: null,
    })
    .eq("provider", args.provider)
    .eq("provider_event_id", args.providerEventId)
    .eq("processing_owner", processingOwner)
    .is("processed_at", null);

  if (error) throw error;
}

const PAYMENT_WITH_DONATION_SELECT =
  "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,refunded_cents,receipt_requested,status,supporter_id,contact_name,contact_email,contact_phone,contact_language,supporter:supporter_id(id,name,email,language))";

async function findPaymentByProvider(
  client: SupabaseClient,
  provider: string,
  providerRef: string,
): Promise<PaymentWithDonation | null> {
  const { data, error } = await client
    .from("payment")
    .select(PAYMENT_WITH_DONATION_SELECT)
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as PaymentWithDonation | null) ?? null;
}

async function findPaymentById(
  client: SupabaseClient,
  paymentId: string,
): Promise<PaymentWithDonation> {
  const { data, error } = await client
    .from("payment")
    .select(PAYMENT_WITH_DONATION_SELECT)
    .eq("id", paymentId)
    .single();

  if (error) throw error;
  return data as unknown as PaymentWithDonation;
}

async function findPaymentByIdMaybe(
  client: SupabaseClient,
  paymentId: string,
): Promise<PaymentWithDonation | null> {
  const { data, error } = await client
    .from("payment")
    .select(PAYMENT_WITH_DONATION_SELECT)
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as PaymentWithDonation | null) ?? null;
}

// Allocate a receipt number and insert the receipt row atomically (via the
// private.issue_receipt RPC), then generate + store the PDF. The RPC is
// idempotent per donation: a retry after a PDF/storage failure returns the same
// committed receipt (no wasted sequence number) and we simply re-upload the PDF.
export async function issueReceiptIfNeeded(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  deps: ReconcileDeps = {},
  actorUserId?: string,
) {
  const donation = payment.donation;
  const now = deps.now ?? (() => new Date());
  const generatePdf = deps.generatePdf ?? generateReceiptPdf;

  const issuedAt = now().toISOString();
  const taxYear = new Date(issuedAt).getFullYear();

  const receiptParams = {
    p_donation_id: donation.id,
    p_supporter_id: donation.supporter_id,
    p_amount_cents: donation.amount_cents - (donation.refunded_cents ?? 0),
    p_tax_year: taxYear,
    p_issued_at: issuedAt,
  };
  const { data, error } = await client.rpc(
    actorUserId ? "issue_receipt_with_audit" : "issue_receipt",
    actorUserId ? { ...receiptParams, p_actor: actorUserId } : receiptParams,
  );
  if (error) throw error;

  const receipt = (Array.isArray(data) ? data[0] : data) as
    | {
        receipt_no: string;
        receipt_id: string;
        pdf_url: string | null;
        tax_year: number;
        issued_at: string;
      }
    | undefined;
  if (!receipt?.receipt_no) {
    throw new Error("issue_receipt did not return a receipt number");
  }

  // Generate + store the PDF when it is missing: either a brand-new receipt, or
  // a prior attempt that committed the row but failed before storing the PDF.
  // upsert overwrites any partial object; the receipt number is fixed regardless
  // of how many times this runs.
  if (!receipt.pdf_url) {
    const path = `${receipt.tax_year}/${receipt.receipt_no}.pdf`;
    const pdf = await generatePdf({
      receiptNo: receipt.receipt_no,
      donorName: donation.contact_name ?? donation.supporter.name,
      amountCents: donation.amount_cents - (donation.refunded_cents ?? 0),
      issuedAt: receipt.issued_at ?? issuedAt,
    });
    const { error: uploadError } = await client.storage
      .from(getReceiptBucket())
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    const { error: patchError } = await client
      .from("receipt")
      .update({ pdf_url: path })
      .eq("id", receipt.receipt_id);
    if (patchError) throw patchError;
  }

  return receipt.receipt_no;
}

// Both side effects are idempotent: issue_receipt is idempotent per donation
// (private RPC), and sendDonationAcknowledgement atomically claims a unique
// message row before sending. So this is safe to run on the duplicate-replay
// branch as a recovery for a first attempt that failed mid-way.
export async function completeDonationSideEffects(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  deps: ReconcileDeps = {},
) {
  const donation = payment.donation;
  const receiptNo = isReceiptEligible({
    amountCents: donation.amount_cents - (donation.refunded_cents ?? 0),
    receiptRequested: donation.receipt_requested,
  })
    ? await issueReceiptIfNeeded(client, payment, deps)
    : undefined;

  const acknowledgement = await (deps.sendAcknowledgement ?? sendDonationAcknowledgement)(client, {
    supporterId: donation.supporter_id,
    donationId: donation.id,
    to: donation.contact_email ?? donation.supporter.email,
    donorName: donation.contact_name ?? donation.supporter.name,
    amountCents: donation.amount_cents - (donation.refunded_cents ?? 0),
    language: donation.contact_language ?? donation.supporter.language,
    receiptNo,
  });
  if (acknowledgement === "failed") {
    throw new Error("Donation acknowledgement delivery failed");
  }

  return receiptNo;
}

async function applySucceededPayment(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  options: ApplyOptions = {},
) {
  const deps = options.deps ?? {};

  // An amount mismatch is a permanent (poison) condition: retrying will never
  // reconcile it. Throwing here would propagate before the webhook event is
  // marked processed, so the provider would retry forever and the genuinely
  // paid donation would stay stuck pending. Instead, flag it for manual review
  // and return a terminal result so the event is acknowledged (200) and the
  // payment is NOT credited.
  if (payment.amount_cents !== payment.donation.amount_cents) {
    const { error: auditError } = await client.from("audit_log").insert({
      actor_user_id: options.actorUserId ?? null,
      action: "payment.amount_mismatch",
      entity: "payment",
      entity_id: payment.id,
      detail: {
        donationId: payment.donation.id,
        expectedCents: payment.donation.amount_cents,
        actualCents: payment.amount_cents,
      },
    });
    if (auditError) throw auditError;
    return {
      kind: "amount_mismatch" as const,
      donationId: payment.donation.id,
      paymentId: payment.id,
      expectedCents: payment.donation.amount_cents,
      actualCents: payment.amount_cents,
    };
  }

  if (options.providerSettlement) {
    const { amountCents, currency } = options.providerSettlement;
    if (
      typeof amountCents !== "number" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents !== payment.amount_cents ||
      currency?.toUpperCase() !== "HKD"
    ) {
      const { error: auditError } = await client.from("audit_log").insert({
        actor_user_id: null,
        action: "payment.provider_settlement_mismatch",
        entity: "payment",
        entity_id: payment.id,
        detail: {
          donationId: payment.donation.id,
          expectedCents: payment.amount_cents,
          actualCents: amountCents,
          expectedCurrency: "HKD",
          actualCurrency: currency,
        },
      });
      if (auditError) throw auditError;
      return {
        kind: "provider_settlement_mismatch" as const,
        donationId: payment.donation.id,
        paymentId: payment.id,
      };
    }
  }

  const plan = buildReconciliationPlan({
    providerEventId: payment.provider_ref ?? payment.id,
    seenProviderEventIds: new Set(),
    donation: payment.donation,
    payment,
  });

  if (plan.kind === "duplicate") {
    try {
      await completeDonationSideEffects(client, payment, deps);
    } catch {
      // A successful payment has its own durable delivery job. Provider replay
      // is not the receipt/email retry mechanism.
      return { kind: "duplicate" as const, donationId: payment.donation.id, deliveryPending: true };
    }
    return { kind: "duplicate" as const, donationId: payment.donation.id };
  }

  // A refunded/failed donation or payment must not be resurrected to succeeded.
  if (plan.kind === "skip") {
    return { kind: "skipped" as const, donationId: payment.donation.id, reason: plan.reason };
  }

  const receivedAt = (deps.now ?? (() => new Date()))().toISOString();

  const handleTransitionMiss = async () => {
    const current = await findPaymentByIdMaybe(client, payment.id);
    if (
      current &&
      (current.status === "refunded" ||
        current.status === "failed" ||
        current.donation.status === "refunded" ||
        current.donation.status === "failed")
    ) {
      return {
        kind: "skipped" as const,
        donationId: current.donation.id,
        reason: "terminal_status" as const,
      };
    }
    if (current?.status === "succeeded" && current.donation.status === "succeeded") {
      return {
        kind: "skipped" as const,
        donationId: current.donation.id,
        reason: "concurrent_succeeded" as const,
      };
    }

    const { error } = await client.from("audit_log").insert({
      actor_user_id: options.actorUserId ?? null,
      action: "payment.reconcile_state_conflict",
      entity: "payment",
      entity_id: payment.id,
      detail: {
        donationId: payment.donation.id,
        paymentStatus: current?.status ?? null,
        donationStatus: current?.donation.status ?? null,
      },
    });
    if (error) throw error;
    // Keep the provider event retryable: returning here would mark the event
    // processed while payment and donation still disagree.
    throw new Error("Payment reconciliation state conflict");
  };

  // Guard every transition on the source status so a replayed event can never
  // overwrite a terminal (refunded/failed) row even if the read raced ahead.
  let paymentTransitioned = payment.status === "succeeded";
  if (!paymentTransitioned) {
    const { data: updatedPayment, error: paymentError } = await client
      .from("payment")
      .update({
        status: plan.paymentStatus,
        received_at: receivedAt,
        reconciled_by: options.actorUserId ?? null,
        bank_reference: options.bankReference ?? null,
      })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (paymentError) throw paymentError;
    paymentTransitioned = Boolean(updatedPayment);
  }
  if (!paymentTransitioned) return handleTransitionMiss();

  let donationTransitioned = payment.donation.status === "succeeded";
  if (!donationTransitioned) {
    const { data: updatedDonation, error: donationError } = await client
      .from("donation")
      .update({ status: plan.donationStatus })
      .eq("id", payment.donation.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (donationError) throw donationError;
    donationTransitioned = Boolean(updatedDonation);
  }
  if (!donationTransitioned) return handleTransitionMiss();

  try {
    const receiptNo = await completeDonationSideEffects(client, payment, deps);
    return { kind: "applied" as const, donationId: payment.donation.id, receiptNo };
  } catch {
    // The succeeded donation transition queued durable delivery in its database
    // transaction. PDF/email failure cannot reverse payment or reject the webhook.
    return { kind: "applied" as const, donationId: payment.donation.id, deliveryPending: true };
  }
}

async function processProviderWebhook<T>(
  args: ReconcileProviderArgs,
  apply: (payment: PaymentWithDonation) => Promise<T>,
  onNotFound?: () => Promise<void>,
): Promise<
  | T
  | { kind: "duplicate" }
  | { kind: "not_found" }
  | { kind: "provider_ref_mismatch"; donationId: string; paymentId: string }
> {
  const reservation = await reserveWebhookEvent(args);
  if (reservation.kind === "duplicate") return { kind: "duplicate" as const };

  try {
    let payment = await findPaymentByProvider(args.client, args.provider, args.providerRef);

    // Fallback: the provider_ref lookup missed (e.g. provider_ref was never
    // persisted). Match the payment id from provider metadata so a real paid
    // donation isn't lost, then backfill provider_ref for future events.
    if (!payment && args.fallbackPaymentId) {
      const candidate = await findPaymentByIdMaybe(args.client, args.fallbackPaymentId);
      if (candidate && candidate.provider === args.provider) {
        if (
          candidate.provider_ref &&
          args.providerRef &&
          candidate.provider_ref !== args.providerRef
        ) {
          const { error: auditError } = await args.client.from("audit_log").insert({
            actor_user_id: null,
            action: "payment.provider_ref_mismatch",
            entity: "payment",
            entity_id: candidate.id,
            detail: {
              donationId: candidate.donation.id,
              provider: args.provider,
              providerEventId: args.providerEventId,
              expectedProviderRef: candidate.provider_ref,
              actualProviderRef: args.providerRef,
            },
          });
          if (auditError) throw auditError;
          await markWebhookEventProcessed(args, reservation.processingOwner);
          return {
            kind: "provider_ref_mismatch" as const,
            donationId: candidate.donation.id,
            paymentId: candidate.id,
          };
        }
        payment = candidate;
        if (!payment.provider_ref && args.providerRef) {
          const { data: backfilled, error } = await args.client
            .from("payment")
            .update({ provider_ref: args.providerRef })
            .eq("id", payment.id)
            .is("provider_ref", null)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!backfilled) throw new Error("Payment provider reference backfill lost a race");
          payment.provider_ref = args.providerRef;
        }
      }
    }

    if (!payment) {
      // The event verified but references a payment we don't have. Retrying will
      // never succeed, so mark it processed to stop the provider's retry storm.
      // The caller surfaces this so the route can return 200 (acknowledged).
      await onNotFound?.();
      await markWebhookEventProcessed(args, reservation.processingOwner);
      return { kind: "not_found" as const };
    }

    const result = await apply(payment);
    // The mutations + side effects are already committed. If marking the event
    // processed fails now, do NOT 500 (which would make the provider retry and
    // re-run everything). The work is idempotent, so log and acknowledge; a
    // future redelivery re-claims the still-unprocessed event and no-ops.
    try {
      await markWebhookEventProcessed(args, reservation.processingOwner);
    } catch (markError) {
      console.error(
        "Failed to mark webhook event processed after applying; side effects already committed",
        markError,
      );
    }
    return result;
  } catch (error) {
    try {
      await releaseWebhookEventReservation(args, reservation.processingOwner);
    } catch {
      console.error("Failed to release webhook reservation after processing error");
    }
    throw error;
  }
}

export async function reconcileProviderPayment(
  args: ReconcileProviderArgs,
  deps: ReconcileDeps = {},
) {
  return processProviderWebhook(args, (payment) =>
    applySucceededPayment(args.client, payment, {
      deps,
      providerSettlement: args.providerSettlement,
    }),
  );
}

// Run a side-effectful capture (PayPal CHECKOUT.ORDER.APPROVED) behind the same
// webhook-event reservation as reconcile, so a redelivered approval event is
// detected as a duplicate BEFORE the external capture call instead of relying
// on the provider swallowing an "already captured" error.
export async function processCaptureWebhook(
  args: ReconcileProviderArgs,
  capture: () => Promise<void>,
): Promise<{ kind: "captured" } | { kind: "duplicate" }> {
  const reservation = await reserveWebhookEvent(args);
  if (reservation.kind === "duplicate") return { kind: "duplicate" as const };

  try {
    await capture();
  } catch (error) {
    try {
      await releaseWebhookEventReservation(args, reservation.processingOwner);
    } catch {
      console.error("Failed to release capture webhook reservation after capture error");
    }
    throw error;
  }

  try {
    await markWebhookEventProcessed(args, reservation.processingOwner);
  } catch (markError) {
    console.error("Failed to mark capture webhook processed; capture already completed", markError);
  }
  return { kind: "captured" as const };
}

// Run the post-success side effects (tax receipt + acknowledgement) for a
// payment that was created already-succeeded — e.g. a manually recorded offline
// gift — so it gets the same receipt + acknowledgement as a reconciled online
// gift instead of silently getting neither.
export async function issueManualDonationSideEffects(
  client: SupabaseClient,
  paymentId: string,
  deps: ReconcileDeps = {},
) {
  const payment = await findPaymentById(client, paymentId);
  return completeDonationSideEffects(client, payment, deps);
}

export async function retrySucceededDonationSideEffects(
  client: SupabaseClient,
  paymentId: string,
  deps: ReconcileDeps = {},
) {
  const payment = await findPaymentById(client, paymentId);
  if (payment.status !== "succeeded" || payment.donation.status !== "succeeded") {
    throw new Error("Donation side effects can only be retried after successful reconciliation");
  }
  return completeDonationSideEffects(client, payment, deps);
}

async function auditUnmatchedFinancialEvent(
  args: ReconcileProviderArgs,
  action: "payment.denial_unreconciled" | "payment.refund_unreconciled",
) {
  const { error } = await args.client.from("audit_log").insert({
    actor_user_id: null,
    action,
    entity: "payment",
    entity_id: args.providerRef || args.fallbackPaymentId || args.providerEventId,
    detail: {
      provider: args.provider,
      providerRef: args.providerRef || null,
      fallbackPaymentId: args.fallbackPaymentId ?? null,
      providerEventId: args.providerEventId,
    },
  });
  if (error) throw error;
}
export async function failProviderPayment(args: ReconcileProviderArgs) {
  return processProviderWebhook(
    args,
    async (payment) => {
      const { data, error } = await args.client.rpc("fail_pending_provider_payment", {
        p_payment_id: payment.id,
        p_donation_id: payment.donation.id,
      });
      if (error) throw error;

      const outcome = data as {
        kind?: string;
        payment_status?: string;
        donation_status?: string;
      } | null;
      if (outcome?.kind === "failed" || outcome?.kind === "already_failed") {
        return { kind: "failed" as const, donationId: payment.donation.id };
      }
      if (outcome?.kind === "state_conflict" || outcome?.kind === "not_found") {
        const { error: auditError } = await args.client.from("audit_log").insert({
          actor_user_id: null,
          action: "payment.denial_state_conflict",
          entity: "payment",
          entity_id: payment.id,
          detail: {
            provider: args.provider,
            providerEventId: args.providerEventId,
            donationId: payment.donation.id,
            reason: outcome.kind,
            paymentStatus: outcome.payment_status ?? null,
            donationStatus: outcome.donation_status ?? null,
          },
        });
        if (auditError) throw auditError;
        return {
          kind: "manual_review" as const,
          reason: outcome.kind,
          donationId: payment.donation.id,
          paymentId: payment.id,
        };
      }
      throw new Error("Provider denial transition returned an invalid result");
    },
    () => auditUnmatchedFinancialEvent(args, "payment.denial_unreconciled"),
  );
}

export async function refundProviderPayment(args: ReconcileProviderArgs) {
  return processProviderWebhook(
    args,
    async (payment) => {
      const { data, error } = await args.client.rpc("refund_provider_payment_atomically", {
        p_payment_id: payment.id,
        p_donation_id: payment.donation.id,
      });
      if (error) throw error;

      const outcome = data as {
        kind?: string;
        payment_status?: string;
        donation_status?: string;
      } | null;
      if (outcome?.kind === "refunded" || outcome?.kind === "already_refunded") {
        await voidIssuedReceiptsForDonation(args.client, payment.donation.id, { reason: "refund" });
        return { kind: "refunded" as const, donationId: payment.donation.id };
      }
      if (outcome?.kind === "state_conflict" || outcome?.kind === "not_found") {
        const { error: auditError } = await args.client.from("audit_log").insert({
          actor_user_id: null,
          action: "payment.refund_state_conflict",
          entity: "payment",
          entity_id: payment.id,
          detail: {
            provider: args.provider,
            providerEventId: args.providerEventId,
            donationId: payment.donation.id,
            reason: outcome.kind,
            paymentStatus: outcome.payment_status ?? null,
            donationStatus: outcome.donation_status ?? null,
          },
        });
        if (auditError) throw auditError;

        // The provider says funds were returned even if local rows need review.
        await voidIssuedReceiptsForDonation(args.client, payment.donation.id, { reason: "refund" });
        return {
          kind: "manual_review" as const,
          reason: "state_transition_conflict" as const,
          donationId: payment.donation.id,
          paymentId: payment.id,
        };
      }
      throw new Error("Provider refund transition returned an invalid result");
    },
    () => auditUnmatchedFinancialEvent(args, "payment.refund_unreconciled"),
  );
}
export async function flagProviderWebhookForReview(
  args: ReconcileProviderArgs,
  review: { reason: string; detail?: Record<string, unknown> },
) {
  const insertAudit = async (entityId: string, donationId?: string) => {
    const { error } = await args.client.from("audit_log").insert({
      actor_user_id: null,
      action:
        args.provider === "cod" ? "payment.cod_manual_review" : "payment.provider_manual_review",
      entity: "payment",
      entity_id: entityId,
      detail: {
        provider: args.provider,
        providerEventId: args.providerEventId,
        reason: review.reason,
        donationId: donationId ?? null,
        ...(review.detail ?? {}),
      },
    });
    if (error) throw error;
  };

  return processProviderWebhook(
    args,
    async (payment) => {
      await insertAudit(payment.id, payment.donation.id);
      return {
        kind: "manual_review" as const,
        paymentId: payment.id,
        donationId: payment.donation.id,
      };
    },
    () => insertAudit(args.providerRef || args.providerEventId),
  );
}

export async function reconcileManualPayment(args: ReconcileManualArgs) {
  // The RPC locks payment/donation, reserves the normalized bank reference and
  // writes the financial audit in one transaction. PDF/email delivery follows
  // the committed payment and can be retried independently.
  const { data, error } = await args.client.rpc("reconcile_manual_payment_atomic", {
    p_actor: args.actorUserId,
    p_payment: args.paymentId,
    p_reference: args.bankReference,
  });
  if (error) {
    if (error.code === "23505")
      throw Response.json({ error: "Bank reference has already been credited" }, { status: 409 });
    if (error.code === "42501") throw Response.json({ error: "Access denied" }, { status: 403 });
    if (error.code === "22023")
      throw Response.json({ error: "Invalid bank reference" }, { status: 400 });
    throw error;
  }
  const result = (Array.isArray(data) ? data[0] : data) as {
    kind: "applied" | "state_conflict" | "amount_mismatch" | "provider_denied" | "not_found";
    donationId?: string;
    deliveryJobId?: string;
    expectedCents?: number;
    actualCents?: number;
    paymentStatus?: string;
    donationStatus?: string;
  } | null;
  if (!result) throw new Error("Manual reconciliation returned no result");
  if (result.kind === "state_conflict")
    throw Response.json(
      { error: "Payment is not pending and cannot be reconciled", status: result.paymentStatus },
      { status: 409 },
    );
  if (result.kind === "amount_mismatch")
    throw Response.json(
      {
        error: "Payment amount does not match the donation amount",
        expectedCents: result.expectedCents,
        actualCents: result.actualCents,
      },
      { status: 422 },
    );
  if (result.kind === "provider_denied")
    throw Response.json({ error: "Provider requires its signed settlement path" }, { status: 422 });
  if (result.kind === "not_found")
    throw Response.json({ error: "Payment not found" }, { status: 404 });
  if (result.kind !== "applied" || !result.donationId || !result.deliveryJobId)
    throw new Error("Unexpected manual reconciliation result");

  let deliveryStatus: "pending" | "processing" | "retryable" | "attention_required" | "complete" =
    "pending";
  try {
    if (args.runDeliveryJob) {
      const delivery = await args.runDeliveryJob(result.deliveryJobId);
      deliveryStatus = delivery.kind === "busy" ? "processing" : delivery.kind;
    }
  } catch {
    // The durable job committed with the money/audit. An attempt failure is a
    // delivery concern, never a reason to retry the bank credit.
    console.error("Manual payment committed; delivery job needs recovery");
  }
  return {
    kind: "applied" as const,
    donationId: result.donationId,
    deliveryJobId: result.deliveryJobId,
    deliveryStatus,
  };
}

export async function issueReceiptForDonation(
  client: SupabaseClient,
  donationId: string,
  actorUserId: string,
  context: ReceiptActionContext = {},
  deps: ReconcileDeps = {},
) {
  const { data, error } = await client
    .from("payment")
    .select(PAYMENT_WITH_DONATION_SELECT)
    .eq("donation_id", donationId)
    .eq("status", "succeeded")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // No (yet) succeeded payment for this donation — an expected operator state
    // (e.g. issuing before reconcile completes), not a server fault.
    throw Response.json({ error: "No succeeded payment for this donation" }, { status: 409 });
  }

  const payment = data as unknown as PaymentWithDonation;
  if (
    !isReceiptEligible({
      amountCents: payment.donation.amount_cents - (payment.donation.refunded_cents ?? 0),
      receiptRequested: payment.donation.receipt_requested,
    })
  ) {
    throw Response.json({ error: "Donation is not eligible for an IRD receipt" }, { status: 422 });
  }

  if (context.supporterId && context.supporterId !== payment.donation.supporter_id) {
    throw Response.json({ error: "Supporter does not match donation" }, { status: 422 });
  }

  const receiptNo = await issueReceiptIfNeeded(client, payment, deps, actorUserId);
  return { receiptNo };
}

async function removeReceiptPdf(client: SupabaseClient, pdfUrl: string | null | undefined) {
  if (!pdfUrl) return;
  // Best-effort: the authoritative state is the row's status='void'. A storage
  // error (object already gone, transient) is logged but must not leave the
  // receipt stuck as issued.
  const { error } = await client.storage.from(getReceiptBucket()).remove([pdfUrl]);
  if (error) {
    console.error("Failed to remove voided receipt PDF from storage", error);
  }
}

async function voidIssuedReceiptsForDonation(
  client: SupabaseClient,
  donationId: string,
  options: { reason?: string } = {},
) {
  const { data, error } = await client.rpc("void_donation_receipts_with_audit", {
    p_donation_id: donationId,
    p_reason: options.reason ?? "refund",
  });
  if (error) throw error;
  for (const receipt of (data ?? []) as Array<{ receipt_id: string; pdf_url: string | null }>) {
    await removeReceiptPdf(client, receipt.pdf_url);
  }
}

export async function voidReceipt(
  client: SupabaseClient,
  receiptId: string,
  actorUserId: string,
  context: ReceiptActionContext = {},
) {
  const { data, error } = await client.rpc("void_receipt_with_audit", {
    p_receipt_id: receiptId,
    p_actor: actorUserId,
    p_supporter_id: context.supporterId ?? null,
  });
  if (error) throw error;
  const row = (data as Array<{ receipt_id: string; pdf_url: string | null }> | null)?.[0];
  if (!row) throw new Error("Receipt not found or already voided");

  await removeReceiptPdf(client, row.pdf_url);
  return { receiptId: row.receipt_id, status: "void" as const };
}
