import type { StatusTone } from "../StatusBadge";
import type { paymentsCopy } from "./copy";

import type {
  AdminPaymentListResult,
  AdminPaymentRow,
  AdminReceiptRow,
  PaymentFilters,
  PaymentProvider,
  PaymentStatus,
  PaymentsSummary,
} from "../../../lib/donations/adminPayments";

import {
  adminPaymentExportSearchSchema,
  adminPaymentSearchSchema,
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  canIssueReceipt,
  canReconcile,
  canVoidReceipt,
  findIssuedReceipt,
  findVoidReceipt,
  summarizePayments,
} from "../../../lib/donations/adminPayments";

export {
  adminPaymentExportSearchSchema,
  adminPaymentSearchSchema,
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  canIssueReceipt,
  canReconcile,
  canVoidReceipt,
  findIssuedReceipt,
  findVoidReceipt,
  summarizePayments,
};

export type {
  AdminPaymentListResult,
  AdminPaymentRow,
  AdminReceiptRow,
  PaymentFilters,
  PaymentProvider,
  PaymentStatus,
  PaymentsSummary,
};

export type PillSpec = { tone: StatusTone; label: string };

type PaymentsCopyHalf = (typeof paymentsCopy)["zh"];

/** The half of the payments copy these helpers read; pass the one for the screen's language. */
export type PaymentsLabels = Pick<
  PaymentsCopyHalf,
  | "paymentStatus"
  | "purposeLabel"
  | "purposeWithNote"
  | "receiptIssued"
  | "receiptAwaiting"
  | "receiptVoided"
>;

const PAYMENT_TONES: Record<PaymentStatus, StatusTone> = {
  pending: "warning",
  succeeded: "success",
  failed: "danger",
  refunded: "neutral",
};

export function paymentStatusPill(status: PaymentStatus, labels: PaymentsLabels): PillSpec {
  return { tone: PAYMENT_TONES[status], label: labels.paymentStatus[status] };
}

export function paymentPurposeText(
  donation: Pick<AdminPaymentRow["donation"], "purpose" | "custom_purpose">,
  labels: PaymentsLabels,
) {
  return donation.custom_purpose
    ? labels.purposeWithNote(donation.purpose, donation.custom_purpose)
    : labels.purposeLabel(donation.purpose);
}

export function receiptPill(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
  labels: PaymentsLabels,
): PillSpec | null {
  const issued = findIssuedReceipt(payment.donation.id, receipts);
  if (issued) return { tone: "success", label: labels.receiptIssued(issued.receipt_no) };
  if (canIssueReceipt(payment, receipts)) return { tone: "warning", label: labels.receiptAwaiting };
  if (findVoidReceipt(payment.donation.id, receipts))
    return { tone: "neutral", label: labels.receiptVoided };
  return null;
}

export function applyPaymentFilters(
  payments: AdminPaymentRow[],
  filters: PaymentFilters,
): AdminPaymentRow[] {
  const search = filters.search.trim().toLowerCase();
  return payments.filter((payment) => {
    if (filters.status !== "all" && payment.status !== filters.status) return false;
    if (filters.provider !== "all" && payment.provider !== filters.provider) return false;
    if (!search) return true;
    const haystack = [
      payment.donation.supporter.name,
      payment.donation.supporter.email,
      payment.provider_ref ?? "",
      payment.bank_reference ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}
