import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function sendDonationAcknowledgement(
  client: SupabaseClient,
  input: EmailInput,
): Promise<AcknowledgementResult> {
  const config = getEmailConfig();
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
  // gets a 23505 here. Sent/queued rows skip; failed rows are reclaimed below
  // with a guarded transition, so there is no second email or check-then-send
  // TOCTOU.
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

    // A prior provider outage leaves the unique acknowledgement row failed.
    // Reclaim it with a guarded state transition. Only one concurrent retry can
    // move failed -> queued; sent, delivered, or already-queued rows are never
    // sent again.
    const { data: retried, error: retryError } = await client
      .from("message")
      .update({ status: "queued" })
      .eq("supporter_id", input.supporterId)
      .eq("channel", "email")
      .eq("status", "failed")
      .contains("payload", { kind: "donation_acknowledgement", donationId: input.donationId })
      .select("id")
      .maybeSingle();
    if (retryError) throw retryError;
    if (!retried) return "skipped";
    messageId = (retried as { id: string }).id;
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
    const resend = new Resend(config.resendApiKey);
    await resend.emails.send({
      from: config.from,
      to: input.to,
      replyTo: config.replyTo,
      subject,
      html:
        input.language === "en"
          ? `<p>Dear ${input.donorName},</p><p>Thank you for your donation of ${centsToHkd(input.amountCents)}.</p>${receiptLine}<p>Every gift helps rescued cats and dogs receive food, medical care, and a safe path to adoption.</p>`
          : `<p>${input.donorName} 您好：</p><p>多謝您捐出 ${centsToHkd(input.amountCents)} 支持本會。</p>${receiptLine}<p>每一份善意都會用於流浪貓狗的糧食、醫療及領養工作。</p>`,
    });
  } catch (sendError) {
    // Best-effort: an email-provider outage must never roll back an
    // already-committed payment + receipt. Leave the claim row as 'failed' for
    // an outbox/retry and surface the error in logs.
    console.error("Failed to send donation acknowledgement email", sendError);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}
