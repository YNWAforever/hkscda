import type { StatusTone } from "../StatusBadge";
import { MAX_PROOF_BYTES, PROOF_MIME_TYPES } from "../../../lib/sponsorship/schemas";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

export type PledgeListFilters = {
  q?: string;
  status?: string;
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

  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("page", String(normalizedPositiveInteger(filters.page, 1)));
  params.set("pageSize", String(normalizedPositiveInteger(filters.pageSize, 25)));
  return params;
}

export function formatFallback(value: string | null | undefined) {
  return trimmed(value) || "-";
}

export function formatDate(value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (!nextValue) return "-";
  return nextValue.slice(0, 10);
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

/** Statuses for which the "record payment" form should be shown in the detail drawer. */
export function canRecordPayment(status: PledgeStatus): boolean {
  return status === "pending_payment" || status === "needs_followup";
}

/** Statuses for which the "review payment proof" form should be shown in the detail drawer. */
export function canReviewProof(status: PledgeStatus): boolean {
  return status === "provisional";
}

/** Statuses for which the "cancel sponsorship" action should be shown in the detail drawer. */
export function canCancelPledge(status: PledgeStatus): boolean {
  return status !== "cancelled";
}

/** Whether a proof file's MIME type should be rendered as an inline `<img>` vs. a download/open link. */
export function isImageFileType(fileType: string | null | undefined): boolean {
  return typeof fileType === "string" && fileType.startsWith("image/");
}

/**
 * Client-side validation for the optional proof file on the "record
 * payment" form, mirroring the server's `validateProofDescriptor` (which
 * remains the source of truth — this only lets staff catch an obviously
 * invalid file before submitting instead of waiting for a 400 response).
 * Returns a user-facing error message, or `null` if the file is acceptable.
 */
export function validateManualProofFile(file: File): string | null {
  if (!PROOF_MIME_TYPES.includes(file.type as (typeof PROOF_MIME_TYPES)[number])) {
    return "檔案格式不支援，請上載 JPG、PNG、WEBP 或 PDF 檔案";
  }
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
    return "檔案大小超過上限（8MB）";
  }
  return null;
}

/** Whether the current proof record has no attached file (a manually-recorded payment with no proof). */
export function proofHasNoFile(storagePath: string | null | undefined): boolean {
  return !storagePath;
}
