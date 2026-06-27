import type { CoordinatorExportKind } from "../../../lib/adoptions/types";

export type AdopterListFilters = {
  q: string;
  blacklisted: "all" | "yes" | "no";
  hasOpenCases: boolean;
  hasOpenTasks: boolean;
  page: number;
  pageSize: number;
};

function addTrimmed(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) params.set(key, trimmed);
}

export function buildAdopterListSearchParams(filters: AdopterListFilters) {
  const params = new URLSearchParams();
  addTrimmed(params, "q", filters.q);
  if (filters.blacklisted !== "all") params.set("blacklisted", filters.blacklisted);
  if (filters.hasOpenCases) params.set("hasOpenCases", "true");
  if (filters.hasOpenTasks) params.set("hasOpenTasks", "true");
  params.set("page", String(Math.max(1, filters.page || 1)));
  params.set("pageSize", String(Math.max(1, filters.pageSize || 25)));
  return params;
}

export function buildCoordinatorExportUrl(kind: CoordinatorExportKind, params: URLSearchParams) {
  const suffix = params.toString();
  return `/api/admin/adoptions/exports/${kind}.csv${suffix ? `?${suffix}` : ""}`;
}
