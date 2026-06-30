export const crmLanguages = ["zh-HK", "en"] as const;
export const supporterRoles = ["donor", "adopter", "volunteer", "foster"] as const;
export const consentChannels = ["email", "whatsapp"] as const;
export const consentStatuses = ["opt_in", "opt_out"] as const;
export const donationPurposes = ["general", "medical", "sponsor"] as const;
export const manualDonationMethods = ["manual", "fps", "payme"] as const;
export const paymentStatuses = ["pending", "succeeded"] as const;

export type CrmLanguage = (typeof crmLanguages)[number];
export type SupporterRole = (typeof supporterRoles)[number];
export type ConsentChannel = (typeof consentChannels)[number];
export type ConsentStatus = (typeof consentStatuses)[number];
export type DonationPurpose = (typeof donationPurposes)[number];
export type ManualDonationMethod = (typeof manualDonationMethods)[number];
export type ManualPaymentStatus = (typeof paymentStatuses)[number];

export type SupporterSummary = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: CrmLanguage;
  tags: string[];
  roles: SupporterRole[];
  deletedAt: string | null;
  lastGiftAt: string | null;
  lastGiftAmountCents: number | null;
  lifetimeAmountCents: number;
  donationCount: number;
  receiptNeeded: boolean;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

export type SupporterDetail = SupporterSummary & {
  source: string;
  createdAt: string;
  updatedAt: string;
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
  timeline: SupporterTimelineItem[];
};

export type DonationHistoryRow = {
  id: string;
  amountCents: number;
  currency: "HKD";
  purpose: DonationPurpose;
  status: "pending" | "succeeded" | "failed" | "refunded";
  method: "stripe" | "paypal" | "fps" | "payme" | "manual";
  receiptRequested: boolean;
  createdAt: string;
};

export type PaymentHistoryRow = {
  id: string;
  donationId: string;
  provider: "stripe" | "paypal" | "fps" | "payme" | "manual";
  providerRef: string | null;
  amountCents: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
  receivedAt: string | null;
  bankReference: string | null;
  createdAt: string;
};

export type ReceiptHistoryRow = {
  id: string;
  receiptNo: string;
  donationIds: string[];
  totalAmountCents: number;
  issuedAt: string;
  status: "issued" | "void";
  pdfUrl: string | null;
};

export type ConsentHistoryRow = {
  id: string;
  supporterId: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  source: string;
  timestamp: string;
};

export type MessageHistoryRow = {
  id: string;
  channel: ConsentChannel;
  status: "queued" | "sent" | "delivered" | "failed";
  payload: Record<string, unknown>;
  sentAt: string | null;
  createdAt: string;
};

export type AuditHistoryRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  detail: Record<string, unknown>;
};

export type SupporterTimelineItem = {
  id: string;
  at: string;
  kind: "donation" | "payment" | "receipt" | "consent" | "message" | "audit";
  title: string;
  description: string;
  amountCents?: number;
  status?: string;
};
