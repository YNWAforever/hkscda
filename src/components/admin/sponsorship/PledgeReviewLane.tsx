import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { DataTable, type DataTableColumn } from "../DataTable";
import { StatusPill } from "../StatusBadge";
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

type PledgeListResponse = {
  pledges: PledgeSummary[];
  total: number;
};

const PLEDGE_STATUS_OPTIONS: Array<{ value: PledgeStatus | "all"; label: string }> = [
  { value: "all", label: "全部狀態" },
  { value: "pending_payment", label: "待付款" },
  { value: "provisional", label: "待審核" },
  { value: "active", label: "已確認" },
  { value: "needs_followup", label: "需要跟進" },
  { value: "cancelled", label: "已取消" },
];

const PLEDGE_STATUS_LABEL: Record<PledgeStatus, string> = {
  pending_payment: "待付款",
  provisional: "待審核",
  active: "已確認",
  needs_followup: "需要跟進",
  cancelled: "已取消",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function amountLabel(pledge: PledgeSummary) {
  const dollars = Math.round(pledge.amountCents / 100).toLocaleString("en-US");
  return `HK$${dollars}/月`;
}

export function PledgeReviewLane() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PledgeStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);

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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetToFirstPage() {
    setPage(1);
  }

  const columns: DataTableColumn<PledgeSummary>[] = [
    {
      id: "supporter",
      header: "支持者",
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
      header: "承諾金額",
      cell: (pledge) => <span className="text-[var(--color-panel)]">{amountLabel(pledge)}</span>,
    },
    {
      id: "created",
      header: "建立日期",
      cell: (pledge) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(pledge.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: "狀態",
      cell: (pledge) => (
        <StatusPill tone={pledgeStatusTone(pledge.status)}>
          {PLEDGE_STATUS_LABEL[pledge.status]}
        </StatusPill>
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
            {PLEDGE_STATUS_LABEL[pledge.status]}
          </StatusPill>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {amountLabel(pledge)} · {formatDate(pledge.createdAt)}
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
              aria-label="搜尋支持者姓名、電郵或編號"
              className="h-9 pl-9"
              placeholder="搜尋支持者姓名、電郵或編號"
            />
          </label>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as PledgeStatus | "all");
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label="狀態" className="h-9">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              {PLEDGE_STATUS_OPTIONS.map((option) => (
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
            <h2 className="text-base font-semibold text-[var(--color-panel)]">承諾審核</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading ? "載入中..." : `共 ${total} 項`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pledge-page-size" className="text-xs text-[var(--color-text-muted)]">
              每頁
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
              重新整理
            </Button>
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

        <DataTable<PledgeSummary>
          columns={columns}
          rows={pledges}
          getRowKey={(pledge) => pledge.id}
          loading={isLoading}
          skeletonRows={5}
          empty="沒有承諾"
          onRowClick={(pledge) => setSelectedPledgeId(pledge.id)}
          renderMobileCard={renderCard}
        />

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <span>{`第 ${page} 頁，共 ${totalPages} 頁`}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1 || isFetching}
            >
              <ChevronLeft className="h-4 w-4" />
              上一頁
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={page >= totalPages || isFetching}
            >
              下一頁
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {selectedPledgeId && (
        <PledgeDetailDrawer
          pledgeId={selectedPledgeId}
          onClose={() => setSelectedPledgeId(null)}
          onChanged={() => refetch()}
        />
      )}
    </div>
  );
}
