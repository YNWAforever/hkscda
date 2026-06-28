import type { CoordinatorExportKind } from "../../../lib/adoptions/types";

export type ExportHistoryFilters = {
  month: string;
  kind?: CoordinatorExportKind | "all" | "";
  actor?: string;
  page?: number;
  pageSize?: number;
};

export type MonthlySummaryFilters = {
  month: string;
};

export function currentHongKongMonth(now = new Date()) {
  const hongKong = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${hongKong.getUTCFullYear()}-${String(hongKong.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildRegeneratedExportUrl(auditLogId: string) {
  return `/api/admin/adoptions/reports/exports/${auditLogId}/download`;
}

function trimOrUndefined(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedPage(value: number | undefined) {
  return String(Math.max(1, value || 1));
}

function addTrimmed(params: URLSearchParams, key: string, value: string | undefined) {
  const trimmed = trimOrUndefined(value);
  if (trimmed) params.set(key, trimmed);
}

export function buildExportHistorySearchParams(filters: ExportHistoryFilters) {
  const params = new URLSearchParams();
  params.set("month", filters.month.trim());
  if (filters.kind && filters.kind !== "all") params.set("kind", filters.kind);
  addTrimmed(params, "actor", filters.actor);
  params.set("page", normalizedPage(filters.page));
  params.set("pageSize", String(Math.max(1, filters.pageSize || 25)));
  return params;
}

export function buildMonthlySummarySearchParams(filters: MonthlySummaryFilters) {
  const params = new URLSearchParams();
  params.set("month", filters.month.trim());
  return params;
}

export function formatReportFiltersPreview(filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });

  if (entries.length === 0) return "-";

  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "object" && value !== null) return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${String(value)}`;
    })
    .join(" · ");
}
