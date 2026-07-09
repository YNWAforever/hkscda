import type { AnimalStatus } from "../../../types/animal";
import type {
  AnimalInternalProfile,
  AnimalPipelineFilters,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";

export type {
  AnimalInternalProfile,
  AnimalPipelineFilters,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";

export type AnimalPipelineGroup = {
  key: string;
  label: string;
  rows: AnimalPipelineRow[];
};

const STATUS_ORDER: AnimalStatus[] = ["available", "fostered", "adopted"];

const STATUS_LABELS: Record<AnimalStatus, string> = {
  available: "Available",
  fostered: "Fostered",
  adopted: "Adopted",
};

function trimmed(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : "";
}

function positiveInteger(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function appendAnimalPipelineFilterParams(
  params: URLSearchParams,
  filters: Partial<AnimalPipelineFilters> & {
    q?: string | null;
    animalId?: string | null;
  },
) {
  const q = trimmed(filters.q);
  const animalId = trimmed(filters.animalId);
  if (q) params.set("q", q);
  if (animalId) params.set("animalId", animalId);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.adoptable && filters.adoptable !== "all") params.set("adoptable", filters.adoptable);
  if (filters.supportPool && filters.supportPool !== "all") {
    params.set("supportPool", filters.supportPool);
  }
  if (filters.positionId && filters.positionId !== "all") {
    params.set("positionId", filters.positionId);
  }
}

export function buildAnimalPipelineSearchParams(
  filters: Partial<AnimalPipelineFilters> & {
    q?: string | null;
    animalId?: string | null;
    page?: number | null;
    pageSize?: number | null;
  },
) {
  const params = new URLSearchParams();
  appendAnimalPipelineFilterParams(params, filters);
  params.set("page", String(positiveInteger(filters.page, 1)));
  params.set("pageSize", String(positiveInteger(filters.pageSize, 25)));
  return params;
}

export function buildAnimalPipelineExportSearchParams(
  filters: Partial<AnimalPipelineFilters> & {
    q?: string | null;
    animalId?: string | null;
  },
) {
  const params = new URLSearchParams();
  appendAnimalPipelineFilterParams(params, filters);
  return params;
}

export function buildAnimalTaskSearchParams(filters: { animalId?: string | null }) {
  const params = new URLSearchParams();
  const animalId = trimmed(filters.animalId);
  if (animalId) params.set("animalId", animalId);
  params.set("openOnly", "true");
  params.set("page", "1");
  params.set("pageSize", "10");
  return params;
}

export function filterAnimalPipelineRows(
  rows: AnimalPipelineRow[],
  filters: AnimalPipelineFilters,
) {
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.type !== "all" && row.type !== filters.type) return false;
    if (filters.adoptable === "adoptable" && !row.profile.is_adoptable) return false;
    if (filters.adoptable === "not_adoptable" && row.profile.is_adoptable) return false;
    if (filters.supportPool === "inside" && !row.profile.is_inside_support_pool) return false;
    if (filters.supportPool === "outside" && row.profile.is_inside_support_pool) return false;
    if (filters.positionId === "none" && row.profile.current_position_id) return false;
    if (
      filters.positionId !== "all" &&
      filters.positionId !== "none" &&
      row.profile.current_position_id !== filters.positionId
    ) {
      return false;
    }
    return true;
  });
}

export function groupAnimalPipelineRows(
  rows: AnimalPipelineRow[],
  groupBy: "status" | "position",
): AnimalPipelineGroup[] {
  if (groupBy === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      rows: rows.filter((row) => row.status === status),
    })).filter((group) => group.rows.length > 0);
  }

  const groups = new Map<string, AnimalPipelineGroup>();

  for (const row of rows) {
    const key = row.profile.current_position_id ?? "unassigned";
    const label = row.currentPosition?.name ?? "No position";
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.key === "unassigned") return 1;
    if (right.key === "unassigned") return -1;
    return left.label.localeCompare(right.label);
  });
}
