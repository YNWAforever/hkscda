import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileCheck, FileX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AdminRole } from "../../../lib/admin/access";
import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
import {
  PAYMENT_RECONCILE_PAGE_SIZE,
  type AdminPaymentListResult,
} from "../../../lib/donations/adminPayments";
import { centsToHkd } from "../../../lib/donations/domain";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { DataTable, type DataTableColumn } from "../DataTable";
import { StatusPill } from "../StatusBadge";
import { ReconcileDialog } from "./ReconcileDialog";
import {
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  canIssueReceipt,
  canReconcile,
  canVoidReceipt,
  financeActionLabel,
  findIssuedReceipt,
  paymentPurposeText,
  paymentStatusPill,
  receiptPill,
  type AdminPaymentRow,
  type PaymentFilters,
} from "./paymentsReconcileLogic";

type FinanceActivityItem = {
  id: string;
  action: string;
  actorEmail: string | null;
  entityId: string;
  detail: unknown;
  createdAt: string;
};

type AdminIdentityResponse = {
  admin: {
    role: AdminRole;
  };
};

const STATUS_OPTIONS: { value: PaymentFilters["status"]; label: string }[] = [
  { value: "all", label: "全部狀態" },
  { value: "pending", label: "待確認" },
  { value: "succeeded", label: "已確認" },
  { value: "failed", label: "失敗" },
  { value: "refunded", label: "已退款" },
];

const PROVIDER_OPTIONS: { value: PaymentFilters["provider"]; label: string }[] = [
  { value: "all", label: "全部方式" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "fps", label: "FPS" },
  { value: "payme", label: "PayMe" },
  { value: "manual", label: "Manual" },
];

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function PaymentsReconcile() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<PaymentFilters>({
    status: "all",
    provider: "all",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [filters.search]);

  const paymentSearch = useMemo(
    () =>
      buildPaymentSearchParams({
        ...filters,
        search: debouncedSearch,
        page,
        pageSize: PAYMENT_RECONCILE_PAGE_SIZE,
      }).toString(),
    [debouncedSearch, filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-payments", paymentSearch],
    queryFn: () => fetchAdminJson<AdminPaymentListResult>(`/api/admin/payments?${paymentSearch}`),
    placeholderData: keepPreviousData,
  });

  const { data: identityData } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => fetchAdminJson<AdminIdentityResponse>("/api/admin/me"),
  });

  const { data: activityData } = useQuery({
    queryKey: ["admin-finance-activity"],
    queryFn: () =>
      fetchAdminJson<{ activity: FinanceActivityItem[] }>("/api/admin/finance/activity"),
  });

  const payments = data?.payments ?? [];
  const receipts = data?.receipts ?? [];
  const adminRole = identityData?.admin.role ?? null;
  const summary = data?.summary ?? {
    awaitingReconcile: 0,
    awaitingReceipt: 0,
    confirmedAmountCents: 0,
  };
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_RECONCILE_PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * PAYMENT_RECONCILE_PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAYMENT_RECONCILE_PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    queryClient.invalidateQueries({ queryKey: ["admin-finance-activity"] });
  }

  function updateFilters(patch: Partial<PaymentFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const issueReceipt = useMutation({
    mutationFn: (donationId: string) =>
      fetchAdminJson("/api/admin/receipts", {
        method: "POST",
        body: JSON.stringify({ donationId }),
      }),
    onSuccess: refresh,
  });

  const voidReceipt = useMutation({
    mutationFn: (receiptId: string) =>
      fetchAdminJson(`/api/admin/receipts/${receiptId}/void`, { method: "POST" }),
    onSuccess: refresh,
  });

  async function handleExport() {
    setExportError("");
    try {
      const token = await getAdminAccessToken();
      const exportSearch = filters.search.trim();
      setDebouncedSearch(exportSearch);
      const exportParams = buildPaymentExportSearchParams({
        ...filters,
        search: exportSearch,
      }).toString();
      const exportUrl = exportParams
        ? `/api/admin/exports/payments.csv?${exportParams}`
        : "/api/admin/exports/payments.csv";
      const response = await fetch(exportUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "匯出失敗");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payments.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "匯出失敗");
    }
  }

  const actionError = issueReceipt.error?.message ?? voidReceipt.error?.message ?? "";

  function rowActions(payment: AdminPaymentRow) {
    const issued = findIssuedReceipt(payment.donation.id, receipts);
    return (
      <div className="flex flex-wrap gap-2">
        {canReconcile(payment, adminRole) && (
          <ReconcileDialog
            paymentId={payment.id}
            supporterName={payment.donation.supporter.name}
            amountLabel={centsToHkd(payment.amount_cents)}
            onReconciled={refresh}
          />
        )}
        {canIssueReceipt(payment, receipts, adminRole) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => issueReceipt.mutate(payment.donation.id)}
            disabled={issueReceipt.isPending}
          >
            <FileCheck className="h-4 w-4" />
            發收條
          </Button>
        )}
        {canVoidReceipt(payment, receipts, adminRole) && issued && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(`確定作廢收條 ${issued.receipt_no}？`))
                voidReceipt.mutate(issued.id);
            }}
            disabled={voidReceipt.isPending}
          >
            <FileX className="h-4 w-4" />
            作廢收條
          </Button>
        )}
      </div>
    );
  }

  const columns: DataTableColumn<AdminPaymentRow>[] = [
    {
      id: "supporter",
      header: "捐款人",
      cell: (payment) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {payment.donation.supporter.name}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {payment.donation.supporter.email}
          </div>
        </div>
      ),
    },
    { id: "provider", header: "方式", cell: (payment) => payment.provider.toUpperCase() },
    {
      id: "amount",
      header: "金額",
      cell: (payment) => <span className="font-medium">{centsToHkd(payment.amount_cents)}</span>,
    },
    {
      id: "purpose",
      header: "用途",
      cell: (payment) => paymentPurposeText(payment.donation),
    },
    {
      id: "reference",
      header: "參考",
      cell: (payment) => (
        <div>
          <div>{payment.provider_ref ?? "—"}</div>
          {payment.bank_reference && (
            <div className="text-xs text-[var(--color-text-muted)]">{payment.bank_reference}</div>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "收款狀態",
      cell: (payment) => {
        const pill = paymentStatusPill(payment.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      id: "receipt",
      header: "收條",
      cell: (payment) => {
        const pill = receiptPill(payment, receipts);
        return pill ? <StatusPill tone={pill.tone}>{pill.label}</StatusPill> : <span>—</span>;
      },
    },
    { id: "actions", header: "操作", cell: rowActions },
  ];

  function renderMobileCard(payment: AdminPaymentRow) {
    const statusPill = paymentStatusPill(payment.status);
    const rPill = receiptPill(payment, receipts);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-[var(--color-panel)]">
              {payment.donation.supporter.name}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {payment.provider.toUpperCase()} · {paymentPurposeText(payment.donation)}
            </div>
          </div>
          <div className="text-right font-medium">{centsToHkd(payment.amount_cents)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusPill.tone}>{statusPill.label}</StatusPill>
          {rPill && <StatusPill tone={rPill.tone}>{rPill.label}</StatusPill>}
        </div>
        {rowActions(payment)}
      </div>
    );
  }

  const summaryCards = [
    ["待確認手動收款", String(summary.awaitingReconcile)],
    ["待發收條", String(summary.awaitingReceipt)],
    ["已確認金額", centsToHkd(summary.confirmedAmountCents)],
  ];

  const activity = activityData?.activity ?? [];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {label}
            </p>
            <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Input
          value={filters.search}
          onChange={(event) => updateFilters({ search: event.target.value })}
          placeholder="搜尋姓名 / 電郵 / 參考"
          className="max-w-xs"
        />
        <Select
          value={filters.status}
          onValueChange={(value) => updateFilters({ status: value as PaymentFilters["status"] })}
        >
          <SelectTrigger className="w-36" aria-label="收款狀態篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.provider}
          onValueChange={(value) =>
            updateFilters({ provider: value as PaymentFilters["provider"] })
          }
        >
          <SelectTrigger className="w-36" aria-label="收款方式篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button type="button" variant="outline" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />
            匯出 CSV
          </Button>
          {exportError && <p className="text-xs text-[var(--color-error)]">{exportError}</p>}
        </div>
      </section>

      {actionError && <p className="text-sm text-[var(--color-error)]">{actionError}</p>}

      <DataTable
        columns={columns}
        rows={payments}
        getRowKey={(payment) => payment.id}
        loading={isLoading || isFetching}
        empty="沒有收款紀錄"
        renderMobileCard={renderMobileCard}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-muted)]">
        <span>
          {pageStart}-{pageEnd} / {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
            aria-label="Previous payments page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
            aria-label="Next payments page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--color-panel)]">最近收款活動</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {activity.length === 0 && (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">暫無活動紀錄。</p>
          )}
          {activity.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm text-[var(--color-panel)]">
                {financeActionLabel(item.action)}
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                  {item.actorEmail ?? "系統"}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {formatActivityTime(item.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
