import type { AnimalStatus, AnimalType } from "../../../types/animal";
import type {
  AnimalInternalProfile,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";

export type {
  AnimalInternalProfile,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";

export type AnimalPipelineFilters = {
  status: AnimalStatus | "all";
  type: AnimalType | "all";
  adoptable: "all" | "adoptable" | "not_adoptable";
  supportPool: "all" | "inside" | "outside";
  positionId: string;
};

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

type AnimalPipelineSearchParamsInput = Partial<AnimalPipelineFilters> & {
  q?: string | null;
  animalId?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

export function buildAnimalPipelineSearchParams(
  filters: AnimalPipelineSearchParamsInput = {},
) {
  const params = new URLSearchParams();
  const query = trimmed(filters.q);
  const animalId = trimmed(filters.animalId);
  const status = filters.status ?? "all";
  const type = filters.type ?? "all";
  const adoptable = filters.adoptable ?? "all";
  const supportPool = filters.supportPool ?? "all";
  const positionId = trimmed(filters.positionId) || "all";
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 25;

  if (query) params.set("q", query);
  if (animalId) params.set("animalId", animalId);
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  if (adoptable !== "all") params.set("adoptable", adoptable);
  if (supportPool !== "all") params.set("supportPool", supportPool);
  if (positionId !== "all") params.set("positionId", positionId);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
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
