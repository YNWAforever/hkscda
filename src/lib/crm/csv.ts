import type { SupporterSummary } from "./types";

export type DonationExportRow = {
  supporterId: string;
  supporterName: string;
  supporterEmail: string;
  donationId: string;
  amountCents: number;
  purpose: string;
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
  const text = value === null || value === undefined ? "" : String(value);
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
      row.status,
      row.method,
      row.receiptRequested,
      row.receiptNo,
      row.createdAt,
    ]),
  );
}
