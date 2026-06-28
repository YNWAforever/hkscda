import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  CoordinatorExportAuditRow,
  CoordinatorExportKind,
  CoordinatorMonthlySummary,
} from "../../../lib/adoptions/types";
import { supabase } from "../../../lib/supabase";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { fetchCoordinatorJson } from "./api";
import { getCoordinatorExportFilename } from "./adopterWorkflowLogic";
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

const EXPORT_KIND_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All exports" },
  { value: "cases", label: "Cases" },
  { value: "adopters", label: "Adopters" },
  { value: "successful-adoptions", label: "Successful adoptions" },
  { value: "animals", label: "Animals" },
  { value: "tasks", label: "Tasks" },
];

const KIND_LABELS: Record<CoordinatorExportKind, string> = {
  cases: "Cases",
  adopters: "Adopters",
  "successful-adoptions": "Successful adoptions",
  animals: "Animals",
  tasks: "Tasks",
};

const SUMMARY_TILES: Array<{ key: SummaryMetricKey; label: string }> = [
  { key: "publicIntakeCases", label: "Public intake" },
  { key: "manualIntakeCases", label: "Manual intake" },
  { key: "successfulAdoptions", label: "Successful" },
  { key: "openCases", label: "Open cases" },
  { key: "overdueTasks", label: "Overdue tasks" },
  { key: "exportsRun", label: "Exports run" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
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
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
        {isLoading ? "-" : formatCount(value)}
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
      if (!session?.access_token) throw new Error("未登入");

      const response = await fetch(buildRegeneratedExportUrl(row.id), {
        headers: { authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Download failed");
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
      setDownloadError(nextError instanceof Error ? nextError.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  const summary = summaryQuery.data?.summary;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Coordinator reports</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Monthly intake summary and regenerated CSV export history.
          </p>
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
          Refresh
        </Button>
      </div>

      {(summaryQuery.error || historyQuery.error || downloadError) && (
        <div className="space-y-2">
          {summaryQuery.error && (
            <InlineAlert>Could not load monthly summary: {summaryQuery.error.message}</InlineAlert>
          )}
          {historyQuery.error && (
            <InlineAlert>Could not load export history: {historyQuery.error.message}</InlineAlert>
          )}
          {downloadError && <InlineAlert>{downloadError}</InlineAlert>}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[160px_220px_minmax(260px,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="reports-month" className="text-xs text-[var(--color-text-muted)]">
              Month
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
              Kind
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
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reports-actor" className="text-xs text-[var(--color-text-muted)]">
              Actor
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
                placeholder="Filter by actor user ID"
              />
            </label>
          </div>

          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={clearFilters} disabled={isFetching}>
              Clear
            </Button>
          </div>
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
        aria-label="Monthly coordinator summary"
      >
        {SUMMARY_TILES.map((tile) => (
          <MetricTile
            key={tile.key}
            label={tile.label}
            value={summary?.[tile.key] ?? 0}
            isLoading={summaryQuery.isLoading}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">Export history</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {historyQuery.isLoading ? "Loading..." : `${formatCount(total)} records`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="reports-page-size" className="text-xs text-[var(--color-text-muted)]">
              Rows
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

        <Table aria-busy={historyQuery.isLoading || historyQuery.isFetching}>
          <TableHeader>
            <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
              <TableHead className="min-w-44 px-4 text-[var(--color-text-muted)]">
                Timestamp
              </TableHead>
              <TableHead className="min-w-48 text-[var(--color-text-muted)]">Actor</TableHead>
              <TableHead className="min-w-40 text-[var(--color-text-muted)]">Kind</TableHead>
              <TableHead className="w-28 text-right text-[var(--color-text-muted)]">Rows</TableHead>
              <TableHead className="min-w-72 text-[var(--color-text-muted)]">Filters</TableHead>
              <TableHead className="min-w-72 text-[var(--color-text-muted)]">
                Source route
              </TableHead>
              <TableHead className="w-40 text-[var(--color-text-muted)]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyQuery.isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} className="h-16">
                  <TableCell className="px-4">
                    <div className="h-3 w-32 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-40 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-24 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="ml-auto h-3 w-12 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-56 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-64 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-8 w-32 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                </TableRow>
              ))}

            {!historyQuery.isLoading && !historyQuery.error && exports.length === 0 && (
              <TableRow className="h-16">
                <TableCell colSpan={7} className="px-4 text-[var(--color-text-muted)]">
                  No exports match these filters.
                </TableCell>
              </TableRow>
            )}

            {exports.map((row) => (
              <TableRow key={row.id} className="h-16">
                <TableCell className="px-4 font-medium text-[var(--color-panel)]">
                  {formatTimestamp(row.timestamp)}
                </TableCell>
                <TableCell className="text-sm text-[var(--color-panel)]">
                  <span className="block max-w-48 truncate">{actorLabel(row)}</span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                  >
                    {KIND_LABELS[row.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-semibold text-[var(--color-panel)]">
                  {formatCount(row.rowCount)}
                </TableCell>
                <TableCell className="text-xs text-[var(--color-text-muted)]">
                  <span className="block max-w-72 truncate">
                    {formatReportFiltersPreview(row.filters)}
                  </span>
                </TableCell>
                <TableCell>
                  <SourceRouteCell value={row.sourceRoute} />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadAgain(row)}
                    disabled={downloadingId === row.id}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingId === row.id ? "Downloading..." : "Download again"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
