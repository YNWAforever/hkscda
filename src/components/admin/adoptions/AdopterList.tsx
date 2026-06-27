import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdopterSummary } from "../../../lib/adoptions/types";
import { supabase } from "../../../lib/supabase";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { fetchCoordinatorJson } from "./api";
import { formatDate, formatFallback } from "./caseWorkflowLogic";
import {
  buildAdopterListSearchParams,
  buildCoordinatorExportUrl,
} from "./adopterWorkflowLogic";

type AdopterListResponse = {
  adopters: AdopterSummary[];
  total: number;
};

type BlacklistFilter = "all" | "yes" | "no";

const ADOPTER_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const BLACKLIST_FILTER_OPTIONS: Array<{ value: BlacklistFilter; label: string }> = [
  { value: "all", label: "All blacklist states" },
  { value: "yes", label: "Blacklisted" },
  { value: "no", label: "Not blacklisted" },
];

function BlacklistBadge({ isBlacklisted }: { isBlacklisted: boolean }) {
  if (isBlacklisted) {
    return (
      <Badge
        variant="outline"
        className="border-[var(--color-error)] bg-[var(--color-surface-2)] text-[var(--color-error)]"
      >
        Blacklisted
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      Clear
    </Badge>
  );
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

async function downloadCsv(path: string, filename: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");

  const response = await fetch(path, {
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error("Export failed");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AdopterList() {
  const [query, setQuery] = useState("");
  const [blacklisted, setBlacklisted] = useState<BlacklistFilter>("all");
  const [hasOpenCases, setHasOpenCases] = useState(false);
  const [hasOpenTasks, setHasOpenTasks] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof ADOPTER_PAGE_SIZE_OPTIONS)[number]>(25);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const searchParams = useMemo(
    () =>
      buildAdopterListSearchParams({
        q: query,
        blacklisted,
        hasOpenCases,
        hasOpenTasks,
        page,
        pageSize,
      }),
    [blacklisted, hasOpenCases, hasOpenTasks, page, pageSize, query],
  );

  const exportUrl = useMemo(
    () => buildCoordinatorExportUrl("adopters", searchParams),
    [searchParams],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<AdopterListResponse, Error>({
    queryKey: ["adopters", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<AdopterListResponse>(`/api/admin/adoptions/adopters?${searchParams}`),
  });

  const adopters = data?.adopters ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isPreviousDisabled = page <= 1 || isFetching;
  const isNextDisabled = page >= totalPages || isFetching;

  function resetToFirstPage() {
    setPage(1);
  }

  async function handleExport() {
    setExportError("");
    setIsExporting(true);
    try {
      await downloadCsv(exportUrl, "adopters.csv");
    } catch (nextError) {
      setExportError(nextError instanceof Error ? nextError.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Adopters</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Profiles, adoption history, blacklist status, and follow-up workload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px_160px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              aria-label="Search adopters"
              className="h-9 pl-9"
              placeholder="Search name, phone, or email"
            />
          </label>

          <Select
            value={blacklisted}
            onValueChange={(value) => {
              setBlacklisted(value as BlacklistFilter);
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label="Filter by blacklist status" className="h-9">
              <SelectValue placeholder="Blacklist status" />
            </SelectTrigger>
            <SelectContent>
              {BLACKLIST_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
            <Checkbox
              checked={hasOpenCases}
              onCheckedChange={(checked) => {
                setHasOpenCases(checked === true);
                resetToFirstPage();
              }}
              aria-label="Show adopters with open cases"
            />
            Open cases
          </label>

          <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
            <Checkbox
              checked={hasOpenTasks}
              onCheckedChange={(checked) => {
                setHasOpenTasks(checked === true);
                resetToFirstPage();
              }}
              aria-label="Show adopters with open tasks"
            />
            Open tasks
          </label>
        </div>
        {exportError && (
          <div
            className="border-t border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-error)]"
            role="alert"
          >
            {exportError}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">Adopter profiles</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading ? "Loading..." : `${total} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="adopter-page-size" className="text-xs text-[var(--color-text-muted)]">
              Rows
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value) as (typeof ADOPTER_PAGE_SIZE_OPTIONS)[number]);
                resetToFirstPage();
              }}
            >
              <SelectTrigger id="adopter-page-size" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADOPTER_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table aria-busy={isLoading || isFetching}>
          <TableHeader>
            <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
              <TableHead className="min-w-64 px-4 text-[var(--color-text-muted)]">
                Name and area
              </TableHead>
              <TableHead className="min-w-52 text-[var(--color-text-muted)]">Contact</TableHead>
              <TableHead className="min-w-56 text-[var(--color-text-muted)]">History</TableHead>
              <TableHead className="min-w-32 text-[var(--color-text-muted)]">
                Latest case
              </TableHead>
              <TableHead className="w-32 text-[var(--color-text-muted)]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} className="h-16">
                  <TableCell className="px-4">
                    <div className="h-3 w-40 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-36 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-44 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-20 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-8 w-24 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                </TableRow>
              ))}

            {error && !isLoading && (
              <TableRow className="h-16">
                <TableCell colSpan={5} className="px-4 text-[var(--color-error)]">
                  <span role="alert">{error.message}</span>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !error && adopters.length === 0 && (
              <TableRow className="h-16">
                <TableCell colSpan={5} className="px-4 text-[var(--color-text-muted)]">
                  No adopters found
                </TableCell>
              </TableRow>
            )}

            {adopters.map((adopter) => (
              <TableRow key={adopter.id} className="h-16">
                <TableCell className="px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/admin/coordinator/adopters/$id"
                      params={{ id: adopter.id }}
                      className="font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      {adopter.displayName}
                    </Link>
                    <BlacklistBadge isBlacklisted={adopter.isBlacklisted} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {formatFallback(adopter.livingArea)}
                    {adopter.supporterId ? ` · ${adopter.supporterId}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="break-words text-[var(--color-panel)]">
                    {formatFallback(adopter.phone)}
                  </div>
                  <div className="break-words text-xs text-[var(--color-text-muted)]">
                    {formatFallback(adopter.email)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                    >
                      {formatCount(adopter.openCaseCount)} open cases
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                    >
                      {formatCount(adopter.successfulAdoptionCount)} adoptions
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                    >
                      {formatCount(adopter.openTaskCount)} open tasks
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)]">
                  {formatDate(adopter.latestCaseAt)}
                </TableCell>
                <TableCell>
                  <Link
                    to="/admin/coordinator/adopters/$id"
                    params={{ id: adopter.id }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={isPreviousDisabled}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={isNextDisabled}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
