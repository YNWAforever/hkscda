import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdopterSummary } from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { DataTable, type DataTableColumn } from "../DataTable";
import { fetchCoordinatorJson } from "./api";
import { formatDate, formatFallback } from "./caseWorkflowLogic";
import { buildAdopterListSearchParams } from "./adopterWorkflowLogic";
import { ExportButton } from "./ExportButton";

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

function latestCaseStatusText(latestCase: AdopterSummary["latestCase"]) {
  if (!latestCase) return null;
  return latestCase.status.labelZh || latestCase.status.labelEn || latestCase.status.key;
}

function LatestCaseCell({ latestCase }: { latestCase: AdopterSummary["latestCase"] }) {
  if (!latestCase) {
    return <span className="text-[var(--color-text-muted)]">{formatFallback(null)}</span>;
  }

  return (
    <div className="space-y-1 text-sm">
      <Link
        to="/admin/applications/$id"
        params={{ id: latestCase.id }}
        className="font-medium text-[var(--color-primary)] hover:underline"
      >
        {formatDate(latestCase.createdAt)}
      </Link>
      <div className="text-xs text-[var(--color-text-muted)]">
        {latestCaseStatusText(latestCase)} · {latestCase.animalType}
        {latestCase.requestedAnimalName ? ` · ${latestCase.requestedAnimalName}` : ""}
      </div>
    </div>
  );
}

export function AdopterList() {
  const [query, setQuery] = useState("");
  const [blacklisted, setBlacklisted] = useState<BlacklistFilter>("all");
  const [hasOpenCases, setHasOpenCases] = useState(false);
  const [hasOpenTasks, setHasOpenTasks] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof ADOPTER_PAGE_SIZE_OPTIONS)[number]>(25);

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

  const adopterColumns: DataTableColumn<AdopterSummary>[] = [
    {
      id: "nameArea",
      header: "Name and area",
      className: "min-w-64 px-4",
      cell: (a) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/coordinator/adopters/$id"
              params={{ id: a.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {a.displayName}
            </Link>
            <BlacklistBadge isBlacklisted={a.isBlacklisted} />
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatFallback(a.livingArea)}
            {a.supporterId ? ` · ${a.supporterId}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      className: "min-w-52",
      cell: (a) => (
        <div>
          <div className="break-words text-[var(--color-panel)]">{formatFallback(a.phone)}</div>
          <div className="break-words text-xs text-[var(--color-text-muted)]">
            {formatFallback(a.email)}
          </div>
        </div>
      ),
    },
    {
      id: "history",
      header: "History",
      className: "min-w-56",
      cell: (a) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openCaseCount)} open cases
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.successfulAdoptionCount)} adoptions
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openTaskCount)} open tasks
          </Badge>
        </div>
      ),
    },
    {
      id: "latestCase",
      header: "Latest case",
      className: "min-w-32",
      cell: (a) => <LatestCaseCell latestCase={a.latestCase} />,
    },
    {
      id: "action",
      header: "Action",
      className: "w-32",
      cell: (a) => (
        <Link
          to="/admin/coordinator/adopters/$id"
          params={{ id: a.id }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
        >
          Open
        </Link>
      ),
    },
  ];

  function renderAdopterCard(a: AdopterSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/coordinator/adopters/$id"
              params={{ id: a.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {a.displayName}
            </Link>
            <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {formatFallback(a.livingArea)}
            </div>
          </div>
          <BlacklistBadge isBlacklisted={a.isBlacklisted} />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(a.phone)} · {formatFallback(a.email)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openCaseCount)} open
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.successfulAdoptionCount)} adopted
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openTaskCount)} tasks
          </Badge>
        </div>
        <LatestCaseCell latestCase={a.latestCase} />
      </div>
    );
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
          <ExportButton kind="adopters" searchParams={searchParams} label="Export CSV" />
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
      </section>

      <section
        aria-busy={isLoading || isFetching}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
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

        {error && !isLoading && (
          <div
            role="alert"
            className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
          >
            {error.message}
          </div>
        )}

        <DataTable<AdopterSummary>
          columns={adopterColumns}
          rows={adopters}
          getRowKey={(a) => a.id}
          loading={isLoading}
          skeletonRows={5}
          empty="No adopters found"
          renderMobileCard={renderAdopterCard}
        />

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
