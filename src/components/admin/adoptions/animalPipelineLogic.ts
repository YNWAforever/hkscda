import type { AnimalStatus, AnimalType } from "../../../types/animal";
import type { AdminLanguage } from "../../../lib/admin/language";
import { adminErrorMessage } from "../../../lib/admin/session";
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

const PIPELINE_LOOKUP_LABELS = {
  positions: "Positions",
  arrivalSources: "Arrival sources",
} as const;

type PipelineLookup = keyof typeof PIPELINE_LOOKUP_LABELS;

/**
 * The text of a failed lookup: the lookup's name, then its cause in `language`. A session error
 * is written in that language, and any other reason is shown as it came.
 */
export function pipelineLookupErrorText(
  lookup: PipelineLookup,
  cause: unknown,
  language: AdminLanguage = "zh",
): string {
  const reason = adminErrorMessage(cause, language) ?? String(cause);
  return `${PIPELINE_LOOKUP_LABELS[lookup]} could not load: ${reason}`;
}

/**
 * A pipeline lookup that failed. Its message is the text in Chinese, as it always was; it keeps
 * the lookup and the cause so the screen can write the text again in its own language.
 */
export class PipelineLookupError extends Error {
  constructor(
    readonly lookup: PipelineLookup,
    cause: unknown,
  ) {
    super(pipelineLookupErrorText(lookup, cause), { cause });
    this.name = "PipelineLookupError";
  }
}

/**
 * Reads one pipeline reference lookup and, on failure, rethrows with the lookup's
 * name in front of the cause. Positions and arrival sources go through the same
 * API client, so a shared failure (expired session, 500) would otherwise read
 * identically for both and the error banner could not say which one failed.
 */
export async function readPipelineLookup<T>(
  lookup: PipelineLookup,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw new PipelineLookupError(lookup, error);
  }
}

/**
 * The text to show for a failed read on the pipeline screen, in `language`, or `null` when
 * nothing failed. A failed lookup keeps its name in front of the cause.
 */
export function pipelineReadErrorText(error: unknown, language: AdminLanguage): string | null {
  if (error instanceof PipelineLookupError) {
    return pipelineLookupErrorText(error.lookup, error.cause, language);
  }
  return adminErrorMessage(error, language);
}

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

export function buildAnimalPipelineSearchParams(filters: AnimalPipelineSearchParamsInput = {}) {
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

export function buildAnimalPipelineExportSearchParams(
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

  if (query) params.set("q", query);
  if (animalId) params.set("animalId", animalId);
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  if (adoptable !== "all") params.set("adoptable", adoptable);
  if (supportPool !== "all") params.set("supportPool", supportPool);
  if (positionId !== "all") params.set("positionId", positionId);
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

export function resolveAnimalPipelinePagination(input: {
  page: number;
  pageSize: number;
  responsePage?: number;
  responsePageSize?: number;
  total: number;
}) {
  const pageSize = input.responsePageSize ?? input.pageSize;
  const totalPages = Math.max(1, Math.ceil(input.total / pageSize));
  const page = Math.min(input.responsePage ?? input.page, totalPages);
  return { page, pageSize, totalPages };
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

/**
 * Whether the internal-profile form differs from the record it was seeded from.
 *
 * Used to decide whether closing the dialog needs a confirmation. The dialog
 * holds sixteen fields and closes on any outside click, so discarding silently
 * loses real work.
 */
export function hasUnsavedProfileChanges(
  form: AnimalInternalProfile,
  saved: AnimalInternalProfile,
) {
  return (Object.keys(saved) as Array<keyof AnimalInternalProfile>).some(
    (key) => normalizeProfileValue(form[key]) !== normalizeProfileValue(saved[key]),
  );
}

/**
 * Null and empty string are the same absence for a text field: the server sends
 * null, the input renders `value={... ?? ""}`, and focusing then leaving the
 * field writes "" back. Without this, tabbing through an untouched form would
 * report unsaved changes — and a discard prompt that cries wolf gets dismissed
 * on sight, which is worse than not having one.
 *
 * Booleans are left alone. `has_chip: false` means "checked, no chip" while
 * null means "not yet checked", so collapsing them would hide a real edit.
 */
function normalizeProfileValue(value: string | boolean | null) {
  return value === null ? "" : value;
}
