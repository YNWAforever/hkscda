import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getSupabaseServerConfig } from "./config.server";
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

async function findPaymentByProvider(
  client: SupabaseClient,
  provider: string,
  providerRef: string,
): Promise<PaymentWithDonation> {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,receipt_requested,status,supporter_id,supporter:supporter_id(id,name,email,language))",
    )
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .single();

  if (error) throw error;
  return data as unknown as PaymentWithDonation;
}

async function findPaymentById(
  client: SupabaseClient,
  paymentId: string,
): Promise<PaymentWithDonation> {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,receipt_requested,status,supporter_id,supporter:supporter_id(id,name,email,language))",
    )
    .eq("id", paymentId)
    .single();

  if (error) throw error;
  return data as unknown as PaymentWithDonation;
}

async function issueReceiptIfNeeded(client: SupabaseClient, payment: PaymentWithDonation) {
  const donation = payment.donation;
  const { data: existing } = await client
    .from("receipt")
    .select("receipt_no")
    .contains("donation_ids", [donation.id])
    .eq("status", "issued")
    .maybeSingle();
  if (existing?.receipt_no) return existing.receipt_no as string;

  const issuedAt = new Date().toISOString();
  const taxYear = new Date(issuedAt).getFullYear();
  const { data: receiptNo, error: receiptNoError } = await client
    .schema("private")
    .rpc("allocate_receipt_number", { p_tax_year: taxYear });
  if (receiptNoError) throw receiptNoError;

  const pdf = await generateReceiptPdf({
    receiptNo,
    donorName: donation.supporter.name,
    amountCents: donation.amount_cents,
    issuedAt,
  });
  const path = `${taxYear}/${receiptNo}.pdf`;
  const { error: uploadError } = await client.storage
    .from(getSupabaseServerConfig().receiptBucket)
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const { error: receiptError } = await client.from("receipt").insert({
    supporter_id: donation.supporter_id,
    receipt_no: receiptNo,
    donation_ids: [donation.id],
    total_amount_cents: donation.amount_cents,
    tax_year: taxYear,
    issued_at: issuedAt,
    pdf_url: path,
    status: "issued",
  });
  if (receiptError) throw receiptError;

  return receiptNo as string;
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

async function completeDonationSideEffects(client: SupabaseClient, payment: PaymentWithDonation) {
  const donation = payment.donation;
  const receiptNo = isReceiptEligible({
    amountCents: donation.amount_cents,
    receiptRequested: donation.receipt_requested,
  })
    ? await issueReceiptIfNeeded(client, payment)
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
  actorUserId?: string,
  bankReference?: string,
) {
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
    await completeDonationSideEffects(client, payment);
    return { kind: "duplicate" as const, donationId: payment.donation.id };
  }

  const receivedAt = new Date().toISOString();
  const { error: paymentError } = await client
    .from("payment")
    .update({
      status: plan.paymentStatus,
      received_at: receivedAt,
      reconciled_by: actorUserId ?? null,
      bank_reference: bankReference ?? null,
    })
    .eq("id", payment.id);
  if (paymentError) throw paymentError;

  const { error: donationError } = await client
    .from("donation")
    .update({ status: plan.donationStatus })
    .eq("id", payment.donation.id);
  if (donationError) throw donationError;

  const receiptNo = await completeDonationSideEffects(client, payment);

  return { kind: "applied" as const, donationId: payment.donation.id, receiptNo };
}

export async function reconcileProviderPayment(args: ReconcileProviderArgs) {
  const reservation = await reserveWebhookEvent(args);
  if (reservation.kind === "duplicate") return { kind: "duplicate" as const };

  const payment = await findPaymentByProvider(args.client, args.provider, args.providerRef);
  const result = await applySucceededPayment(args.client, payment);
  await markWebhookEventProcessed(args, reservation.processingOwner);
  return result;
}

export async function reconcileManualPayment(args: ReconcileManualArgs) {
  const payment = await findPaymentById(args.client, args.paymentId);
  const result = await applySucceededPayment(
    args.client,
    payment,
    args.actorUserId,
    args.bankReference,
  );

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
) {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,receipt_requested,status,supporter_id,supporter:supporter_id(id,name,email,language))",
    )
    .eq("donation_id", donationId)
    .eq("status", "succeeded")
    .single();
  if (error) throw error;

  const receiptNo = await issueReceiptIfNeeded(client, data as unknown as PaymentWithDonation);
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
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Receipt not found or already voided");

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
