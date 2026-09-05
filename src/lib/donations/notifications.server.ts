import type { SupabaseClient } from "@supabase/supabase-js";

import { createResendMailProvider, type MailProvider } from "../notifications/provider.server";
import { getEmailConfig } from "./config.server";
import { centsToHkd } from "./domain";

type EmailInput = {
  supporterId: string;
  donationId: string;
  to: string;
  donorName: string;
  amountCents: number;
  language: "zh-HK" | "en";
  receiptNo?: string;
};

export type AcknowledgementResult = "sent" | "queued" | "skipped" | "failed";

const ACKNOWLEDGEMENT_RETRY_LEASE_MS = 5 * 60 * 1000;

type ExistingAcknowledgement = {
  id: string;
  status: "queued" | "sent" | "delivered" | "failed";
  updated_at: string | null;
};

type DonationNotificationDependencies = {
  getEmailConfig?: typeof getEmailConfig;
  createMailProvider?: (apiKey: string) => Promise<MailProvider>;
  now?: () => Date;
  logger?: Pick<Console, "error">;
};

async function defaultCreateMailProvider(apiKey: string): Promise<MailProvider> {
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  return createResendMailProvider(async ({ idempotencyKey, ...email }) => {
    const result = await resend.emails.send(email, { idempotencyKey });
    return {
      data: result.data ? { id: result.data.id } : null,
      error: result.error ? { name: result.error.name } : null,
    };
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function findAcknowledgement(
  client: SupabaseClient,
  input: Pick<EmailInput, "supporterId" | "donationId">,
): Promise<ExistingAcknowledgement | null> {
  const { data, error } = await client
    .from("message")
    .select("id,status,updated_at")
    .eq("supporter_id", input.supporterId)
    .eq("channel", "email")
    .contains("payload", { kind: "donation_acknowledgement", donationId: input.donationId })
    .maybeSingle<ExistingAcknowledgement>();
  if (error) throw error;
  return data;
}

export async function sendDonationAcknowledgement(
  client: SupabaseClient,
  input: EmailInput,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createMailProvider = defaultCreateMailProvider,
    now = () => new Date(),
    logger = console,
  }: DonationNotificationDependencies = {},
): Promise<AcknowledgementResult> {
  const config = loadEmailConfig();
  const payload = {
    kind: "donation_acknowledgement",
    donationId: input.donationId,
    subject:
      input.language === "en" ? "Thank you for supporting HKSCDA" : "多謝您支持香港拯救貓狗協會",
    receiptNo: input.receiptNo ?? null,
  };

  // Claim the acknowledgement BEFORE any external work. The
  // message_donation_ack_unique index enforces one ack per (supporter,
  // donation), so a redelivered/concurrent success event that loses the race
  // gets a 23505 here. Sent/delivered rows skip. A fresh queued row belongs to
  // another in-flight sender and keeps reconciliation retryable; a stale
  // queued row is reclaimed after the lease and retried with the same provider
  // idempotency key.
  const { data: claimed, error: claimError } = await client
    .from("message")
    .insert({
      supporter_id: input.supporterId,
      channel: "email",
      status: "queued",
      payload,
    })
    .select("id")
    .single();
  let messageId: string;
  if (claimError) {
    if ((claimError as { code?: string }).code !== "23505") throw claimError;

    const existing = await findAcknowledgement(client, input);
    if (!existing) throw new Error("Acknowledgement claim disappeared after unique conflict");
    if (existing.status === "sent" || existing.status === "delivered") return "skipped";

    if (existing.status === "queued") {
      const updatedAt = existing.updated_at ? Date.parse(existing.updated_at) : Number.NaN;
      const currentTime = now().getTime();
      const leaseExpired =
        Number.isFinite(updatedAt) && currentTime - updatedAt >= ACKNOWLEDGEMENT_RETRY_LEASE_MS;
      if (!leaseExpired) return "failed";

      const staleBefore = new Date(currentTime - ACKNOWLEDGEMENT_RETRY_LEASE_MS).toISOString();
      const { data: reclaimed, error: reclaimError } = await client
        .from("message")
        .update({ status: "queued" })
        .eq("id", existing.id)
        .eq("status", "queued")
        .lte("updated_at", staleBefore)
        .select("id")
        .maybeSingle();
      if (reclaimError) throw reclaimError;
      if (!reclaimed) return "failed";
      messageId = (reclaimed as { id: string }).id;
    } else {
      // A prior provider outage leaves the unique acknowledgement row failed.
      // Reclaim it with a guarded transition. Only one concurrent retry can
      // move failed -> queued; a race that loses the claim stays retryable.
      const { data: retried, error: retryError } = await client
        .from("message")
        .update({ status: "queued" })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!retried) return "failed";
      messageId = (retried as { id: string }).id;
    }
  } else {
    messageId = (claimed as { id: string }).id;
  }

  if (!config.resendApiKey) {
    // Dev/preview without an email provider: leave the claim queued.
    return "queued";
  }

  const subject = payload.subject;
  const receiptLine = input.receiptNo
    ? input.language === "en"
      ? `<p>Your receipt number is <strong>${input.receiptNo}</strong>.</p>`
      : `<p>您的收據編號為 <strong>${input.receiptNo}</strong>。</p>`
    : "";

  try {
    const provider = await createMailProvider(config.resendApiKey);
    const result = await provider.send({
      from: config.from,
      to: input.to,
      replyTo: config.replyTo,
      subject,
      html:
        input.language === "en"
          ? `<p>Dear ${escapeHtml(input.donorName)},</p><p>Thank you for your donation of ${centsToHkd(input.amountCents)}.</p>${receiptLine}<p>Every gift helps rescued cats and dogs receive food, medical care, and a safe path to adoption.</p>`
          : `<p>${escapeHtml(input.donorName)} 您好：</p><p>多謝您捐出 ${centsToHkd(input.amountCents)} 支持本會。</p>${receiptLine}<p>每一份善意都會用於流浪貓狗的糧食、醫療及領養工作。</p>`,
      idempotencyKey: `donation-acknowledgement-${input.donationId}`,
    });
    if (result.kind === "rejected") {
      logger.error("Donation acknowledgement provider rejected message", result);
      const { error } = await client
        .from("message")
        .update({
          status: "failed",
          payload: { ...payload, providerErrorCode: result.code, retryable: result.retryable },
        })
        .eq("id", messageId)
        .eq("status", "queued");
      if (error) throw error;
      return "failed";
    }
    Object.assign(payload, { providerMessageId: result.providerMessageId });
  } catch (sendError) {
    // Best-effort: an email-provider outage must never roll back an
    // already-committed payment + receipt. Leave the claim row as 'failed' for
    // an outbox/retry and surface the error in logs.
    logger.error("Failed to send donation acknowledgement email", sendError);
    const { error: statusError } = await client
      .from("message")
      .update({ status: "failed" })
      .eq("id", messageId)
      .eq("status", "queued");
    if (statusError) throw statusError;
    return "failed";
  }

  const { data: sent, error: statusError } = await client
    .from("message")
    .update({ status: "sent", sent_at: now().toISOString(), payload })
    .eq("id", messageId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (statusError) throw statusError;
  if (!sent) {
    const current = await findAcknowledgement(client, input);
    if (current?.status === "sent" || current?.status === "delivered") return "sent";
    throw new Error("Acknowledgement delivery succeeded but status was not persisted");
  }
  return "sent";
}
