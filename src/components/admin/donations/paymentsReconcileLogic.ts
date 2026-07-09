import type { StatusTone } from "../StatusBadge";

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

const PAYMENT_PILLS: Record<PaymentStatus, PillSpec> = {
  pending: { tone: "warning", label: "待確認" },
  succeeded: { tone: "success", label: "已確認" },
  failed: { tone: "danger", label: "失敗" },
  refunded: { tone: "neutral", label: "已退款" },
};

export function paymentStatusPill(status: PaymentStatus): PillSpec {
  return PAYMENT_PILLS[status];
}

export function receiptPill(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
): PillSpec | null {
  const issued = findIssuedReceipt(payment.donation.id, receipts);
  if (issued) return { tone: "success", label: `已發 ${issued.receipt_no}` };
  if (canIssueReceipt(payment, receipts)) return { tone: "warning", label: "待發收條" };
  if (findVoidReceipt(payment.donation.id, receipts)) return { tone: "neutral", label: "已作廢" };
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

const FINANCE_ACTION_LABELS: Record<string, string> = {
  "payment.mark_received": "標記已收款",
  "receipt.issue": "發收條",
  "receipt.void": "作廢收條",
};

export function financeActionLabel(action: string): string {
  return FINANCE_ACTION_LABELS[action] ?? action;
}
