import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  CoordinatorExportAuditRow,
  CoordinatorExportKind,
  CoordinatorMonthlySummary,
} from "../../../lib/adoptions/types";
import { adminErrorMessage } from "../../../lib/admin/session";
import { supabase } from "../../../lib/supabase";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { formatAdminNumber, useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { LoadFailure, STAT_UNAVAILABLE } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { fetchCoordinatorJson } from "./api";
import { getCoordinatorExportFilename } from "./adopterWorkflowLogic";
import { adoptionFormatCopy } from "./formatCopy";
import {
  buildExportHistorySearchParams,
  buildMonthlySummarySearchParams,
  buildRegeneratedExportUrl,
  currentHongKongMonth,
  formatReportFiltersPreview,
} from "./coordinatorReportsLogic";

type SummaryResponse = {
  summary: CoordinatorMonthlySummary;
};

type ExportHistoryResponse = {
  exports: CoordinatorExportAuditRow[];
  total: number;
};

type KindFilter = CoordinatorExportKind | "all";

type SummaryMetricKey = Exclude<keyof CoordinatorMonthlySummary, "month">;

const EXPORT_KIND_OPTIONS: KindFilter[] = [
  "all",
  "cases",
  "adopters",
  "successful-adoptions",
  "animals",
  "tasks",
];

const SUMMARY_TILES: SummaryMetricKey[] = [
  "publicIntakeCases",
  "manualIntakeCases",
  "successfulAdoptions",
  "openCases",
  "overdueTasks",
  "exportsRun",
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function formatCount(
  value: number | null | undefined,
  language: ReturnType<typeof useAdminPageCopy>["language"],
) {
  return formatAdminNumber(value, language);
}

function actorLabel(row: CoordinatorExportAuditRow) {
  return row.actorLabel || row.actorUserId || "-";
}

function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--color-error)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-error)]"
    >
      {children}
    </div>
  );
}

function MetricTile({
  label,
  value,
  isLoading,
  failed,
  language,
}: {
  label: string;
  value: number;
  isLoading: boolean;
  /** True when the query behind `value` errored. `value` is then a coerced
   * `?? 0`, not a real figure -- shown as unavailable, never as zero. */
  failed: boolean;
  language: ReturnType<typeof useAdminPageCopy>["language"];
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
        {isLoading ? "-" : failed ? STAT_UNAVAILABLE : formatCount(value, language)}
      </div>
    </div>
  );
}

function SourceRouteCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-[var(--color-text-muted)]">-</span>;
  return (
    <code className="block max-w-72 truncate rounded bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-panel)]">
      {value}
    </code>
  );
}

export function CoordinatorReports() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.reports;
  const [month, setMonth] = useState(() => currentHongKongMonth());
  const [kind, setKind] = useState<KindFilter>("all");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const summaryParams = useMemo(
    () => buildMonthlySummarySearchParams({ month }).toString(),
    [month],
  );
  const historyParams = useMemo(
    () =>
      buildExportHistorySearchParams({
        month,
        kind,
        actor,
        page,
        pageSize,
      }).toString(),
    [actor, kind, month, page, pageSize],
  );

  const summaryQuery = useQuery<SummaryResponse, Error>({
    queryKey: ["coordinator-reports-summary", summaryParams],
    queryFn: () =>
      fetchCoordinatorJson<SummaryResponse>(
        `/api/admin/adoptions/reports/summary?${summaryParams}`,
      ),
  });

  const historyQuery = useQuery<ExportHistoryResponse, Error>({
    queryKey: ["coordinator-reports-exports", historyParams],
    queryFn: () =>
      fetchCoordinatorJson<ExportHistoryResponse>(
        `/api/admin/adoptions/reports/exports?${historyParams}`,
      ),
    placeholderData: keepPreviousData,
  });

  const exports = historyQuery.data?.exports ?? [];
  const total = historyQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isFetching = summaryQuery.isFetching || historyQuery.isFetching;

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function resetToFirstPage() {
    setPage(1);
  }

  function clearFilters() {
    setMonth(currentHongKongMonth());
    setKind("all");
    setActor("");
    setPage(1);
  }

  async function downloadAgain(row: CoordinatorExportAuditRow) {
    setDownloadError("");
    setDownloadingId(row.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(pageCopy.common.notSignedIn);

      const response = await fetch(buildRegeneratedExportUrl(row.id), {
        headers: { authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : pageCopy.common.downloadFailed,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getCoordinatorExportFilename(
        row.kind,
        response.headers.get("content-disposition"),
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (nextError) {
      setDownloadError(adminErrorMessage(nextError, language) ?? pageCopy.common.downloadFailed);
    } finally {
      setDownloadingId(null);
    }
  }

  const summary = summaryQuery.data?.summary;

  const exportColumns: DataTableColumn<CoordinatorExportAuditRow>[] = [
    {
      id: "timestamp",
      header: copy.columns.timestamp,
      className: "min-w-44 px-4 font-medium text-[var(--color-panel)]",
      cell: (row) => adoptionFormatCopy[language].reportTime(row.timestamp),
    },
    {
      id: "actor",
      header: copy.columns.actor,
      className: "min-w-48 text-sm text-[var(--color-panel)]",
      cell: (row) => <span className="block max-w-48 truncate">{actorLabel(row)}</span>,
    },
    {
      id: "kind",
      header: copy.columns.kind,
      className: "min-w-40",
      cell: (row) => (
        <Badge
          variant="outline"
          className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
        >
          {copy.kindOptions[row.kind]}
        </Badge>
      ),
    },
    {
      id: "rows",
      header: copy.columns.rows,
      className: "w-28 text-right font-semibold text-[var(--color-panel)]",
      cell: (row) => formatCount(row.rowCount, language),
    },
    {
      id: "filters",
      header: copy.columns.filters,
      className: "min-w-72 text-xs text-[var(--color-text-muted)]",
      cell: (row) => (
        <span className="block max-w-72 truncate">{formatReportFiltersPreview(row.filters)}</span>
      ),
    },
    {
      id: "sourceRoute",
      header: copy.columns.sourceRoute,
      className: "min-w-72",
      cell: (row) => <SourceRouteCell value={row.sourceRoute} />,
    },
    {
      id: "action",
      header: copy.columns.action,
      className: "w-40",
      cell: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void downloadAgain(row)}
          disabled={downloadingId === row.id}
        >
          <Download className="h-4 w-4" />
          {downloadingId === row.id ? pageCopy.common.downloading : pageCopy.common.downloadAgain}
        </Button>
      ),
    },
  ];

  function renderExportCard(row: CoordinatorExportAuditRow) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-panel)]">
              {adoptionFormatCopy[language].reportTime(row.timestamp)}
            </div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">{actorLabel(row)}</div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {copy.kindOptions[row.kind]}
          </Badge>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.columns.rows}:{" "}
          <span className="font-semibold text-[var(--color-panel)]">
            {formatCount(row.rowCount, language)}
          </span>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          <div className="mb-1">{copy.columns.filters}</div>
          <div className="text-[var(--color-panel)]">{formatReportFiltersPreview(row.filters)}</div>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          <div className="mb-1">{copy.columns.sourceRoute}</div>
          <SourceRouteCell value={row.sourceRoute} />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void downloadAgain(row)}
          disabled={downloadingId === row.id}
          className="min-h-[44px] w-full"
        >
          <Download className="h-4 w-4" />
          {downloadingId === row.id ? pageCopy.common.downloading : pageCopy.common.downloadAgain}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void summaryQuery.refetch();
            void historyQuery.refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          {pageCopy.common.refresh}
        </Button>
      </div>

      {(summaryQuery.error || downloadError) && (
        <div className="space-y-2">
          {summaryQuery.error && (
            <LoadFailure
              error={summaryQuery.error}
              onRetry={() => void summaryQuery.refetch()}
              title={`${copy.loadSummaryError}: ${adminErrorMessage(summaryQuery.error, language) ?? ""}`}
            />
          )}
          {downloadError && <InlineAlert>{downloadError}</InlineAlert>}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[160px_220px_minmax(260px,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="reports-month" className="text-xs text-[var(--color-text-muted)]">
              {copy.month}
            </Label>
            <Input
              id="reports-month"
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                resetToFirstPage();
              }}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reports-kind" className="text-xs text-[var(--color-text-muted)]">
              {copy.kind}
            </Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as KindFilter);
                resetToFirstPage();
              }}
            >
              <SelectTrigger id="reports-kind" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {copy.kindOptions[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reports-actor" className="text-xs text-[var(--color-text-muted)]">
              {copy.actor}
            </Label>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                id="reports-actor"
                value={actor}
                onChange={(event) => {
                  setActor(event.target.value);
                  resetToFirstPage();
                }}
                className="h-9 pl-9"
                placeholder={copy.actorPlaceholder}
              />
            </label>
          </div>

          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={clearFilters} disabled={isFetching}>
              {pageCopy.common.clear}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label={copy.summaryLabel}>
        {SUMMARY_TILES.map((tile) => (
          <MetricTile
            key={tile}
            label={copy.metrics[tile]}
            value={summary?.[tile] ?? 0}
            isLoading={summaryQuery.isLoading}
            failed={summaryQuery.isError}
            language={language}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">
              {copy.exportHistory}
            </h2>
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-xs text-[var(--color-text-muted)]"
            >
              {historyQuery.isLoading
                ? pageCopy.common.loading
                : pageCopy.common.totalRecords(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="reports-page-size" className="text-xs text-[var(--color-text-muted)]">
              {pageCopy.common.rows}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                resetToFirstPage();
              }}
            >
              <SelectTrigger id="reports-page-size" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DataTable<CoordinatorExportAuditRow>
          accessibleLabel={copy.exportHistory}
          columns={exportColumns}
          rows={exports}
          getRowKey={(row) => row.id}
          loading={historyQuery.isLoading}
          skeletonRows={5}
          empty={copy.empty}
          error={historyQuery.error}
          onRetry={() => void historyQuery.refetch()}
          failureTitle={`${copy.loadHistoryError}: ${adminErrorMessage(historyQuery.error, language) ?? ""}`}
          renderMobileCard={renderExportCard}
        />
      </section>

      <TablePager
        page={page}
        pageSize={pageSize}
        total={historyQuery.isError ? undefined : total}
        onPageChange={setPage}
        busy={isFetching}
        label={copy.exportHistory}
        failed={historyQuery.isError}
      />
    </div>
  );
}
