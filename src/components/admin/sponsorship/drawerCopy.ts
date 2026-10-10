import { defineAdminCopy } from "../i18n/copy";
import { formatAdminMoney } from "../i18n/format";
import { pledgePageCopy } from "../pageCopy/pledgeCopy";

/**
 * Copy for the pledge detail drawer that is not in `pageCopy/pledgeCopy.ts` (which holds the
 * drawer's title, its forms and its errors): the monthly ledger, the tier and the words for a
 * stored payment method or activity code. The finance panel inside the drawer is in
 * `financeCopy.ts`, the reminder draft in `bulkCopy.ts`.
 */

/** The English names of the payment methods, from the record payment form. */
const EN_PAYMENT_METHODS: Record<string, string> = pledgePageCopy.en.pledgeReview.paymentMethods;

const EN_AUDIT_ACTIONS: Record<string, string> = {
  "sponsorship_pledge.proof_recorded": "Payment proof recorded",
  "sponsorship_pledge.proof_reviewed": "Payment proof reviewed",
  "sponsorship_pledge.assign_followup": "Follow-up owner assigned",
  "sponsorship_pledge.cancelled": "Sponsorship cancelled",
  "sponsorship_pledge.payment_allocated": "Payment allocated to a month",
  "sponsorship_pledge.allocation_reversed": "Allocation reversed",
  "sponsorship_pledge.payment_reallocated": "Payment reallocated",
  "sponsorship_pledge.refund_recorded": "Refund recorded",
  "sponsorship_pledge.money_reconciled": "Payment reconciled",
  "sponsorship_pledge.receipt_requested": "Receipt requested",
  "sponsorship_pledge.followup_months_opened": "Follow-up months created",
  "sponsorship_pledge.consent_email_requested": "Email consent requested",
  "sponsorship_pledge.consent_whatsapp_requested": "WhatsApp consent requested",
  "sponsorship_pledge.animal_assigned": "Animal added",
  "sponsorship_pledge.animal_assignment_ended": "Sponsorship of an animal ended",
};

/** A stored code as a plain phrase: `proof_reviewed` and `a.proof_reviewed` read "Proof reviewed". */
function plainPhrase(code: string): string {
  const phrase = code.slice(code.lastIndexOf(".") + 1).replaceAll("_", " ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export const pledgeDrawerCopy = defineAdminCopy({
  zh: {
    /** The pledge could not be loaded: the reason the server gave, as it came. */
    loadFailed: (reason: string) => reason,
    /** The tier next to the monthly amount: its amount in dollars, or the tier as stored. */
    tierAmount: (tier: string) =>
      Number.isFinite(Number(tier)) ? formatAdminMoney(Number(tier), "zh") : tier,
    withTier: (monthly: string, tier: string) => `${monthly}（${tier}）`,
    /** A stored payment method is shown as its code, as it always has been. */
    paymentMethodName: (code: string) => code,
    /** A stored activity code is shown as it is, as it always has been. */
    auditAction: (code: string) => code,
    periodsTitle: "助養月份",
    paid: "已付",
    unpaid: "待付",
    periodLine: (committed: string, allocated: string, outstanding: string | null) =>
      `每月意向 ${committed} · 已分配 ${allocated}` +
      (outstanding === null ? "" : ` · 待跟進 ${outstanding}（非債務）`),
    /** Why a chosen payment proof file cannot be attached, by the code the form keeps. */
    proofFileErrors: {
      unsupported_type: "檔案格式不支援，請上載 JPG、PNG、WEBP 或 PDF 檔案",
      too_large: "檔案大小超過上限（8MB）",
    },
  },
  en: {
    loadFailed: (reason: string) =>
      `${reason}${/[.!?]$/.test(reason) ? "" : "."} Close this panel and open the pledge again.`,
    tierAmount: (tier: string) =>
      Number.isFinite(Number(tier)) ? `${formatAdminMoney(Number(tier), "en")} tier` : tier,
    withTier: (monthly: string, tier: string) => `${monthly} (${tier})`,
    paymentMethodName: (code: string) => EN_PAYMENT_METHODS[code] ?? plainPhrase(code),
    auditAction: (code: string) => EN_AUDIT_ACTIONS[code] ?? plainPhrase(code),
    periodsTitle: "Sponsorship months",
    paid: "Paid",
    unpaid: "Unpaid",
    periodLine: (committed: string, allocated: string, outstanding: string | null) =>
      `Monthly pledge ${committed} · Allocated ${allocated}` +
      (outstanding === null ? "" : ` · Outstanding for follow-up ${outstanding} (not a debt)`),
    proofFileErrors: {
      unsupported_type: "This file type is not supported. Upload a JPG, PNG, WEBP or PDF file.",
      // A file with no content is refused with the same code as one that is too big.
      too_large: "The file is empty or larger than the 8MB limit. Choose another file.",
    },
  },
});
