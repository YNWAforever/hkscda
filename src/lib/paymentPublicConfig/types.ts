import type { DonationMethod } from "../donations/contracts";

// Kept as a distinct name for readability at payment-config call sites, but
// deliberately aliased rather than re-listed: payment_public_config.method
// must always accept exactly the same values /donate can render, so there is
// only one array (donationMethods in donations/contracts.ts) to ever update.
export type PaymentPublicConfigMethod = DonationMethod;
export type PaymentPublicConfigState = "draft" | "in_review" | "published" | "archived";

export type PaymentPublicConfig = {
  id: string;
  method: PaymentPublicConfigMethod;
  isPubliclyVisible: boolean;
  displayLabelZh: string;
  displayLabelEn: string;
  sortOrder: number;
  details: Record<string, string>;
  state: PaymentPublicConfigState;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaymentMethod = {
  method: PaymentPublicConfigMethod;
  displayLabelZh: string;
  displayLabelEn: string;
  details: Record<string, string>;
};
