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
  ["轉數快 FPS", "FPS ID 8727588（登記電話 9864 1089）"],
  ["銀行轉帳", "匯豐銀行 124-511320-838"],
  ["PayMe", "WhatsApp 9864 1089 索取 PayMe QR Code"],
  ["PayPal", "https://goo.gl/X2XsY1"],
  ["Give.asia", "https://hkscda.give.asia"],
] as const;

const PAYMENT_METHODS_EN = [
  ["FPS", "FPS ID 8727588 (registered phone 9864 1089)"],
  ["Bank Transfer", "HSBC 124-511320-838"],
  ["PayMe", "Request the PayMe QR code via WhatsApp 9864 1089"],
  ["PayPal", "https://goo.gl/X2XsY1"],
  ["Give.asia", "https://hkscda.give.asia"],
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

export type PledgeStatusUpdateEvent =
  | "proof_recorded"
  | "active"
  | "needs_followup"
  | "cancelled"
  | "refund_recorded";

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
    case "refund_recorded":
      return `<p>您的助養付款（參考編號 <strong>${reference}</strong>）已記錄退款 <strong>${amount}</strong>。</p>`;
    case "proof_recorded":
      return `<p>我們已為您的助養承諾（參考編號 <strong>${reference}</strong>）記錄付款資料，將盡快為您審核。</p>`;
    case "active":
      return `<p>多謝您！您的助養付款 <strong>${amount}</strong>（參考編號 <strong>${reference}</strong>）已核實。</p>`;
    case "needs_followup":
      return [
        `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）的付款資料需要跟進，未能確認。</p>`,
        `<p>請重新提交付款證明，或電郵至 <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> 查詢，並註明參考編號。</p>`,
      ].join("");
    case "cancelled":
      return `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）已取消。如有疑問歡迎聯絡我們。</p>`;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled pledge status update event: ${_exhaustive}`);
    }
  }
}

function pledgeStatusUpdateBodyEn(
  event: PledgeStatusUpdateEvent,
  reference: string,
  amount: string,
) {
  switch (event) {
    case "refund_recorded":
      return `<p>A refund of <strong>${amount}</strong> has been recorded for your sponsorship payment <strong>${reference}</strong>.</p>`;
    case "proof_recorded":
      return `<p>We have recorded a payment for your sponsorship pledge <strong>${reference}</strong> and will review it shortly.</p>`;
    case "active":
      return `<p>Thank you! Your sponsorship payment of <strong>${amount}</strong> for <strong>${reference}</strong> has been verified.</p>`;
    case "needs_followup":
      return [
        `<p>We were unable to confirm the payment for your sponsorship pledge <strong>${reference}</strong>.</p>`,
        `<p>Please resubmit your payment proof, or email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> quoting your reference.</p>`,
      ].join("");
    case "cancelled":
      return `<p>Your sponsorship pledge <strong>${reference}</strong> has been cancelled. Please contact us if you have any questions.</p>`;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled pledge status update event: ${_exhaustive}`);
    }
  }
}

const PLEDGE_STATUS_SUBJECT_ZH: Record<PledgeStatusUpdateEvent, string> = {
  refund_recorded: "HKSCDA 助養退款已記錄",
  proof_recorded: "HKSCDA 已收到您的付款記錄",
  active: "HKSCDA 助養付款已核實",
  needs_followup: "HKSCDA 助養付款需要跟進",
  cancelled: "HKSCDA 助養承諾已取消",
};

const PLEDGE_STATUS_SUBJECT_EN: Record<PledgeStatusUpdateEvent, string> = {
  refund_recorded: "HKSCDA sponsorship refund recorded",
  proof_recorded: "HKSCDA recorded your sponsorship payment",
  active: "HKSCDA sponsorship payment verified",
  needs_followup: "HKSCDA sponsorship payment needs follow-up",
  cancelled: "HKSCDA sponsorship pledge cancelled",
};

/**
 * Renders the bilingual lifecycle-status notification sent to a sponsor
 * whenever staff record/review a payment proof or cancel a pledge.
 *
 * Not yet called from a production code path: the caller
 * (`sendPledgeStatusUpdateEmail` in `sponsorshipAdmin/notifications.server.ts`,
 * wired into `sponsorshipAdmin/service.ts`'s recordPayment/reviewProof/
 * cancelPledge orchestration) is a later task in the same admin-review plan
 * (see `docs/superpowers/plans/2026-08-29-sponsorship-admin-review.md`,
 * Task 6), not dead code left behind.
 */
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
