import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getReceiptBucket } from "./config.server";
import { isReceiptEligible } from "./domain";
import { buildReconciliationPlan } from "./reconciliation";
import { generateReceiptPdf } from "./receipt-pdf.server";
import { sendDonationAcknowledgement } from "./notifications.server";

type ReconcileProviderArgs = {
  client: SupabaseClient;
  provider: "stripe" | "paypal";
  providerRef: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
  // Payment id carried in provider metadata (Stripe metadata.payment_id /
  // PayPal custom_id). Used as a fallback when the provider_ref lookup misses —
  // e.g. the provider_ref write failed after checkout — so a genuinely paid
  // donation is reconciled instead of silently dropped.
  fallbackPaymentId?: string;
};

type ReconcileManualArgs = {
  client: SupabaseClient;
  paymentId: string;
  actorUserId: string;
  bankReference: string;
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
    receipt_requested: boolean;
    status: string;
    supporter_id: string;
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
};

type ApplyOptions = {
  actorUserId?: string;
  bankReference?: string;
  deps?: ReconcileDeps;
};

const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

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
    if (processingExpires > now.getTime()) return { kind: "duplicate" as const };

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
    if (!claimed) return { kind: "duplicate" as const };
    return { kind: "claimed" as const, processingOwner };
  }
  throw error;
}

async function markWebhookEventProcessed(args: ReconcileProviderArgs, processingOwner: string) {
  const { error } = await args.client
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
    .is("processed_at", null);

  if (error) throw error;
}

const PAYMENT_WITH_DONATION_SELECT =
  "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,receipt_requested,status,supporter_id,supporter:supporter_id(id,name,email,language))";

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
) {
  const donation = payment.donation;
  const now = deps.now ?? (() => new Date());
  const generatePdf = deps.generatePdf ?? generateReceiptPdf;

  const issuedAt = now().toISOString();
  const taxYear = new Date(issuedAt).getFullYear();

  const { data, error } = await client.rpc("issue_receipt", {
    p_donation_id: donation.id,
    p_supporter_id: donation.supporter_id,
    p_amount_cents: donation.amount_cents,
    p_tax_year: taxYear,
    p_issued_at: issuedAt,
  });
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
      donorName: donation.supporter.name,
      amountCents: donation.amount_cents,
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

async function hasDonationAcknowledgement(client: SupabaseClient, payment: PaymentWithDonation) {
  const { data, error } = await client
    .from("message")
    .select("id")
    .eq("supporter_id", payment.donation.supporter_id)
    .eq("channel", "email")
    .contains("payload", {
      kind: "donation_acknowledgement",
      donationId: payment.donation.id,
    })
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function completeDonationSideEffects(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  deps: ReconcileDeps = {},
) {
  const donation = payment.donation;
  const receiptNo = isReceiptEligible({
    amountCents: donation.amount_cents,
    receiptRequested: donation.receipt_requested,
  })
    ? await issueReceiptIfNeeded(client, payment, deps)
    : undefined;

  if (!(await hasDonationAcknowledgement(client, payment))) {
    await sendDonationAcknowledgement(client, {
      supporterId: donation.supporter_id,
      donationId: donation.id,
      to: donation.supporter.email,
      donorName: donation.supporter.name,
      amountCents: donation.amount_cents,
      language: donation.supporter.language,
      receiptNo,
    });
  }

  return receiptNo;
}

async function applySucceededPayment(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  options: ApplyOptions = {},
) {
  const deps = options.deps ?? {};

  if (payment.amount_cents !== payment.donation.amount_cents) {
    throw new Error("Payment amount does not match donation amount");
  }

  const plan = buildReconciliationPlan({
    providerEventId: payment.provider_ref ?? payment.id,
    seenProviderEventIds: new Set(),
    donation: payment.donation,
    payment,
  });

  if (plan.kind === "duplicate") {
    await completeDonationSideEffects(client, payment, deps);
    return { kind: "duplicate" as const, donationId: payment.donation.id };
  }

  // A refunded/failed donation or payment must not be resurrected to succeeded.
  if (plan.kind === "skip") {
    return { kind: "skipped" as const, donationId: payment.donation.id, reason: plan.reason };
  }

  const receivedAt = (deps.now ?? (() => new Date()))().toISOString();
  // Guard every transition on the source status so a replayed event can never
  // overwrite a terminal (refunded/failed) row even if the read raced ahead.
  const { error: paymentError } = await client
    .from("payment")
    .update({
      status: plan.paymentStatus,
      received_at: receivedAt,
      reconciled_by: options.actorUserId ?? null,
      bank_reference: options.bankReference ?? null,
    })
    .eq("id", payment.id)
    .eq("status", "pending");
  if (paymentError) throw paymentError;

  const { error: donationError } = await client
    .from("donation")
    .update({ status: plan.donationStatus })
    .eq("id", payment.donation.id)
    .eq("status", "pending");
  if (donationError) throw donationError;

  const receiptNo = await completeDonationSideEffects(client, payment, deps);

  return { kind: "applied" as const, donationId: payment.donation.id, receiptNo };
}

async function processProviderWebhook<T>(
  args: ReconcileProviderArgs,
  apply: (payment: PaymentWithDonation) => Promise<T>,
): Promise<T | { kind: "duplicate" } | { kind: "not_found" }> {
  const reservation = await reserveWebhookEvent(args);
  if (reservation.kind === "duplicate") return { kind: "duplicate" as const };

  let payment = await findPaymentByProvider(args.client, args.provider, args.providerRef);

  // Fallback: the provider_ref lookup missed (e.g. provider_ref was never
  // persisted). Match the payment id from provider metadata so a real paid
  // donation isn't lost, then backfill provider_ref for future events.
  if (!payment && args.fallbackPaymentId) {
    const candidate = await findPaymentByIdMaybe(args.client, args.fallbackPaymentId);
    if (candidate && candidate.provider === args.provider) {
      payment = candidate;
      if (!payment.provider_ref && args.providerRef) {
        const { error } = await args.client
          .from("payment")
          .update({ provider_ref: args.providerRef })
          .eq("id", payment.id)
          .is("provider_ref", null);
        if (error) throw error;
        payment.provider_ref = args.providerRef;
      }
    }
  }

  if (!payment) {
    // The event verified but references a payment we don't have. Retrying will
    // never succeed, so mark it processed to stop the provider's retry storm.
    // The caller surfaces this so the route can return 200 (acknowledged).
    await markWebhookEventProcessed(args, reservation.processingOwner);
    return { kind: "not_found" as const };
  }

  const result = await apply(payment);
  await markWebhookEventProcessed(args, reservation.processingOwner);
  return result;
}

export async function reconcileProviderPayment(
  args: ReconcileProviderArgs,
  deps: ReconcileDeps = {},
) {
  return processProviderWebhook(args, (payment) =>
    applySucceededPayment(args.client, payment, { deps }),
  );
}

export async function failProviderPayment(args: ReconcileProviderArgs) {
  return processProviderWebhook(args, async (payment) => {
    const { error: paymentError } = await args.client
      .from("payment")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (paymentError) throw paymentError;

    const { error: donationError } = await args.client
      .from("donation")
      .update({ status: "failed" })
      .eq("id", payment.donation.id)
      .eq("status", "pending");
    if (donationError) throw donationError;

    return { kind: "failed" as const, donationId: payment.donation.id };
  });
}

export async function refundProviderPayment(args: ReconcileProviderArgs) {
  return processProviderWebhook(args, async (payment) => {
    const { error: paymentError } = await args.client
      .from("payment")
      .update({ status: "refunded" })
      .eq("id", payment.id)
      .eq("status", "succeeded");
    if (paymentError) throw paymentError;

    const { error: donationError } = await args.client
      .from("donation")
      .update({ status: "refunded" })
      .eq("id", payment.donation.id)
      .eq("status", "succeeded");
    if (donationError) throw donationError;

    await voidIssuedReceiptsForDonation(args.client, payment.donation.id, { reason: "refund" });

    return { kind: "refunded" as const, donationId: payment.donation.id };
  });
}

export async function reconcileManualPayment(args: ReconcileManualArgs) {
  const payment = await findPaymentById(args.client, args.paymentId);
  const result = await applySucceededPayment(args.client, payment, {
    actorUserId: args.actorUserId,
    bankReference: args.bankReference,
  });

  await args.client.from("audit_log").insert({
    actor_user_id: args.actorUserId,
    action: "payment.mark_received",
    entity: "payment",
    entity_id: args.paymentId,
    detail: { bankReference: args.bankReference, result },
  });

  return result;
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
    .single();
  if (error) throw error;

  const receiptNo = await issueReceiptIfNeeded(
    client,
    data as unknown as PaymentWithDonation,
    deps,
  );
  const { error: auditError } = await client.from("audit_log").insert({
    actor_user_id: actorUserId,
    action: "receipt.issue",
    entity: "donation",
    entity_id: donationId,
    detail: { receiptNo, supporterId: context.supporterId ?? null },
  });
  if (auditError) throw auditError;
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
  options: { actorUserId?: string; reason?: string } = {},
) {
  const { data: receipts, error } = await client
    .from("receipt")
    .select("id,pdf_url")
    .contains("donation_ids", [donationId])
    .eq("status", "issued");
  if (error) throw error;

  for (const receipt of (receipts ?? []) as Array<{ id: string; pdf_url: string | null }>) {
    const { error: updateError } = await client
      .from("receipt")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        voided_by: options.actorUserId ?? null,
      })
      .eq("id", receipt.id)
      .eq("status", "issued");
    if (updateError) throw updateError;
    await removeReceiptPdf(client, receipt.pdf_url);

    // Audit-trail the void so a refund-driven void is not silent (mirrors the
    // manual voidReceipt path). actor is null for system/webhook-driven voids.
    const { error: auditError } = await client.from("audit_log").insert({
      actor_user_id: options.actorUserId ?? null,
      action: "receipt.void",
      entity: "receipt",
      entity_id: receipt.id,
      detail: { reason: options.reason ?? "refund", donationId },
    });
    if (auditError) throw auditError;
  }
}

export async function voidReceipt(
  client: SupabaseClient,
  receiptId: string,
  actorUserId: string,
  context: ReceiptActionContext = {},
) {
  const voidedAt = new Date().toISOString();
  const { data, error } = await client
    .from("receipt")
    .update({
      status: "void",
      voided_at: voidedAt,
      voided_by: actorUserId,
    })
    .eq("id", receiptId)
    .eq("status", "issued")
    .select("id,pdf_url")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Receipt not found or already voided");

  await removeReceiptPdf(client, (data as { pdf_url: string | null }).pdf_url);

  const { error: auditError } = await client.from("audit_log").insert({
    actor_user_id: actorUserId,
    action: "receipt.void",
    entity: "receipt",
    entity_id: receiptId,
    detail: { voidedAt, supporterId: context.supporterId ?? null },
  });
  if (auditError) throw auditError;

  return { receiptId, status: "void" as const };
}
