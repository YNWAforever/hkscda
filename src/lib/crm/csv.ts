import type { SupporterSummary } from "./types";

export type DonationExportRow = {
  supporterId: string;
  supporterName: string;
  supporterEmail: string;
  donationId: string;
  amountCents: number;
  purpose: string;
  customPurpose: string | null;
  status: string;
  method: string;
  receiptRequested: boolean;
  receiptNo: string | null;
  createdAt: string;
};

function centsToDecimal(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export function escapeCsvValue(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildCsv(headers: string[], rows: unknown[][]) {
  return [headers.join(","), ...rows.map((row) => row.map(escapeCsvValue).join(","))].join("\n");
}

export function buildSupporterCsv(rows: SupporterSummary[]) {
  return buildCsv(
    [
      "supporter_id",
      "name",
      "email",
      "phone",
      "language",
      "roles",
      "tags",
      "lifetime_hkd",
      "last_gift_hkd",
      "last_gift_at",
      "donation_count",
      "receipt_needed",
      "email_consent",
      "whatsapp_consent",
      "deleted_at",
    ],
    rows.map((row) => [
      row.id,
      row.name,
      row.email,
      row.phone,
      row.language,
      row.roles.join("|"),
      row.tags.join("|"),
      centsToDecimal(row.lifetimeAmountCents),
      row.lastGiftAmountCents === null ? "" : centsToDecimal(row.lastGiftAmountCents),
      row.lastGiftAt,
      row.donationCount,
      row.receiptNeeded,
      row.emailConsent,
      row.whatsappConsent,
      row.deletedAt,
    ]),
  );
}

export function buildDonationCsv(rows: DonationExportRow[]) {
  return buildCsv(
    [
      "supporter_id",
      "supporter_name",
      "supporter_email",
      "donation_id",
      "amount_hkd",
      "purpose",
      "其他用途",
      "status",
      "method",
      "receipt_requested",
      "receipt_no",
      "created_at",
    ],
    rows.map((row) => [
      row.supporterId,
      row.supporterName,
      row.supporterEmail,
      row.donationId,
      centsToDecimal(row.amountCents),
      row.purpose,
      row.customPurpose,
      row.status,
      row.method,
      row.receiptRequested,
      row.receiptNo,
      row.createdAt,
    ]),
  );
}

export type PaymentExportRow = {
  paymentId: string;
  supporterName: string;
  supporterEmail: string;
  provider: string;
  amountCents: number;
  purpose: string;
  customPurpose: string | null;
  status: string;
  providerRef: string | null;
  bankReference: string | null;
  receivedAt: string | null;
  createdAt: string;
};

export function buildPaymentCsv(rows: PaymentExportRow[]) {
  return buildCsv(
    [
      "payment_id",
      "supporter_name",
      "supporter_email",
      "provider",
      "amount_hkd",
      "purpose",
      "其他用途",
      "status",
      "provider_ref",
      "bank_reference",
      "received_at",
      "created_at",
    ],
    rows.map((row) => [
      row.paymentId,
      row.supporterName,
      row.supporterEmail,
      row.provider,
      centsToDecimal(row.amountCents),
      row.purpose,
      row.customPurpose,
      row.status,
      row.providerRef,
      row.bankReference,
      row.receivedAt,
      row.createdAt,
    ]),
  );
}
