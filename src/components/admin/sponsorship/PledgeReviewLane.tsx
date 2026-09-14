import { useQuery } from "@tanstack/react-query";
import { ListChecks, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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
import { centsToHkd } from "../../../lib/donations/domain";

type PledgeListResponse = {
  pledges: PledgeSummary[];
  total: number;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

// A monthly commitment, so /月 is right here. `centsToHkd` rather than
// rounding: HK$123.45 was being shown as HK$123.
function amountLabel(pledge: PledgeSummary) {
  return `${centsToHkd(pledge.amountCents)}/月`;
}

export function PledgeReviewLane() {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PledgeStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);

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
        page,
        pageSize,
      }),
    [page, pageSize, query, status],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<PledgeListResponse, Error>({
    queryKey: ["sponsorship-pledges", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<PledgeListResponse>(`/api/admin/sponsorships/pledges?${searchParams}`),
  });

  const pledges = data?.pledges ?? [];
  const total = data?.total ?? 0;

  function resetToFirstPage() {
    setPage(1);
  }

  const columns: DataTableColumn<PledgeSummary>[] = [
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
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px]">
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
            value={status}
            onValueChange={(value) => {
              setStatus(value as PledgeStatus | "all");
              resetToFirstPage();
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
        </div>
      </section>

      <section
        aria-busy={isLoading || isFetching}
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
                setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                resetToFirstPage();
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

        <DataTable<PledgeSummary>
          columns={columns}
          rows={pledges}
          getRowKey={(pledge) => pledge.id}
          loading={isLoading}
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
            busy={isFetching}
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
