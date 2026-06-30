import type { StatusTone } from "../StatusBadge";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentProvider = "stripe" | "paypal" | "fps" | "payme" | "manual";

export type AdminPaymentRow = {
  id: string;
  provider: PaymentProvider;
  provider_ref: string | null;
  amount_cents: number;
  status: PaymentStatus;
  received_at: string | null;
  bank_reference: string | null;
  created_at: string;
  donation: {
    id: string;
    purpose: string;
    receipt_requested: boolean;
    status: PaymentStatus;
    supporter: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      language: "zh-HK" | "en";
    };
  };
};

export type AdminReceiptRow = {
  id: string;
  receipt_no: string;
  donation_ids: string[];
  status: "issued" | "void";
};

export type PillSpec = { tone: StatusTone; label: string };

export type PaymentFilters = {
  status: PaymentStatus | "all";
  provider: PaymentProvider | "all";
  search: string;
};

export type PaymentsSummary = {
  awaitingReconcile: number;
  awaitingReceipt: number;
  confirmedAmountCents: number;
};

export const MANUAL_PROVIDERS: PaymentProvider[] = ["fps", "payme", "manual"];

const PAYMENT_PILLS: Record<PaymentStatus, PillSpec> = {
  pending: { tone: "warning", label: "待確認" },
  succeeded: { tone: "success", label: "已確認" },
  failed: { tone: "danger", label: "失敗" },
  refunded: { tone: "neutral", label: "已退款" },
};

export function paymentStatusPill(status: PaymentStatus): PillSpec {
  return PAYMENT_PILLS[status];
}

export function findIssuedReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((r) => r.status === "issued" && r.donation_ids.includes(donationId));
}

function findVoidReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((r) => r.status === "void" && r.donation_ids.includes(donationId));
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

export function canReconcile(payment: AdminPaymentRow): boolean {
  return payment.status === "pending" && MANUAL_PROVIDERS.includes(payment.provider);
}

export function canIssueReceipt(payment: AdminPaymentRow, receipts: AdminReceiptRow[]): boolean {
  return (
    payment.donation.status === "succeeded" &&
    payment.donation.receipt_requested &&
    !findIssuedReceipt(payment.donation.id, receipts)
  );
}

export function canVoidReceipt(payment: AdminPaymentRow, receipts: AdminReceiptRow[]): boolean {
  return Boolean(findIssuedReceipt(payment.donation.id, receipts));
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

export function summarizePayments(
  payments: AdminPaymentRow[],
  receipts: AdminReceiptRow[],
): PaymentsSummary {
  let awaitingReconcile = 0;
  let awaitingReceipt = 0;
  let confirmedAmountCents = 0;
  for (const payment of payments) {
    if (canReconcile(payment)) awaitingReconcile += 1;
    if (canIssueReceipt(payment, receipts)) awaitingReceipt += 1;
    if (payment.status === "succeeded") confirmedAmountCents += payment.amount_cents;
  }
  return { awaitingReconcile, awaitingReceipt, confirmedAmountCents };
}

const FINANCE_ACTION_LABELS: Record<string, string> = {
  "payment.mark_received": "標記已收款",
  "receipt.issue": "發收條",
  "receipt.void": "作廢收條",
};

export function financeActionLabel(action: string): string {
  return FINANCE_ACTION_LABELS[action] ?? action;
}
