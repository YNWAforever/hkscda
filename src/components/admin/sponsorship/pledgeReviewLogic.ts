import type { StatusTone } from "../StatusBadge";
import { MAX_PROOF_BYTES, PROOF_MIME_TYPES } from "../../../lib/sponsorship/schemas";
import {
  PledgeSelectionError,
  type PledgeSelectionErrorCode,
} from "../../../lib/sponsorshipAdmin/followupBulkSelection";
import { hasProofAwaitingReview } from "../../../lib/sponsorshipAdmin/proofReview";
import type { ReviewableProof } from "../../../lib/sponsorshipAdmin/proofReview";
import { sponsorshipServerErrorCode } from "../../../lib/sponsorshipAdmin/serverErrors";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

/**
 * Why the detail drawer shows an error: the key of the page copy's `pledgeReview.errors`. The
 * drawer keeps it with the caught error, if any, and writes the message for the admin's
 * language when it renders.
 */
export type ActionError = {
  code:
    | "review"
    | "assignAnimal"
    | "endAssignment"
    | "proofReviewChanged"
    | "followupConflict"
    | "followupUnknown"
    | "recordPayment";
  cause?: unknown;
};

/**
 * The error to keep for a failed drawer action: the code of a message the sponsorship API sends
 * in zh-HK, or the caught error under the action's own code, to show as it came.
 */
export function actionFailure(
  cause: unknown,
  fallback: "review" | "assignAnimal" | "endAssignment" | "recordPayment",
): ActionError {
  const code = sponsorshipServerErrorCode(cause);
  return code ? { code } : { code: fallback, cause };
}

/**
 * Why the selection controls on the pledge list show an error: the selection helpers' own code,
 * or one of the list's. The list keeps it with the caught error, if any, and writes the
 * message for the admin's language when it renders.
 */
export type SelectionError = {
  code: PledgeSelectionErrorCode | "select_failed" | "pin_failed" | "filter_changed";
  cause?: unknown;
};

/** The error to keep for a failed selection: the helpers' own code, or the caught error. */
export function selectionFailure(
  cause: unknown,
  fallback: "select_failed" | "pin_failed",
): SelectionError {
  return cause instanceof PledgeSelectionError ? { code: cause.code } : { code: fallback, cause };
}

export type PledgeListFilters = {
  q?: string;
  status?: string;
  proof?: string;
  page?: number;
  pageSize?: number;
};

function trimmed(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : "";
}

function normalizedPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

export function buildPledgeListSearchParams(filters: PledgeListFilters) {
  const params = new URLSearchParams();
  const q = trimmed(filters.q);
  const status = trimmed(filters.status);
  const proof = trimmed(filters.proof);

  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (proof === "pending") params.set("proof", proof);
  params.set("page", String(normalizedPositiveInteger(filters.page, 1)));
  params.set("pageSize", String(normalizedPositiveInteger(filters.pageSize, 25)));
  return params;
}

export function formatFallback(value: string | null | undefined) {
  return trimmed(value) || "-";
}

const PLEDGE_STATUS_TONE: Record<PledgeStatus, StatusTone> = {
  pending_payment: "warning",
  provisional: "info",
  active: "success",
  needs_followup: "danger",
  cancelled: "neutral",
};

export function pledgeStatusTone(status: PledgeStatus): StatusTone {
  return PLEDGE_STATUS_TONE[status];
}

/**
 * Statuses for which the "record payment" form should be shown in the detail
 * drawer.
 *
 * `active` is included because a sponsorship is monthly: the second month's
 * payment is recorded against a pledge that is already running, and omitting
 * it here left staff no way to record one. Mirrors the status list in
 * `record_sponsorship_payment_proof`
 * (`20260911180000_sponsorship_second_month.sql`).
 *
 * `provisional` stays out: a proof is already queued, and the outstanding one
 * should be decided first. `cancelled` stays out for the obvious reason.
 */
export function canRecordPayment(status: PledgeStatus): boolean {
  return status === "pending_payment" || status === "needs_followup" || status === "active";
}

/**
 * Whether the "review payment proof" form should be shown in the detail
 * drawer.
 *
 * Keyed on the proofs, not the pledge's status. A running sponsorship whose
 * latest month is queued has status `active`, so a status test would hide the
 * only control that can clear it; and a `provisional` pledge whose proof was
 * already decided would offer buttons that the database rejects. Both
 * questions are answered by whether anything is actually awaiting review.
 */
export function canReviewProof(proofs: readonly ReviewableProof[]): boolean {
  return hasProofAwaitingReview(proofs);
}

/** Statuses for which the "cancel sponsorship" action should be shown in the detail drawer. */
export function canCancelPledge(status: PledgeStatus): boolean {
  return status !== "cancelled";
}

/** Whether a proof file's MIME type should be rendered as an inline `<img>` vs. a download/open link. */
export function isImageFileType(fileType: string | null | undefined): boolean {
  return typeof fileType === "string" && fileType.startsWith("image/");
}

/** Why a proof file cannot be attached; the form writes the message for the admin's language. */
export type ProofFileProblem = "unsupported_type" | "too_large";

/**
 * Client-side validation for the optional proof file on the "record
 * payment" form, mirroring the server's `validateProofDescriptor` (which
 * remains the source of truth — this only lets staff catch an obviously
 * invalid file before submitting instead of waiting for a 400 response).
 * Returns the problem with the file, or `null` if the file is acceptable.
 */
export function validateManualProofFile(file: File): ProofFileProblem | null {
  if (!PROOF_MIME_TYPES.includes(file.type as (typeof PROOF_MIME_TYPES)[number])) {
    return "unsupported_type";
  }
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
    return "too_large";
  }
  return null;
}

/** Whether the current proof record has no attached file (a manually-recorded payment with no proof). */
export function proofHasNoFile(storagePath: string | null | undefined): boolean {
  return !storagePath;
}
