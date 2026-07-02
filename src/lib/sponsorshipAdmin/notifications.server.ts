import type { SupabaseClient } from "@supabase/supabase-js";

import {
  renderPledgeStatusUpdateEmail,
  type PledgeStatusUpdateEvent,
} from "../sponsorship/emailTemplates.server";
import { getEmailConfig } from "../donations/config.server";

type EmailConfig = ReturnType<typeof getEmailConfig>;

type EmailSender = {
  send(payload: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

async function defaultCreateEmailSender(apiKey: string): Promise<EmailSender> {
  const { Resend } = await import("resend");
  return new Resend(apiKey).emails;
}

export type SendPledgeStatusUpdateEmailArgs = {
  event: PledgeStatusUpdateEvent;
  language: "zh-HK" | "en";
  supporterId: string;
  supporterEmail: string;
  supporterName: string;
  reference: string;
  amountCents: number;
};

type SendPledgeStatusUpdateEmailDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender> | EmailSender;
  logger?: Pick<Console, "error">;
};

export type PledgeStatusUpdateEmailResult = "queued" | "sent" | "failed";

export async function sendPledgeStatusUpdateEmail(
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: SendPledgeStatusUpdateEmailDeps = {},
): Promise<PledgeStatusUpdateEmailResult> {
  const config = loadEmailConfig();
  const email = renderPledgeStatusUpdateEmail({
    event: args.event,
    language: args.language,
    supporterName: args.supporterName,
    reference: args.reference,
    amountCents: args.amountCents,
  });

  const messagePayload = {
    kind: "sponsorship_pledge_status_update",
    event: args.event,
    reference: args.reference,
    subject: email.subject,
    entityType: "sponsorship_pledge",
  };

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: args.supporterId,
      channel: "email",
      status: "queued",
      payload: messagePayload,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue sponsorship pledge status update email", messageError);
    return "failed";
  }

  const messageId = (message as { id: string }).id;
  if (!config.resendApiKey) return "queued";

  try {
    const emails = await createEmailSender(config.resendApiKey);
    await emails.send({
      from: config.from,
      to: args.supporterEmail,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to send sponsorship pledge status update email", error);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}
