import { z } from "zod";

import type { AdminRole } from "../admin/access";

export const PAYMENT_RECONCILE_PAGE_SIZE = 25;

export const paymentStatuses = ["pending", "succeeded", "failed", "refunded"] as const;
export const paymentProviders = ["stripe", "paypal", "fps", "payme", "manual"] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];
export type PaymentProvider = (typeof paymentProviders)[number];

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
    custom_purpose: string | null;
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

export type PaymentFilters = {
  status: PaymentStatus | "all";
  provider: PaymentProvider | "all";
  search: string;
};

export type AdminPaymentSearch = PaymentFilters & {
  q?: string;
  page: number;
  pageSize: number;
};

export type PaymentsSummary = {
  awaitingReconcile: number;
  awaitingReceipt: number;
  confirmedAmountCents: number;
};

export type SummarizablePaymentRow = Pick<
  AdminPaymentRow,
  "amount_cents" | "provider" | "status"
> & {
  donation: Pick<AdminPaymentRow["donation"], "id" | "receipt_requested" | "status">;
};

export type AdminPaymentListResult = {
  payments: AdminPaymentRow[];
  receipts: AdminReceiptRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: PaymentsSummary;
};

export const MANUAL_PROVIDERS: PaymentProvider[] = ["fps", "payme", "manual"];

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

export const adminPaymentSearchSchema = z.object({
  q: optionalTrimmed,
  status: z.enum(["all", ...paymentStatuses]).catch("all"),
  provider: z.enum(["all", ...paymentProviders]).catch("all"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(PAYMENT_RECONCILE_PAGE_SIZE),
});

export const adminPaymentExportSearchSchema = adminPaymentSearchSchema.omit({
  page: true,
  pageSize: true,
});

function positiveInteger(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function setTrimmed(params: URLSearchParams, key: string, value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
}

export function buildPaymentSearchParams(
  input: Partial<PaymentFilters> & { page?: number | null; pageSize?: number | null },
) {
  const params = new URLSearchParams();
  setTrimmed(params, "q", input.search);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.provider && input.provider !== "all") params.set("provider", input.provider);
  params.set("page", String(positiveInteger(input.page, 1)));
  params.set("pageSize", String(positiveInteger(input.pageSize, PAYMENT_RECONCILE_PAGE_SIZE)));
  return params;
}

export function buildPaymentExportSearchParams(input: Partial<PaymentFilters>) {
  const params = new URLSearchParams();
  setTrimmed(params, "q", input.search);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.provider && input.provider !== "all") params.set("provider", input.provider);
  return params;
}

export function findIssuedReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find(
    (receipt) => receipt.status === "issued" && receipt.donation_ids.includes(donationId),
  );
}

export function findVoidReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find(
    (receipt) => receipt.status === "void" && receipt.donation_ids.includes(donationId),
  );
}

function canManageTreasurerActions(role?: AdminRole | null) {
  return role === undefined || role === "treasurer" || role === "admin";
}

export function canReconcile(payment: AdminPaymentRow, role?: AdminRole | null): boolean {
  return (
    canManageTreasurerActions(role) &&
    payment.status === "pending" &&
    MANUAL_PROVIDERS.includes(payment.provider)
  );
}

export function canIssueReceipt(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
  role?: AdminRole | null,
): boolean {
  return (
    canManageTreasurerActions(role) &&
    payment.donation.status === "succeeded" &&
    payment.donation.receipt_requested &&
    !findIssuedReceipt(payment.donation.id, receipts)
  );
}

export function canVoidReceipt(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
  role?: AdminRole | null,
): boolean {
  return (
    canManageTreasurerActions(role) && Boolean(findIssuedReceipt(payment.donation.id, receipts))
  );
}

export function summarizePayments(
  payments: SummarizablePaymentRow[],
  receipts: AdminReceiptRow[],
): PaymentsSummary {
  let awaitingReconcile = 0;
  let awaitingReceipt = 0;
  let confirmedAmountCents = 0;
  for (const payment of payments) {
    if (payment.status === "pending" && MANUAL_PROVIDERS.includes(payment.provider)) {
      awaitingReconcile += 1;
    }
    if (
      payment.donation.status === "succeeded" &&
      payment.donation.receipt_requested &&
      !findIssuedReceipt(payment.donation.id, receipts)
    ) {
      awaitingReceipt += 1;
    }
    if (payment.status === "succeeded") confirmedAmountCents += payment.amount_cents;
  }
  return { awaitingReconcile, awaitingReceipt, confirmedAmountCents };
}
