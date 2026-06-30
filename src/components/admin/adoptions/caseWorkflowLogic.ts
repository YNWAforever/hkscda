import type {
  AnimalMatchSummary,
  CoordinatorStatus,
  CoordinatorStatusCategory,
} from "../../../lib/adoptions/types";

export type CaseListFilters = {
  q?: string;
  statusId?: string;
  animalType?: string;
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type FinalizationFormState = {
  matchId: string;
  outcomeStatusId: string;
  caseNumber: string;
  adoptionFeeHkd: string;
  approvalDate: string;
  pickupDate: string;
};

export type FinalizationPayload = {
  matchId: string;
  outcomeStatusId: string;
  caseNumber: string;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};

function trimmed(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : "";
}

function normalizedPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

export function buildCaseListSearchParams(filters: CaseListFilters) {
  const params = new URLSearchParams();
  const q = trimmed(filters.q);
  const statusId = trimmed(filters.statusId);
  const animalType = trimmed(filters.animalType);

  if (q) params.set("q", q);
  if (statusId) params.set("statusId", statusId);
  if (animalType) params.set("animalType", animalType);
  if (filters.openOnly) params.set("openOnly", "true");
  params.set("page", String(normalizedPositiveInteger(filters.page, 1)));
  params.set("pageSize", String(normalizedPositiveInteger(filters.pageSize, 25)));
  return params;
}

export function filterStatusesByCategory(
  statuses: CoordinatorStatus[],
  category: CoordinatorStatusCategory,
  options: { activeOnly?: boolean } = {},
) {
  const activeOnly = options.activeOnly ?? true;
  return statuses
    .filter((status) => status.category === category)
    .filter((status) => !activeOnly || status.isActive)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.labelZh.localeCompare(right.labelZh),
    );
}

export function formatFallback(value: string | null | undefined) {
  return trimmed(value) || "-";
}

export function formatDate(value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (!nextValue) return "-";
  return nextValue.slice(0, 10);
}

export function formatHkdCents(amountCents: number | null | undefined) {
  if (amountCents === null || amountCents === undefined) return "-";
  const sign = amountCents < 0 ? "-" : "";
  const absoluteCents = Math.abs(amountCents);
  const dollars = Math.floor(absoluteCents / 100).toLocaleString("en-US");
  const cents = String(absoluteCents % 100).padStart(2, "0");
  return cents === "00" ? `${sign}HK$${dollars}` : `${sign}HK$${dollars}.${cents}`;
}

function parseHkdDollarsToCents(value: string) {
  const nextValue = value.trim();
  if (!nextValue) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(nextValue)) return undefined;

  const [dollars, cents = ""] = nextValue.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function buildFinalizationPayload(form: FinalizationFormState): FinalizationPayload | null {
  const matchId = trimmed(form.matchId);
  const outcomeStatusId = trimmed(form.outcomeStatusId);
  const caseNumber = trimmed(form.caseNumber);
  const approvalDate = trimmed(form.approvalDate);
  const pickupDate = trimmed(form.pickupDate);
  const adoptionFeeCents = parseHkdDollarsToCents(form.adoptionFeeHkd);

  if (!matchId || !outcomeStatusId || !caseNumber || !approvalDate) return null;
  if (adoptionFeeCents === undefined) return null;

  return {
    matchId,
    outcomeStatusId,
    caseNumber,
    adoptionFeeCents,
    approvalDate,
    pickupDate: pickupDate || null,
  };
}

export function findApprovedMatches(matches: AnimalMatchSummary[]) {
  return matches.filter(
    (match) =>
      match.isApproved &&
      match.status.key === "approved" &&
      match.status.isActive &&
      match.status.isFinal,
  );
}

export function findDefaultAdoptedOutcomeStatus(statuses: CoordinatorStatus[]) {
  return (
    statuses.find(
      (status) =>
        status.category === "final_outcome" &&
        status.key === "adopted" &&
        status.isActive &&
        status.isFinal,
    ) ?? null
  );
}
