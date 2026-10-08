import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ListChecks, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import {
  addCaseSelection,
  collectMatchingCaseIds,
} from "../../../lib/adoptions/assignmentBulkSelection";
import type { AdoptionCaseSummary, CoordinatorStatus } from "../../../lib/adoptions/types";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { bilingualStatusName, useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { useAdminCopy } from "../i18n/copy";
import { STAT_UNAVAILABLE } from "../LoadFailure";
import { StatusBadge } from "../StatusBadge";
import { TablePager } from "../TablePager";
import { fetchCoordinatorJson } from "./api";
import {
  buildCaseListSearchParams,
  filterStatusesByCategory,
  formatFallback,
} from "./caseWorkflowLogic";
import { caseSelectionCopy } from "./copy";
import { ExportButton } from "./ExportButton";
import { adoptionFormatCopy } from "./formatCopy";
import { AdoptionAssignmentBulkPanel } from "./AdoptionAssignmentBulkPanel";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";

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

type CaseFilters = {
  statusId: string;
  animalType: string;
  openOnly: boolean;
  pageSize: (typeof CASE_PAGE_SIZE_OPTIONS)[number];
};
const CASE_ROUTE: ListRouteState<CaseFilters> = {
  key: "adoption-cases",
  read(params) {
    const status = params.get("status");
    const animal = params.get("animal");
    const size = Number(params.get("pageSize"));
    return {
      filters: {
        statusId: status && /^[0-9a-f-]{36}$/i.test(status) ? status : "all",
        animalType: ANIMAL_TYPE_OPTIONS.includes(animal as (typeof ANIMAL_TYPE_OPTIONS)[number])
          ? animal!
          : "all",
        openOnly: params.get("open") !== "false",
        pageSize: CASE_PAGE_SIZE_OPTIONS.includes(size as CaseFilters["pageSize"])
          ? (size as CaseFilters["pageSize"])
          : 25,
      },
      page: parseListPage(params.get("page")),
    };
  },
  write(params, filters, page) {
    if (filters.statusId === "all") params.delete("status");
    else params.set("status", filters.statusId);
    if (filters.animalType === "all") params.delete("animal");
    else params.set("animal", filters.animalType);
    if (filters.openOnly) params.delete("open");
    else params.set("open", "false");
    if (filters.pageSize === 25) params.delete("pageSize");
    else params.set("pageSize", String(filters.pageSize));
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
  },
};

export function CaseList() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.caseList;
  const selection = useAdminCopy(caseSelectionCopy);
  const format = useAdminCopy(adoptionFormatCopy);
  const listState = useListQueryState({
    key: "adoption-cases",
    initialFilters: {
      statusId: "all",
      animalType: "all",
      openOnly: true,
      pageSize: 25 as CaseFilters["pageSize"],
    },
    routeState: CASE_ROUTE,
  });
  const { query, page, setPage, filters, changeFilter } = listState;
  const { statusId, animalType, openOnly, pageSize } = filters;
  const identity = useQuery(adminIdentityQueryOptions());
  const isAdmin = identity.data?.admin.role === "admin";
  const [minAgeDays, setMinAgeDays] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedScope, setSelectedScope] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const filterKey = JSON.stringify([query, statusId, animalType, openOnly, minAgeDays]);
  const effectiveSelectedIds = selectedScope === filterKey ? selectedIds : [];
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  useEffect(() => {
    setSelectedIds([]);
    setSelectedScope(filterKey);
    setSelectionError("");
  }, [filterKey]);

  const { data: statusesData, error: statusesError } = useQuery<StatusesResponse, Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const caseStatuses = useMemo(
    () => filterStatusesByCategory(statusesData?.statuses ?? [], "adoption_case"),
    [statusesData?.statuses],
  );
  const selectedStage = caseStatuses.find((item) => item.id === statusId);
  const statusEligible = Boolean(
    selectedStage?.isActive && !selectedStage.isClosing && !selectedStage.isFinal,
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
    queryFn: ({ signal }) =>
      fetchCoordinatorJson<CaseListResponse>("/api/admin/adoptions/cases?" + searchParams, {
        signal,
      }),
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
  });

  const cases = data?.cases ?? [];
  const total = data?.total ?? 0;
  const selectionDisabled =
    selectionBusy || isFetching || listState.isDebouncing || !data || Boolean(error);
  function toggleSelected(id: string) {
    setSelectedScope(filterKey);
    setSelectionError("");
    try {
      setSelectedIds(
        effectiveSelectedIds.includes(id)
          ? effectiveSelectedIds.filter((item) => item !== id)
          : addCaseSelection(effectiveSelectedIds, [id], language),
      );
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : selection.cannotSelect);
    }
  }
  function selectVisible() {
    if (selectionDisabled || !statusEligible) return;
    setSelectedScope(filterKey);
    setSelectionError("");
    try {
      setSelectedIds(
        addCaseSelection(
          effectiveSelectedIds,
          cases.map((item) => item.id),
          language,
        ),
      );
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : selection.cannotSelect);
    }
  }
  async function selectAllMatching() {
    if (selectionDisabled || !statusEligible) return;
    const scope = filterKey;
    setSelectionBusy(true);
    setSelectionError("");
    try {
      const ids = await collectMatchingCaseIds(
        total,
        async (nextPage, limit) => {
          const params = buildCaseListSearchParams({
            q: query,
            statusId,
            animalType,
            openOnly,
            page: nextPage,
            pageSize: limit,
          });
          return fetchCoordinatorJson<CaseListResponse>("/api/admin/adoptions/cases?" + params);
        },
        undefined,
        language,
      );
      if (filterKeyRef.current !== scope) throw new Error(selection.filtersChanged);
      setSelectedScope(scope);
      setSelectedIds(ids);
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : selection.cannotLockSelection);
    } finally {
      setSelectionBusy(false);
    }
  }

  function animalTypeLabel(value: string | null | undefined) {
    const key =
      value && value in pageCopy.animalTypes
        ? (value as keyof typeof pageCopy.animalTypes)
        : "unknown";
    return pageCopy.animalTypes[key];
  }

  const selectionColumn: DataTableColumn<AdoptionCaseSummary> = {
    id: "bulk-select",
    header: selection.select,
    cell: (item) => (
      <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
        <input
          type="checkbox"
          aria-label={selection.selectCase(item.applicantName)}
          checked={effectiveSelectedIds.includes(item.id)}
          disabled={selectionDisabled || !statusEligible}
          onChange={() => toggleSelected(item.id)}
        />
      </label>
    ),
  };
  const caseColumns: DataTableColumn<AdoptionCaseSummary>[] = [
    ...(isAdmin ? [selectionColumn] : []),
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
        <span className="text-[var(--color-text-muted)]">{format.date(c.createdAt)}</span>
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
        {isAdmin && (
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={effectiveSelectedIds.includes(c.id)}
              disabled={selectionDisabled || !statusEligible}
              onChange={() => toggleSelected(c.id)}
            />
            {selection.selectThisCase}
          </label>
        )}
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
          {formatFallback(c.applicantPhone)} · {format.date(c.createdAt)}
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
          <ExportButton
            kind="cases"
            searchParams={searchParams}
            label={pageCopy.common.export}
            busy={isFetching || listState.isDebouncing}
          />
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
              {...listState.queryInput}
              aria-label={copy.searchLabel}
              className="h-9 pl-9"
              placeholder={copy.searchPlaceholder}
            />
          </label>

          <Select
            value={statusId}
            onValueChange={(value) => {
              changeFilter({ statusId: value });
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
              changeFilter({ animalType: value });
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
                changeFilter({ openOnly: checked === true });
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

      {isAdmin && (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={selectVisible}
              disabled={selectionDisabled || !statusEligible || cases.length === 0}
            >
              {selection.selectPage}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={selectAllMatching}
              disabled={selectionDisabled || !statusEligible || total < 1 || total > 1000}
            >
              {selection.selectAllMatching}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedIds([])}
              disabled={selectionBusy || effectiveSelectedIds.length === 0}
            >
              {selection.clearSelection}
            </Button>
          </div>
          {selectionBusy && <p role="status">{selection.lockingSelection}</p>}
          {selectionError && (
            <p role="alert" className="text-[var(--color-error)]">
              {selectionError}
            </p>
          )}
          <AdoptionAssignmentBulkPanel
            selectedIds={effectiveSelectedIds}
            filterKey={filterKey}
            selectionDisabled={selectionDisabled || !statusEligible}
            statusId={statusId}
            statusEligible={statusEligible}
            minAgeDays={minAgeDays}
            onMinAgeDaysChange={setMinAgeDays}
          />
        </section>
      )}
      <section
        aria-busy={isLoading || isFetching || listState.isDebouncing}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">{copy.tableTitle}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading
                ? pageCopy.common.loading
                : error
                  ? STAT_UNAVAILABLE
                  : pageCopy.common.totalCount(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="case-page-size" className="text-xs text-[var(--color-text-muted)]">
              {pageCopy.common.rows}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                changeFilter({ pageSize: Number(value) as CaseFilters["pageSize"] });
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

        {(isFetching || listState.isDebouncing) && data ? (
          <p role="status" className="px-4 text-xs text-[var(--color-text-muted)]">
            {pageCopy.common.loading}
          </p>
        ) : null}
        <DataTable<AdoptionCaseSummary>
          columns={caseColumns}
          rows={cases}
          getRowKey={(c) => c.id}
          loading={isLoading || !listState.hydrated}
          skeletonRows={5}
          empty={copy.empty}
          error={error}
          onRetry={() => void refetch()}
          renderMobileCard={renderCaseCard}
        />

        <div className="px-4 py-2">
          <TablePager
            page={page}
            pageSize={pageSize}
            total={error ? undefined : total}
            onPageChange={setPage}
            busy={isFetching || listState.isDebouncing}
            label={copy.tableTitle}
            failed={Boolean(error)}
          />
        </div>
      </section>
    </div>
  );
}
