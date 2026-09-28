import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListChecks, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { STAT_UNAVAILABLE } from "../LoadFailure";
import { StatusPill } from "../StatusBadge";
import { TablePager } from "../TablePager";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { PledgeStatus, PledgeSummary } from "../../../lib/sponsorshipAdmin/types";
import {
  buildPledgeListSearchParams,
  formatDate,
  formatFallback,
  pledgeStatusTone,
} from "./pledgeReviewLogic";
import { PledgeDetailDrawer } from "./PledgeDetailDrawer";
import { SponsorshipFollowupBulkPanel } from "./SponsorshipFollowupBulkPanel";
import {
  addPledgeSelection,
  collectMatchingPledgeIds,
} from "../../../lib/sponsorshipAdmin/followupBulkSelection";
import { centsToHkd } from "../../../lib/donations/domain";
import { useListQueryState } from "../../../lib/admin/useListQueryState";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import {
  PAGE_SIZE_OPTIONS,
  PLEDGE_ROUTE,
  PLEDGE_STATUSES,
  type PledgeFilters,
} from "./pledgeListRoute";

type PledgeListResponse = {
  pledges: PledgeSummary[];
  total: number;
};

// A monthly commitment, so /月 is right here. `centsToHkd` rather than
// rounding: HK$123.45 was being shown as HK$123.
function amountLabel(pledge: PledgeSummary) {
  return `${centsToHkd(pledge.amountCents)}/月`;
}

export function PledgeReviewLane() {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview;
  const listState = useListQueryState({
    key: "sponsorship-pledges",
    initialFilters: {
      status: "all" as PledgeStatus | "all",
      proof: "all" as PledgeFilters["proof"],
      pageSize: 25 as PledgeFilters["pageSize"],
    },
    routeState: PLEDGE_ROUTE,
  });
  const { query, page, setPage, filters, changeFilter } = listState;
  const { status, proof, pageSize } = filters;
  const identity = useQuery(adminIdentityQueryOptions());
  const canAssign = identity.data?.admin.role === "staff" || identity.data?.admin.role === "admin";
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedScope, setSelectedScope] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const filterKey = JSON.stringify([query, status, proof]);
  const effectiveSelectedIds = selectedScope === filterKey ? selectedIds : [];
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  useEffect(() => {
    setSelectedIds([]);
    setSelectedScope(filterKey);
    setSelectionError("");
  }, [filterKey]);

  const pledgeStatusOptions: Array<{ value: PledgeStatus | "all"; label: string }> = [
    { value: "all", label: copy.allStatuses },
    { value: "pending_payment", label: copy.statuses.pending_payment },
    { value: "provisional", label: copy.statuses.provisional },
    { value: "active", label: copy.statuses.active },
    { value: "needs_followup", label: copy.statuses.needs_followup },
    { value: "cancelled", label: copy.statuses.cancelled },
  ];
  const pledgeStatusLabel: Record<PledgeStatus, string> = copy.statuses;

  const searchParams = useMemo(
    () =>
      buildPledgeListSearchParams({
        q: query,
        status: status === "all" ? "" : status,
        proof: proof === "all" ? "" : proof,
        page,
        pageSize,
      }),
    [page, pageSize, proof, query, status],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<PledgeListResponse, Error>({
    queryKey: ["sponsorship-pledges", searchParams.toString()],
    queryFn: ({ signal }) =>
      fetchCoordinatorJson<PledgeListResponse>("/api/admin/sponsorships/pledges?" + searchParams, {
        signal,
      }),
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
  });

  const pledges = data?.pledges ?? [];
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
          : addPledgeSelection(effectiveSelectedIds, [id]),
      );
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : "無法選取");
    }
  }
  function selectVisible() {
    if (selectionDisabled) return;
    setSelectedScope(filterKey);
    setSelectionError("");
    try {
      setSelectedIds(
        addPledgeSelection(
          effectiveSelectedIds,
          pledges.filter((item) => item.status === "needs_followup").map((item) => item.id),
        ),
      );
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : "無法選取");
    }
  }
  async function selectAllMatching() {
    if (selectionDisabled || status !== "needs_followup") return;
    const scope = filterKey;
    setSelectionBusy(true);
    setSelectionError("");
    try {
      const ids = await collectMatchingPledgeIds(total, async (nextPage, limit) => {
        const params = buildPledgeListSearchParams({
          q: query,
          status: "needs_followup",
          proof: proof === "all" ? "" : proof,
          page: nextPage,
          pageSize: limit,
        });
        return fetchCoordinatorJson<PledgeListResponse>(
          "/api/admin/sponsorships/pledges?" + params,
        );
      });
      if (filterKeyRef.current !== scope) throw new Error("篩選條件已變更；請重新選取");
      setSelectedScope(scope);
      setSelectedIds(ids);
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : "無法固定選取範圍");
    } finally {
      setSelectionBusy(false);
    }
  }

  const columns: DataTableColumn<PledgeSummary>[] = [
    ...(canAssign
      ? [
          {
            id: "followup-bulk-select",
            header: "選取",
            cell: (pledge) => (
              <label
                className="inline-flex min-h-11 min-w-11 items-center justify-center"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  aria-label={"選取跟進 " + pledge.supporterName}
                  checked={effectiveSelectedIds.includes(pledge.id)}
                  disabled={selectionDisabled || pledge.status !== "needs_followup"}
                  onChange={() => toggleSelected(pledge.id)}
                />
              </label>
            ),
          } satisfies DataTableColumn<PledgeSummary>,
        ]
      : []),
    {
      id: "supporter",
      header: copy.columns.supporter,
      className: "px-4",
      cell: (pledge) => (
        <div>
          <div className="font-semibold text-[var(--color-panel)]">{pledge.supporterName}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(pledge.supporterEmail)}
          </div>
        </div>
      ),
    },
    {
      id: "amount",
      header: copy.columns.amount,
      cell: (pledge) => <span className="text-[var(--color-panel)]">{amountLabel(pledge)}</span>,
    },
    {
      id: "created",
      header: copy.columns.created,
      cell: (pledge) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(pledge.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: copy.columns.status,
      cell: (pledge) => (
        <StatusPill tone={pledgeStatusTone(pledge.status)}>
          {pledgeStatusLabel[pledge.status]}
        </StatusPill>
      ),
    },
    {
      id: "review",
      header: "審核",
      cell: (pledge) => (
        <button
          type="button"
          className="min-h-11 underline text-[var(--color-primary)]"
          onClick={(event) => {
            event.stopPropagation();
            reviewTrigger.current = event.currentTarget;
            setSelectedPledgeId(pledge.id);
          }}
        >
          審核 {pledge.supporterName}
        </button>
      ),
    },
  ];

  function renderCard(pledge: PledgeSummary) {
    return (
      <div className="space-y-2">
        {canAssign && pledge.status === "needs_followup" && (
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={effectiveSelectedIds.includes(pledge.id)}
              disabled={selectionDisabled}
              onChange={() => toggleSelected(pledge.id)}
            />
            選取跟進
          </label>
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-[var(--color-panel)]">{pledge.supporterName}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(pledge.supporterEmail)}
            </div>
          </div>
          <StatusPill tone={pledgeStatusTone(pledge.status)}>
            {pledgeStatusLabel[pledge.status]}
          </StatusPill>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {amountLabel(pledge)} · {formatDate(pledge.createdAt)}
          <button
            type="button"
            className="block min-h-11 underline"
            onClick={(event) => {
              event.stopPropagation();
              reviewTrigger.current = event.currentTarget;
              setSelectedPledgeId(pledge.id);
            }}
          >
            審核 {pledge.supporterName}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
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
            value={status}
            onValueChange={(value) => {
              changeFilter({ status: value as PledgeStatus | "all" });
            }}
          >
            <SelectTrigger aria-label={copy.statusFilterLabel} className="h-9">
              <SelectValue placeholder={copy.statusFilterPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {pledgeStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={proof}
            onValueChange={(value) => changeFilter({ proof: value as PledgeFilters["proof"] })}
          >
            <SelectTrigger aria-label="憑證審核篩選" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有憑證狀態</SelectItem>
              <SelectItem value="pending">待核實憑證</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {canAssign && (
        <section
          className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
          aria-label="助養跟進選取"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={selectVisible}
              disabled={
                selectionDisabled || !pledges.some((item) => item.status === "needs_followup")
              }
            >
              選取本頁待跟進
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={selectAllMatching}
              disabled={
                selectionDisabled || status !== "needs_followup" || total < 1 || total > 1000
              }
            >
              選取全部符合條件（最多 1000 筆）
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedIds([])}
              disabled={selectionBusy || effectiveSelectedIds.length === 0}
            >
              清除選取
            </Button>
          </div>
          {status !== "needs_followup" && (
            <p role="status" className="text-sm">
              選取全部前，請先篩選「待跟進」。
            </p>
          )}
          {selectionBusy && <p role="status">正在固定選取範圍…</p>}
          {selectionError && (
            <p role="alert" className="text-[var(--color-error)]">
              {selectionError}
            </p>
          )}
          <SponsorshipFollowupBulkPanel
            selectedIds={effectiveSelectedIds}
            filterKey={filterKey}
            selectionDisabled={selectionDisabled}
            onApplied={() => void refetch()}
          />
        </section>
      )}

      <section
        aria-busy={isLoading || isFetching || listState.isDebouncing}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">{copy.title}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading
                ? pageCopy.common.loading
                : error
                  ? STAT_UNAVAILABLE
                  : copy.totalCount(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pledge-page-size" className="text-xs text-[var(--color-text-muted)]">
              {copy.perPage}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                changeFilter({ pageSize: Number(value) as PledgeFilters["pageSize"] });
              }}
            >
              <SelectTrigger id="pledge-page-size" className="h-8 w-20">
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
            <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <ListChecks className="h-4 w-4" />
              {pageCopy.common.refresh}
            </Button>
          </div>
        </div>

        {(isFetching || listState.isDebouncing) && data ? (
          <p role="status" className="px-4 text-xs text-[var(--color-text-muted)]">
            {pageCopy.common.loading}
          </p>
        ) : null}
        <DataTable<PledgeSummary>
          columns={columns}
          rows={pledges}
          getRowKey={(pledge) => pledge.id}
          loading={isLoading || !listState.hydrated}
          skeletonRows={5}
          empty={copy.empty}
          error={error}
          onRetry={() => void refetch()}
          onRowClick={(pledge) => setSelectedPledgeId(pledge.id)}
          renderMobileCard={renderCard}
        />

        <div className="px-4 py-2">
          <TablePager
            page={page}
            pageSize={pageSize}
            total={error ? undefined : total}
            onPageChange={setPage}
            busy={isFetching || listState.isDebouncing}
            label={copy.title}
            failed={Boolean(error)}
          />
        </div>
      </section>

      {selectedPledgeId && (
        <PledgeDetailDrawer
          pledgeId={selectedPledgeId}
          onClose={() => {
            setSelectedPledgeId(null);
            requestAnimationFrame(() => reviewTrigger.current?.focus());
          }}
          onChanged={() => refetch()}
        />
      )}
    </div>
  );
}
