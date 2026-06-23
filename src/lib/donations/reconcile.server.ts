import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "./config.server";
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

async function recordWebhookEvent(args: ReconcileProviderArgs) {
  const { error } = await args.client.from("webhook_event").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    event_type: args.eventType,
    payload: args.payload,
    processed_at: new Date().toISOString(),
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
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

async function applySucceededPayment(
  client: SupabaseClient,
  payment: PaymentWithDonation,
  actorUserId?: string,
  bankReference?: string,
) {
  const plan = buildReconciliationPlan({
    providerEventId: payment.provider_ref ?? payment.id,
    seenProviderEventIds: new Set(),
    donation: payment.donation,
    payment,
  });

  if (plan.kind === "duplicate") {
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

  const receiptNo = plan.shouldIssueReceipt
    ? await issueReceiptIfNeeded(client, payment)
    : undefined;
  await sendDonationAcknowledgement(client, {
    supporterId: payment.donation.supporter_id,
    to: payment.donation.supporter.email,
    donorName: payment.donation.supporter.name,
    amountCents: payment.donation.amount_cents,
    language: payment.donation.supporter.language,
    receiptNo,
  });

  return { kind: "applied" as const, donationId: payment.donation.id, receiptNo };
}

export async function reconcileProviderPayment(args: ReconcileProviderArgs) {
  const shouldProcess = await recordWebhookEvent(args);
  if (!shouldProcess) return { kind: "duplicate" as const };

  const payment = await findPaymentByProvider(args.client, args.provider, args.providerRef);
  return applySucceededPayment(args.client, payment);
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
  await client.from("audit_log").insert({
    actor_user_id: actorUserId,
    action: "receipt.issue",
    entity: "donation",
    entity_id: donationId,
    detail: { receiptNo },
  });
  return { receiptNo };
}
