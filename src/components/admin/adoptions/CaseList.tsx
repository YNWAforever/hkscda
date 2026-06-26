import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdoptionCaseSummary, CoordinatorStatus } from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { fetchCoordinatorJson } from "./api";
import {
  buildCaseListSearchParams,
  filterStatusesByCategory,
  formatDate,
  formatFallback,
} from "./caseWorkflowLogic";

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

const STATUS_DOT_CLASSES: Record<string, string> = {
  amber: "bg-[var(--color-warning)]",
  blue: "bg-[var(--color-panel)]",
  coral: "bg-[var(--color-primary)]",
  cyan: "bg-[var(--color-lavender-deep)]",
  green: "bg-[var(--color-success)]",
  indigo: "bg-[var(--color-panel-2)]",
  purple: "bg-[var(--color-secondary)]",
  red: "bg-[var(--color-error)]",
  slate: "bg-[var(--color-text-muted)]",
};

function StatusChip({ status }: { status: CoordinatorStatus }) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      <span
        className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status.color] ?? "bg-[var(--color-border)]"}`}
        aria-hidden="true"
      />
      <span>{status.labelZh}</span>
      <span className="font-normal text-[var(--color-text-muted)]">{status.labelEn}</span>
    </Badge>
  );
}

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

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Adoption cases</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Coordinator queue, matching, follow-up, and finalization.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <ListChecks className="h-4 w-4" />
          Refresh
        </Button>
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

      <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
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

        <Table aria-busy={isLoading || isFetching}>
          <TableHeader>
            <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
              <TableHead className="px-4 text-[var(--color-text-muted)]">Applicant</TableHead>
              <TableHead className="text-[var(--color-text-muted)]">Requested animal</TableHead>
              <TableHead className="text-[var(--color-text-muted)]">Phone</TableHead>
              <TableHead className="text-[var(--color-text-muted)]">Created</TableHead>
              <TableHead className="text-[var(--color-text-muted)]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} className="h-16">
                  <TableCell className="px-4">
                    <div className="h-3 w-36 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-32 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-24 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3 w-20 rounded bg-[var(--color-lavender)]" />
                  </TableCell>
                  <TableCell>
                    <div className="h-7 w-28 rounded bg-[var(--color-lavender)]" />
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

            {!isLoading && !error && cases.length === 0 && (
              <TableRow className="h-16">
                <TableCell colSpan={5} className="px-4 text-[var(--color-text-muted)]">
                  No cases found
                </TableCell>
              </TableRow>
            )}

            {cases.map((adoptionCase) => (
              <TableRow key={adoptionCase.id} className="h-16">
                <TableCell className="px-4">
                  <Link
                    to="/admin/applications/$id"
                    params={{ id: adoptionCase.id }}
                    className="font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {adoptionCase.applicantName}
                  </Link>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {formatFallback(adoptionCase.applicantEmail)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-[var(--color-panel)]">
                    {formatFallback(adoptionCase.requestedAnimalName)}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {formatFallback(adoptionCase.animalType)}
                  </div>
                </TableCell>
                <TableCell className="text-[var(--color-panel)]">
                  {formatFallback(adoptionCase.applicantPhone)}
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)]">
                  {formatDate(adoptionCase.createdAt)}
                </TableCell>
                <TableCell>
                  <StatusChip status={adoptionCase.status} />
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
