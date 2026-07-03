import type { z } from "zod";
import type {
  monthlyTierSchema,
  paymentMethodSchema,
  sponsorshipLanguageSchema,
  SponsorshipPledgeStatus,
} from "../sponsorship/schemas";

export type PledgeStatus = SponsorshipPledgeStatus;

export type PledgeAnimalPreference = {
  id: string;
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
};

export type PaymentProofRecord = {
  id: string;
  pledgeId: string;
  storagePath: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  paymentMethod: string;
  reference: string | null;
  amountCents: number;
  paymentDate: string;
  reviewStatus: "pending" | "approved" | "rejected";
  source: "public" | "staff";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type PledgeAuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export type PledgeSummary = {
  id: string;
  supporterId: string;
  supporterName: string;
  supporterEmail: string | null;
  monthlyTier: z.infer<typeof monthlyTierSchema>;
  amountCents: number;
  currency: string;
  language: z.infer<typeof sponsorshipLanguageSchema>;
  status: PledgeStatus;
  createdAt: string;
  updatedAt: string;
};

export type PledgeDetail = PledgeSummary & {
  notes: string | null;
  supporterPhone: string | null;
  preferences: PledgeAnimalPreference[];
  proofHistory: PaymentProofRecord[];
  currentProof: PaymentProofRecord | null;
  recentAuditLog: PledgeAuditEntry[];
};

export type PledgeListSearch = {
  status?: PledgeStatus;
  q?: string;
  page: number;
  pageSize: number;
};

export type RecordPledgePaymentInput = {
  paymentMethod: z.infer<typeof paymentMethodSchema>;
  reference?: string | null;
  amountCents: number;
  paymentDate: string;
  note?: string | null;
  file?: {
    storagePath: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null;
};

/**
 * Flattened shape the repository's `recordPayment` actually consumes: the
 * proof file fields are required top-level siblings here (the caller must
 * have already resolved/unwrapped the optional file), unlike
 * `RecordPledgePaymentInput.file`, which is a nullable/optional nested
 * object coming straight off the request schema. Callers should map from
 * `RecordPledgePaymentInput` to this type explicitly rather than relying on
 * structural overlap. The file fields are nullable — a manually-recorded
 * payment does not require an attached proof file (per the design spec).
 */
export type RecordPledgePaymentRepoInput = Omit<RecordPledgePaymentInput, "file"> & {
  pledgeId: string;
  actorUserId: string;
  storagePath: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
};

export type ReviewPledgeProofInput = {
  decision: "approve" | "reject";
  note?: string | null;
};

export type CancelPledgeInput = {
  note?: string | null;
};
