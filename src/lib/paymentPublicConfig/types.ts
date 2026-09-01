export type PaymentPublicConfigMethod = "stripe" | "payme" | "fps" | "paypal" | "alipayhk";
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
