import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailConfig } from "../donations/config.server";
import { createResendMailProvider, type MailProvider } from "../notifications/provider.server";
import type { VolunteerRegistrationDetail } from "./types";

const DELIVERY_LEASE_MS = 5 * 60 * 1000;
type DeliveryResult = "sent" | "queued" | "skipped" | "failed";
type VolunteerNotificationDependencies = {
  getEmailConfig?: typeof getEmailConfig;
  createMailProvider?: (apiKey: string) => Promise<MailProvider>;
  now?: () => Date;
  logger?: Pick<Console, "error">;
};
type ExistingMessage = {
  id: string;
  status: "queued" | "sent" | "delivered" | "failed";
  updated_at: string | null;
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

function renderRegistrantEmail(registration: VolunteerRegistrationDetail, statusUrl: string) {
  return {
    subject: `HKSCDA 義工登記 ${registration.status}`,
    html: `<p>${escapeHtml(registration.contactName)} 你好，</p><p>我們已收到你的義工登記：${escapeHtml(registration.activity.title)}。</p><p>目前狀態：<strong>${escapeHtml(registration.status)}</strong></p><p>你可在以下連結查看最新狀態：<a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>`,
  };
}

function renderAdminEmail(registration: VolunteerRegistrationDetail) {
  return {
    subject: `New volunteer registration: ${registration.activity.title}`,
    html: `<p>${escapeHtml(registration.contactName)} submitted a ${escapeHtml(registration.registrationType)} registration.</p><p>Status: <strong>${escapeHtml(registration.status)}</strong></p><p>Participants: ${registration.participantCount}</p>`,
  };
}

async function findRegistrationMessage(
  client: SupabaseClient,
  registrationId: string,
): Promise<ExistingMessage | null> {
  const { data, error } = await client
    .from("message")
    .select("id,status,updated_at")
    .eq("channel", "email")
    .contains("payload", { kind: "volunteer_registration_confirmation", registrationId })
    .maybeSingle<ExistingMessage>();
  if (error) throw error;
  return data;
}

export async function sendVolunteerRegistrationEmail(
  client: SupabaseClient,
  input: { registration: VolunteerRegistrationDetail; statusUrl: string },
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createMailProvider = defaultCreateMailProvider,
    now = () => new Date(),
    logger = console,
  }: VolunteerNotificationDependencies = {},
): Promise<DeliveryResult> {
  const config = loadEmailConfig();
  const email = renderRegistrantEmail(input.registration, input.statusUrl);
  const payload: Record<string, unknown> = {
    kind: "volunteer_registration_confirmation",
    registrationId: input.registration.id,
    activityId: input.registration.activityId,
    subject: email.subject,
    entityType: "volunteer_registration",
  };

  const { data: claimed, error: claimError } = await client
    .from("message")
    .insert({
      supporter_id: input.registration.supporterId,
      channel: "email",
      status: "queued",
      payload,
    })
    .select("id")
    .single();
  let messageId: string;
  if (claimError) {
    if ((claimError as { code?: string }).code !== "23505") {
      logger.error("Failed to queue volunteer registration email", claimError);
      return "failed";
    }
    const existing = await findRegistrationMessage(client, input.registration.id);
    if (!existing) throw new Error("Volunteer message claim disappeared after unique conflict");
    if (existing.status === "sent" || existing.status === "delivered") return "skipped";
    if (existing.status === "queued") {
      const updatedAt = existing.updated_at ? Date.parse(existing.updated_at) : Number.NaN;
      const currentTime = now().getTime();
      if (!Number.isFinite(updatedAt) || currentTime - updatedAt < DELIVERY_LEASE_MS)
        return "failed";
      const { data, error } = await client
        .from("message")
        .update({ status: "queued" })
        .eq("id", existing.id)
        .eq("status", "queued")
        .lt("updated_at", new Date(currentTime - DELIVERY_LEASE_MS).toISOString())
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return "failed";
      messageId = (data as { id: string }).id;
    } else {
      const { data, error } = await client
        .from("message")
        .update({ status: "queued" })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return "failed";
      messageId = (data as { id: string }).id;
    }
  } else if (claimed) messageId = (claimed as { id: string }).id;
  else return "failed";

  if (!config.resendApiKey) return "queued";
  const provider = await createMailProvider(config.resendApiKey);
  const result = await provider.send({
    from: config.from,
    to: input.registration.contactEmail,
    replyTo: config.replyTo,
    subject: email.subject,
    html: email.html,
    idempotencyKey: `volunteer-registration-${input.registration.id}`,
  });
  if (result.kind === "rejected") {
    logger.error("Volunteer registration provider rejected message", result);
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

  const { data: sent, error } = await client
    .from("message")
    .update({
      status: "sent",
      sent_at: now().toISOString(),
      payload: { ...payload, providerMessageId: result.providerMessageId },
    })
    .eq("id", messageId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!sent) throw new Error("Volunteer delivery succeeded but status was not persisted");
  return "sent";
}

export async function notifyVolunteerAdmins(
  input: { registration: VolunteerRegistrationDetail },
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createMailProvider = defaultCreateMailProvider,
    logger = console,
  }: VolunteerNotificationDependencies = {},
) {
  const config = loadEmailConfig();
  if (!config.resendApiKey || !config.replyTo) return "skipped";
  const email = renderAdminEmail(input.registration);
  try {
    const provider = await createMailProvider(config.resendApiKey);
    const result = await provider.send({
      from: config.from,
      to: config.replyTo,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
      idempotencyKey: `volunteer-admin-${input.registration.id}`,
    });
    return result.kind === "accepted" ? "sent" : "failed";
  } catch (error) {
    logger.error("Failed to notify volunteer admins", error);
    return "failed";
  }
}
