import { getEmailConfig } from "../donations/config.server";
import type { GroupEnquiry } from "./types";

type EmailSender = {
  send(input: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

type EmailConfig = { resendApiKey?: string | null; from: string; replyTo?: string | null };

type NotifyDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender>;
  logger?: Pick<Console, "error">;
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

function line(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return "<p><strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(String(value)) + "</p>";
}

function renderAdminEmail(enquiry: GroupEnquiry) {
  const subject = "New group enquiry: " + enquiry.organisationName;
  const html = [
    "<p>A new group activity enquiry has been submitted.</p>",
    line("Organisation", enquiry.organisationName),
    line("Contact", enquiry.contactPerson),
    line("Email", enquiry.email),
    line("Phone", enquiry.phone),
    line("Activity type", enquiry.activityType),
    line("Other activity", enquiry.otherActivityDescription),
    line("Participants", enquiry.participantCount),
    line("Age profile", enquiry.participantAgeProfile),
    line("Preferred dates", enquiry.preferredDateNotes),
    line("Message", enquiry.message),
  ].join("\n");
  return { subject, html };
}

export async function notifyGroupEnquiryAdmins(
  input: { enquiry: GroupEnquiry },
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: NotifyDeps = {},
) {
  const config = loadEmailConfig();
  if (!config.resendApiKey || !config.replyTo) return "skipped";
  const email = renderAdminEmail(input.enquiry);

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
    logger.error("Failed to notify group enquiry admins", error);
    return "failed";
  }

  return "sent";
}
