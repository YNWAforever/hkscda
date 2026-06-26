import type { Animal, AnimalStatus, AnimalType } from "../../../types/animal";

export type AnimalInternalProfile = {
  animal_id: string;
  internal_code: string | null;
  arrival_date: string | null;
  arrival_source_id: string | null;
  current_position_id: string | null;
  cage: string | null;
  has_chip: boolean | null;
  chip_remarks: string | null;
  is_desexed: boolean | null;
  desexed_at: string | null;
  desex_remarks: string | null;
  is_adoptable: boolean;
  is_inside_support_pool: boolean;
  adopted_at: string | null;
  deceased_at: string | null;
  internal_remarks: string | null;
};

export type AnimalPositionSummary = {
  id: string;
  name: string;
  type: string;
};

export type ArrivalSourceSummary = {
  id: string;
  name_zh: string;
  name_en: string | null;
};

export type AnimalPipelineRow = Pick<
  Animal,
  | "id"
  | "type"
  | "name"
  | "name_en"
  | "gender"
  | "age"
  | "status"
  | "image_url"
  | "created_at"
  | "updated_at"
> & {
  profile: AnimalInternalProfile;
  currentPosition: AnimalPositionSummary | null;
  arrivalSource: ArrivalSourceSummary | null;
};

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

export function buildAnimalPipelineSearchParams(filters: { animalId?: string | null }) {
  const params = new URLSearchParams();
  const animalId = trimmed(filters.animalId);
  if (animalId) params.set("animalId", animalId);
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
