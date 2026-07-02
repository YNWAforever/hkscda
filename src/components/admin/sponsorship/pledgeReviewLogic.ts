import type { StatusTone } from "../StatusBadge";
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
