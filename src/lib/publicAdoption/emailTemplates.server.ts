import type { ExpandedAdoptionApplication } from "./schemas";

type AdoptionConfirmationEmailInput = {
  language: ExpandedAdoptionApplication["language"];
  applicantName: string;
  reference: string;
  statusUrl: string;
  expiresAt: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

export function renderAdoptionConfirmationEmail(input: AdoptionConfirmationEmailInput) {
  const applicantName = escapeHtml(input.applicantName);
  const reference = escapeHtml(input.reference);
  const statusUrl = escapeHtml(input.statusUrl);
  const expiresOn = dateOnly(input.expiresAt);

  if (input.language === "en") {
    return {
      subject: `HKSCDA received your adoption application ${input.reference}`,
      html: [
        `<p>Dear ${applicantName},</p>`,
        `<p>We have received your adoption application <strong>${reference}</strong>.</p>`,
        `<p>You can check your application status here: <a href="${statusUrl}">${statusUrl}</a></p>`,
        `<p>Your status link expires on ${expiresOn}.</p>`,
        "<p>HKSCDA Adoption Team</p>",
      ].join(""),
    };
  }

  return {
    subject: `HKSCDA 已收到您的領養申請 ${input.reference}`,
    html: [
      `<p>${applicantName} 您好：</p>`,
      `<p>我們已收到您的領養申請 <strong>${reference}</strong>。</p>`,
      `<p>您可透過以下連結查看申請狀態：<a href="${statusUrl}">${statusUrl}</a></p>`,
      `<p>此狀態連結有效至 ${expiresOn}。</p>`,
      "<p>HKSCDA 領養團隊</p>",
    ].join(""),
  };
}
