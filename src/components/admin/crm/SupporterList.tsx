import { TablePager } from "../TablePager";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { supporterRoles, type SupporterRole, type SupporterSummary } from "../../../lib/crm/types";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { fetchAdminJson } from "./api";
import { ExportBar } from "./ExportBar";
import { SupporterFormDialog } from "./SupporterFormDialog";

type SupporterListResponse = {
  supporters: SupporterSummary[];
  total: number;
};

function formatHkd(
  amountCents: number | null,
  language: ReturnType<typeof useAdminPageCopy>["language"],
) {
  if (amountCents === null) return "-";
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

type SupporterFilters = { roleFilter: SupporterRole | "all" };

const SUPPORTER_ROUTE: ListRouteState<SupporterFilters> = {
  key: "supporters",
  read(params) {
    const role = params.get("role");
    return {
      filters: {
        roleFilter: supporterRoles.includes(role as SupporterRole)
          ? (role as SupporterRole)
          : "all",
      },
      page: parseListPage(params.get("page")),
    };
  },
  write(params, filters, page) {
    if (filters.roleFilter === "all") params.delete("role");
    else params.set("role", filters.roleFilter);
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
  },
};

export function SupporterList() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.supporters;
  const listState = useListQueryState({
    key: "supporters",
    initialFilters: { roleFilter: "all" as SupporterRole | "all" },
    routeState: SUPPORTER_ROUTE,
  });
  const { page, setPage, query, filters, changeFilter } = listState;
  const roleFilter = filters.roleFilter;
  const search = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (query) search.set("q", query);
  if (roleFilter !== "all") search.set("role", roleFilter);
  const roleLabels = copy.roleLabels as Record<SupporterRole, string>;

  function renderRoles(roles: SupporterRole[]) {
    if (roles.length === 0)
      return <span className="text-xs text-[var(--color-text-muted)]">-</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {roles.map((role) => (
          <span
            key={role}
            className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-panel)]"
          >
            {roleLabels[role]}
          </span>
        ))}
      </div>
    );
  }

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["crm-supporters", search.toString()],
    queryFn: ({ signal }) =>
      fetchAdminJson<SupporterListResponse>("/api/admin/supporters?" + search, { signal }),
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
  });

  const visibleData = error ? undefined : data;

  const supporterColumns: DataTableColumn<SupporterSummary>[] = [
    {
      id: "supporter",
      header: copy.columns.supporter,
      cell: (s) => (
        <div>
          <Link
            to="/admin/supporters/$id"
            params={{ id: s.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {s.name}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
        </div>
      ),
    },
    {
      id: "consent",
      header: copy.columns.consent,
      cell: (s) => (
        <span className="text-xs">
          {copy.email} {s.emailConsent ?? "-"} / {copy.whatsapp} {s.whatsappConsent ?? "-"}
        </span>
      ),
    },
    {
      id: "roles",
      header: copy.columns.roles,
      cell: (s) => renderRoles(s.roles),
    },
    {
      id: "lifetime",
      header: copy.columns.lifetime,
      cell: (s) => formatHkd(s.lifetimeAmountCents, language),
    },
    {
      id: "lastGift",
      header: copy.columns.lastGift,
      cell: (s) => formatHkd(s.lastGiftAmountCents, language),
    },
    {
      id: "receipts",
      header: copy.columns.receipts,
      cell: (s) => (s.receiptNeeded ? copy.needsReview : copy.clear),
    },
    {
      id: "action",
      header: pageCopy.common.action,
      cell: (s) => (
        <Link
          to="/admin/supporters/$id"
          params={{ id: s.id }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
        >
          {pageCopy.common.open}
        </Link>
      ),
    },
  ];

  function renderSupporterCard(s: SupporterSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/supporters/$id"
              params={{ id: s.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {s.name}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
          </div>
          <div className="text-right text-sm font-medium text-[var(--color-panel)]">
            {formatHkd(s.lifetimeAmountCents, language)}
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.lastGift}: {formatHkd(s.lastGiftAmountCents, language)} · {copy.email}{" "}
          {s.emailConsent ?? "-"} / {copy.whatsapp} {s.whatsappConsent ?? "-"}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.receipts}: {s.receiptNeeded ? copy.needsReview : copy.clear}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {renderRoles(s.roles)}
          <Link
            to="/admin/supporters/$id"
            params={{ id: s.id }}
            className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
          >
            {pageCopy.common.open}
          </Link>
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
          <ExportBar search={search} busy={isFetching || listState.isDebouncing} />
          <SupporterFormDialog mode="create" />
        </div>
      </div>

      <div className="flex max-w-3xl flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            {...listState.queryInput}
            aria-label={copy.searchLabel}
            className="pl-9"
            placeholder={copy.searchPlaceholder}
          />
        </label>
        <Select
          value={roleFilter}
          onValueChange={(value) => {
            changeFilter({ roleFilter: value as SupporterRole | "all" });
          }}
        >
          <SelectTrigger className="sm:w-48" aria-label={copy.roleFilterLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allRoles}</SelectItem>
            {supporterRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabels[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(isFetching || listState.isDebouncing) && data && (
        <p role="status" className="text-xs text-[var(--color-text-muted)]">
          {language === "zh" ? "正在更新搜尋結果…" : "Refreshing results…"}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]"
        >
          {copy.loadError}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <DataTable<SupporterSummary>
          columns={supporterColumns}
          rows={visibleData?.supporters ?? []}
          getRowKey={(s) => s.id}
          loading={isLoading || !listState.hydrated}
          skeletonRows={5}
          empty={error ? null : copy.empty}
          renderMobileCard={renderSupporterCard}
        />
      </div>
      {visibleData && (
        <TablePager
          page={page}
          pageSize={25}
          total={visibleData.total}
          onPageChange={setPage}
          busy={isFetching || listState.isDebouncing}
          label="支持者"
        />
      )}
      {visibleData && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {pageCopy.common.totalSupporters(visibleData.total)}
        </p>
      )}
    </div>
  );
}
