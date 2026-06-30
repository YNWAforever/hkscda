import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdoptionCaseSummary, CoordinatorStatus } from "../../../lib/adoptions/types";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { bilingualStatusName, useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { StatusBadge } from "../StatusBadge";
import { fetchCoordinatorJson } from "./api";
import {
  buildCaseListSearchParams,
  filterStatusesByCategory,
  formatDate,
  formatFallback,
} from "./caseWorkflowLogic";
import { ExportButton } from "./ExportButton";

type CaseListResponse = {
  cases: AdoptionCaseSummary[];
  total: number;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

const STATUSES_QUERY_KEY = ["coordinator-statuses"] as const;
const CASE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const ANIMAL_TYPE_OPTIONS = ["all", "cat", "dog", "sponsor", "unknown"] as const;

export function CaseListStatusFilterError({ label, message }: { label: string; message: string }) {
  return (
    <div
      className="border-t border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      {label}: {message}
    </div>
  );
}

export function CaseList() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.caseList;
  const [query, setQuery] = useState("");
  const [statusId, setStatusId] = useState("all");
  const [animalType, setAnimalType] = useState("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof CASE_PAGE_SIZE_OPTIONS)[number]>(25);

  const { data: statusesData, error: statusesError } = useQuery<StatusesResponse, Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const caseStatuses = useMemo(
    () => filterStatusesByCategory(statusesData?.statuses ?? [], "adoption_case"),
    [statusesData?.statuses],
  );

  const searchParams = useMemo(
    () =>
      buildCaseListSearchParams({
        q: query,
        statusId: statusId === "all" ? "" : statusId,
        animalType: animalType === "all" ? "" : animalType,
        openOnly,
        page,
        pageSize,
      }),
    [animalType, openOnly, page, pageSize, query, statusId],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<CaseListResponse, Error>({
    queryKey: ["adoption-cases", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<CaseListResponse>(`/api/admin/adoptions/cases?${searchParams}`),
  });

  const cases = data?.cases ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isPreviousDisabled = page <= 1 || isFetching;
  const isNextDisabled = page >= totalPages || isFetching;

  function resetToFirstPage() {
    setPage(1);
  }

  function animalTypeLabel(value: string | null | undefined) {
    const key =
      value && value in pageCopy.animalTypes
        ? (value as keyof typeof pageCopy.animalTypes)
        : "unknown";
    return pageCopy.animalTypes[key];
  }

  const caseColumns: DataTableColumn<AdoptionCaseSummary>[] = [
    {
      id: "applicant",
      header: copy.columns.applicant,
      className: "px-4",
      cell: (c) => (
        <div>
          <Link
            to="/admin/applications/$id"
            params={{ id: c.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {c.applicantName}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(c.applicantEmail)}
          </div>
        </div>
      ),
    },
    {
      id: "animal",
      header: copy.columns.animal,
      cell: (c) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {formatFallback(c.requestedAnimalName)}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {animalTypeLabel(c.animalType)}
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: copy.columns.phone,
      cell: (c) => (
        <span className="text-[var(--color-panel)]">{formatFallback(c.applicantPhone)}</span>
      ),
    },
    {
      id: "created",
      header: copy.columns.created,
      cell: (c) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(c.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: copy.columns.status,
      cell: (c) => <StatusBadge status={c.status} />,
    },
  ];

  function renderCaseCard(c: AdoptionCaseSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/applications/$id"
              params={{ id: c.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {c.applicantName}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(c.applicantEmail)}
            </div>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(c.requestedAnimalName)} · {animalTypeLabel(c.animalType)}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(c.applicantPhone)} · {formatDate(c.createdAt)}
        </div>
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
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="cases" searchParams={searchParams} label={pageCopy.common.export} />
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <ListChecks className="h-4 w-4" />
            {pageCopy.common.refresh}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px_180px_150px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              aria-label={copy.searchLabel}
              className="h-9 pl-9"
              placeholder={copy.searchPlaceholder}
            />
          </label>

          <Select
            value={statusId}
            onValueChange={(value) => {
              setStatusId(value);
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label={copy.statusLabel} className="h-9">
              <SelectValue placeholder={copy.statusPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allStatuses}</SelectItem>
              {caseStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {bilingualStatusName(status, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={animalType}
            onValueChange={(value) => {
              setAnimalType(value);
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label={copy.animalTypeLabel} className="h-9">
              <SelectValue placeholder={copy.animalTypePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {ANIMAL_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {pageCopy.animalTypes[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
            <Checkbox
              checked={openOnly}
              onCheckedChange={(checked) => {
                setOpenOnly(checked === true);
                resetToFirstPage();
              }}
              aria-label={copy.openOnlyLabel}
            />
            {copy.openOnly}
          </label>
        </div>
        {statusesError && (
          <CaseListStatusFilterError label={copy.filterError} message={statusesError.message} />
        )}
      </section>

      <section
        aria-busy={isLoading || isFetching}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">{copy.tableTitle}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading ? pageCopy.common.loading : pageCopy.common.totalCount(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="case-page-size" className="text-xs text-[var(--color-text-muted)]">
              {pageCopy.common.rows}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value) as (typeof CASE_PAGE_SIZE_OPTIONS)[number]);
                resetToFirstPage();
              }}
            >
              <SelectTrigger id="case-page-size" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_PAGE_SIZE_OPTIONS.map((option) => (
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

        <DataTable<AdoptionCaseSummary>
          columns={caseColumns}
          rows={cases}
          getRowKey={(c) => c.id}
          loading={isLoading}
          skeletonRows={5}
          empty={copy.empty}
          renderMobileCard={renderCaseCard}
        />

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <span>{pageCopy.common.pageOf(page, totalPages)}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={isPreviousDisabled}
            >
              <ChevronLeft className="h-4 w-4" />
              {pageCopy.common.previous}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={isNextDisabled}
            >
              {pageCopy.common.next}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
