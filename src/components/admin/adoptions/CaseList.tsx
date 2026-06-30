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

const ANIMAL_TYPE_OPTIONS = [
  { value: "all", label: "All animals" },
  { value: "cat", label: "Cats" },
  { value: "dog", label: "Dogs" },
  { value: "sponsor", label: "Sponsor animals" },
  { value: "unknown", label: "Unknown" },
] as const;

export function CaseListStatusFilterError({ message }: { message: string }) {
  return (
    <div
      className="border-t border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      Could not load status filters: {message}
    </div>
  );
}

export function CaseList() {
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

  const caseColumns: DataTableColumn<AdoptionCaseSummary>[] = [
    {
      id: "applicant",
      header: "Applicant",
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
      header: "Requested animal",
      cell: (c) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {formatFallback(c.requestedAnimalName)}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(c.animalType)}
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (c) => (
        <span className="text-[var(--color-panel)]">{formatFallback(c.applicantPhone)}</span>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (c) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(c.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
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
          {formatFallback(c.requestedAnimalName)} · {formatFallback(c.animalType)}
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
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Adoption cases</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Coordinator queue, matching, follow-up, and finalization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="cases" searchParams={searchParams} />
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <ListChecks className="h-4 w-4" />
            Refresh
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
              aria-label="Search cases"
              className="h-9 pl-9"
              placeholder="Search applicant, phone, or email"
            />
          </label>

          <Select
            value={statusId}
            onValueChange={(value) => {
              setStatusId(value);
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label="Filter by case status" className="h-9">
              <SelectValue placeholder="Case status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {caseStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.labelZh} / {status.labelEn}
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
            <SelectTrigger aria-label="Filter by animal type" className="h-9">
              <SelectValue placeholder="Animal type" />
            </SelectTrigger>
            <SelectContent>
              {ANIMAL_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
              aria-label="Show open cases only"
            />
            Open only
          </label>
        </div>
        {statusesError && <CaseListStatusFilterError message={statusesError.message} />}
      </section>

      <section
        aria-busy={isLoading || isFetching}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">Cases</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading ? "Loading..." : `${total} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="case-page-size" className="text-xs text-[var(--color-text-muted)]">
              Rows
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
          empty="No cases found"
          renderMobileCard={renderCaseCard}
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
