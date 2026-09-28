import type { z } from "zod";
import type {
  monthlyTierSchema,
  paymentMethodSchema,
  sponsorshipLanguageSchema,
  SponsorshipPledgeStatus,
} from "../sponsorship/schemas";
import type { CandidateAnimalState } from "./autoAssign";

export type PledgeStatus = SponsorshipPledgeStatus;

export type PledgeAnimalPreference = {
  id: string;
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
  /** The animal's current state, for the auto-assign rule. `null` if unreadable. */
  animalState: CandidateAnimalState | null;
};

export type PaymentProofRecord = {
  revision: number;
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

/**
 * One month of a sponsorship. `committedCents` is what the month asked for;
 * `allocatedCents` is the sum of the payments attributed to it, so the two are
 * never the same number stored twice.
 */
export type SponsorshipPeriodRecord = {
  id: string;
  /** First day of the month, `YYYY-MM-01`. */
  periodMonth: string;
  committedCents: number;
  allocatedCents: number;
  /** `committedCents - allocatedCents`, floored at zero. */
  outstandingCents: number;
  allocations: PaymentAllocationRecord[];
};

/**
 * Attribution of one approved payment to one month — not a second revenue row.
 * A negative `amountCents` is a reversal and names the entry it undoes.
 */
export type PaymentAllocationRecord = {
  id: string;
  proofId: string;
  amountCents: number;
  reversesAllocationId: string | null;
  note: string | null;
  createdAt: string;
};

/** Why a confirmed relationship ended. */
export type AssignmentEndReason =
  | "adopted"
  | "deceased"
  | "ineligible"
  | "retired"
  | "supporter_request"
  | "transferred"
  | "other";

/**
 * A confirmed supporter–animal relationship. Carries no amount: the pledge's
 * monthly commitment is not divided per animal.
 */
export type SponsorshipAssignmentRecord = {
  id: string;
  animalId: string | null;
  animalNameSnapshot: string;
  startedOn: string;
  endedOn: string | null;
  endReason: AssignmentEndReason | null;
  /** Why this animal was confirmed. Immutable once written. */
  note: string | null;
  /**
   * Why the relationship ended. A SEPARATE column on purpose: ending used to
   * overwrite `note`, destroying the reason the animal was chosen.
   */
  endNote: string | null;
  /** The assigned animal's current state. `null` when unreadable. */
  animalState: CandidateAnimalState | null;
  /**
   * Why this open assignment needs a person to look: the animal has been
   * adopted, has died, has been retired, or has left the sponsorship
   * programme. `null` when nothing is wrong. Derived, never stored.
   */
  reviewReason: "adopted" | "deceased" | "retired" | "ineligible" | null;
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
  followupAssigneeUserId?: string | null;
  followupVersion?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PledgeDetail = PledgeSummary & {
  contactSubmission?: {
    supporterName: string;
    email: string;
    phone: string;
    source: string;
    status: string;
  } | null;
  notes: string | null;
  supporterPhone: string | null;
  preferences: PledgeAnimalPreference[];
  proofHistory: PaymentProofRecord[];
  currentProof: PaymentProofRecord | null;
  /** The monthly ledger, oldest month first. */
  periods: SponsorshipPeriodRecord[];
  /** Confirmed animals, open ones first, then ended ones newest-first. */
  assignments: SponsorshipAssignmentRecord[];
  /**
   * The sponsorship is running but backs no animal — the money keeps arriving
   * and a person must choose one. Derived, never stored.
   */
  needsAnimal: boolean;
  recentAuditLog: PledgeAuditEntry[];
};

export type PledgeListSearch = {
  status?: PledgeStatus;
  proof?: "pending";
  q?: string;
  page: number;
  pageSize: number;
};

export type RecordPledgePaymentInput = {
  idempotencyKey: string;
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
  proofId: string;
  expectedRevision: number;
  idempotencyKey: string;
  decision: "approve" | "reject";
  note?: string | null;
};

export type CancelPledgeInput = {
  note?: string | null;
};

export type ProofReviewResult = {
  kind: "reviewed";
  proofId: string;
  revision: number;
  decision: "approve" | "reject";
  allocations: Array<{ periodMonth: string; amountCents: number }>;
  replayed?: boolean;
};
