import { centsToHkd } from "../donations/domain";

type PledgeConfirmationEmailInput = {
  language: "zh-HK" | "en";
  supporterName: string;
  reference: string;
  amountCents: number;
  status: "pending_payment" | "provisional";
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

    return {
      subject: `HKSCDA received your sponsorship pledge ${input.reference}`,
      html: [
        `<p>Dear ${supporterName},</p>`,
        `<p>Thank you for pledging <strong>${amount}/month</strong>. Your reference is <strong>${reference}</strong>.</p>`,
        paymentBlock,
        "<p>HKSCDA Sponsorship Team</p>",
      ].join(""),
    };
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

  return {
    subject: `HKSCDA 已收到您的助養承諾 ${input.reference}`,
    html: [
      `<p>${supporterName} 您好：</p>`,
      `<p>多謝您承諾每月助養 <strong>${amount}</strong>，參考編號為 <strong>${reference}</strong>。</p>`,
      paymentBlockZh,
      "<p>HKSCDA 助養團隊</p>",
    ].join(""),
  };
}
