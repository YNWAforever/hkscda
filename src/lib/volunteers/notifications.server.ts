import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailConfig } from "../donations/config.server";
import type { VolunteerRegistrationDetail } from "./types";

type EmailSender = {
  send(input: {
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRegistrantEmail(registration: VolunteerRegistrationDetail, statusUrl: string) {
  const subject = `HKSCDA 義工登記 ${registration.status}`;
  const html = `
    <p>${escapeHtml(registration.contactName)} 你好，</p>
    <p>我們已收到你的義工登記：${escapeHtml(registration.activity.title)}。</p>
    <p>目前狀態：<strong>${escapeHtml(registration.status)}</strong></p>
    <p>你可在以下連結查看最新狀態：<a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>
  `;
  return { subject, html };
}

function renderAdminEmail(registration: VolunteerRegistrationDetail) {
  const subject = `New volunteer registration: ${registration.activity.title}`;
  const html = `
    <p>${escapeHtml(registration.contactName)} submitted a ${escapeHtml(
      registration.registrationType,
    )} registration.</p>
    <p>Status: <strong>${escapeHtml(registration.status)}</strong></p>
    <p>Participants: ${registration.participantCount}</p>
  `;
  return { subject, html };
}

export async function sendVolunteerRegistrationEmail(
  client: SupabaseClient,
  input: { registration: VolunteerRegistrationDetail; statusUrl: string },
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  } = {},
) {
  const config = loadEmailConfig();
  const email = renderRegistrantEmail(input.registration, input.statusUrl);

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: input.registration.supporterId,
      channel: "email",
      status: "queued",
      payload: {
        kind: "volunteer_registration_confirmation",
        registrationId: input.registration.id,
        activityId: input.registration.activityId,
        subject: email.subject,
        entityType: "volunteer_registration",
      },
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue volunteer registration email", messageError);
    return "failed";
  }

  const messageId = (message as { id: string }).id;
  if (!config.resendApiKey) return "queued";

  try {
    const sender = await createEmailSender(config.resendApiKey);
    await sender.send({
      from: config.from,
      to: input.registration.contactEmail,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to send volunteer registration email", error);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}

export async function notifyVolunteerAdmins(
  input: { registration: VolunteerRegistrationDetail },
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  } = {},
) {
  const config = loadEmailConfig();
  if (!config.resendApiKey || !config.replyTo) return "skipped";
  const email = renderAdminEmail(input.registration);

  try {
    const sender = await createEmailSender(config.resendApiKey);
    await sender.send({
      from: config.from,
      to: config.replyTo,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to notify volunteer admins", error);
    return "failed";
  }

  return "sent";
}
