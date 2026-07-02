import { centsToHkd } from "../donations/domain";

type PledgeConfirmationEmailInput = {
  language: "zh-HK" | "en";
  supporterName: string;
  reference: string;
  amountCents: number;
  status: "pending_payment" | "provisional";
  statusUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Wraps a pre-escaped HTML body in the shared HKSCDA email envelope
 * (greeting + body + signature), matching the letterhead used across all
 * sponsorship notification emails.
 */
function wrapEmailEnvelope(
  language: "zh-HK" | "en",
  supporterName: string,
  bodyHtml: string,
  subject: string,
) {
  if (language === "en") {
    return {
      subject,
      html: [`<p>Dear ${supporterName},</p>`, bodyHtml, "<p>HKSCDA Sponsorship Team</p>"].join(""),
    };
  }

  return {
    subject,
    html: [`<p>${supporterName} 您好：</p>`, bodyHtml, "<p>HKSCDA 助養團隊</p>"].join(""),
  };
}

const PAYMENT_METHODS_ZH = [
  ["轉數快 FPS", "9864 1089"],
  ["銀行轉帳", "匯豐銀行 012-345-678901"],
  ["PayMe", "@hkscda"],
  ["PayPal", "paypal@hkscda.com"],
  ["Give.asia", "give.asia/hkscda"],
] as const;

const PAYMENT_METHODS_EN = [
  ["FPS", "9864 1089"],
  ["Bank Transfer", "HSBC 012-345-678901"],
  ["PayMe", "@hkscda"],
  ["PayPal", "paypal@hkscda.com"],
  ["Give.asia", "give.asia/hkscda"],
] as const;

export function renderPledgeConfirmationEmail(input: PledgeConfirmationEmailInput) {
  const supporterName = escapeHtml(input.supporterName);
  const reference = escapeHtml(input.reference);
  const amount = centsToHkd(input.amountCents);
  const statusLink = `<p><a href="${escapeHtml(input.statusUrl)}">${
    input.language === "en" ? "View sponsorship status" : "查看助養狀態"
  }</a></p>`;

  if (input.language === "en") {
    const paymentBlock =
      input.status === "pending_payment"
        ? [
            "<p>Please complete your first monthly payment using one of the following methods, and quote your reference:</p>",
            "<ul>",
            ...PAYMENT_METHODS_EN.map(
              ([label, value]) => `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`,
            ),
            "</ul>",
          ].join("")
        : "<p>We have received your payment proof and will confirm your sponsorship shortly.</p>";

    return wrapEmailEnvelope(
      "en",
      supporterName,
      [
        `<p>Thank you for pledging <strong>${amount}/month</strong>. Your reference is <strong>${reference}</strong>.</p>`,
        paymentBlock,
        statusLink,
      ].join(""),
      `HKSCDA received your sponsorship pledge ${input.reference}`,
    );
  }

  const paymentBlockZh =
    input.status === "pending_payment"
      ? [
          "<p>請使用以下其中一種方式完成首月付款，並註明您的參考編號：</p>",
          "<ul>",
          ...PAYMENT_METHODS_ZH.map(
            ([label, value]) => `<li>${escapeHtml(label)}：${escapeHtml(value)}</li>`,
          ),
          "</ul>",
        ].join("")
      : "<p>我們已收到您的付款證明，將盡快為您確認助養資格。</p>";

  return wrapEmailEnvelope(
    "zh-HK",
    supporterName,
    [
      `<p>多謝您承諾每月助養 <strong>${amount}</strong>，參考編號為 <strong>${reference}</strong>。</p>`,
      paymentBlockZh,
      statusLink,
    ].join(""),
    `HKSCDA 已收到您的助養承諾 ${input.reference}`,
  );
}

export type PledgeStatusUpdateEvent = "proof_recorded" | "active" | "needs_followup" | "cancelled";

type PledgeStatusUpdateEmailInput = {
  event: PledgeStatusUpdateEvent;
  language: "zh-HK" | "en";
  supporterName: string;
  reference: string;
  amountCents: number;
};

const SUPPORT_EMAIL = "info@hkscda.com";

function pledgeStatusUpdateBodyZh(
  event: PledgeStatusUpdateEvent,
  reference: string,
  amount: string,
) {
  switch (event) {
    case "proof_recorded":
      return `<p>我們已為您的助養承諾（參考編號 <strong>${reference}</strong>）記錄付款資料，將盡快為您審核。</p>`;
    case "active":
      return `<p>多謝您！您每月 <strong>${amount}</strong> 的助養承諾（參考編號 <strong>${reference}</strong>）已確認生效。</p>`;
    case "needs_followup":
      return [
        `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）的付款資料需要跟進，未能確認。</p>`,
        `<p>請重新提交付款證明，或電郵至 <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> 查詢，並註明參考編號。</p>`,
      ].join("");
    case "cancelled":
      return `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）已取消。如有疑問歡迎聯絡我們。</p>`;
  }
}

function pledgeStatusUpdateBodyEn(
  event: PledgeStatusUpdateEvent,
  reference: string,
  amount: string,
) {
  switch (event) {
    case "proof_recorded":
      return `<p>We have recorded a payment for your sponsorship pledge <strong>${reference}</strong> and will review it shortly.</p>`;
    case "active":
      return `<p>Thank you! Your <strong>${amount}</strong>/month sponsorship pledge <strong>${reference}</strong> is now confirmed and active.</p>`;
    case "needs_followup":
      return [
        `<p>We were unable to confirm the payment for your sponsorship pledge <strong>${reference}</strong>.</p>`,
        `<p>Please resubmit your payment proof, or email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> quoting your reference.</p>`,
      ].join("");
    case "cancelled":
      return `<p>Your sponsorship pledge <strong>${reference}</strong> has been cancelled. Please contact us if you have any questions.</p>`;
  }
}

const PLEDGE_STATUS_SUBJECT_ZH: Record<PledgeStatusUpdateEvent, string> = {
  proof_recorded: "HKSCDA 已收到您的付款記錄",
  active: "HKSCDA 助養已確認生效",
  needs_followup: "HKSCDA 助養付款需要跟進",
  cancelled: "HKSCDA 助養承諾已取消",
};

const PLEDGE_STATUS_SUBJECT_EN: Record<PledgeStatusUpdateEvent, string> = {
  proof_recorded: "HKSCDA recorded your sponsorship payment",
  active: "HKSCDA sponsorship confirmed",
  needs_followup: "HKSCDA sponsorship payment needs follow-up",
  cancelled: "HKSCDA sponsorship pledge cancelled",
};

export function renderPledgeStatusUpdateEmail(input: PledgeStatusUpdateEmailInput) {
  const supporterName = escapeHtml(input.supporterName);
  const reference = escapeHtml(input.reference);
  const amount = centsToHkd(input.amountCents);

  if (input.language === "en") {
    return wrapEmailEnvelope(
      "en",
      supporterName,
      pledgeStatusUpdateBodyEn(input.event, reference, amount),
      `${PLEDGE_STATUS_SUBJECT_EN[input.event]} ${input.reference}`,
    );
  }

  return wrapEmailEnvelope(
    "zh-HK",
    supporterName,
    pledgeStatusUpdateBodyZh(input.event, reference, amount),
    `${PLEDGE_STATUS_SUBJECT_ZH[input.event]} ${input.reference}`,
  );
}
