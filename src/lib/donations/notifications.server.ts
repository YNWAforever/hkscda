import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailConfig } from "./config.server";
import { centsToHkd } from "./domain";

type EmailInput = {
  supporterId: string;
  to: string;
  donorName: string;
  amountCents: number;
  language: "zh-HK" | "en";
  receiptNo?: string;
};

export async function sendDonationAcknowledgement(client: SupabaseClient, input: EmailInput) {
  const config = getEmailConfig();
  if (!config.resendApiKey) return;

  const resend = new Resend(config.resendApiKey);
  const subject =
    input.language === "en" ? "Thank you for supporting HKSCDA" : "多謝您支持香港拯救貓狗協會";
  const receiptLine = input.receiptNo
    ? input.language === "en"
      ? `<p>Your receipt number is <strong>${input.receiptNo}</strong>.</p>`
      : `<p>您的收據編號為 <strong>${input.receiptNo}</strong>。</p>`
    : "";

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

  await client.from("message").insert({
    supporter_id: input.supporterId,
    channel: "email",
    status: "sent",
    payload: { subject, receiptNo: input.receiptNo ?? null },
    sent_at: new Date().toISOString(),
  });
}
