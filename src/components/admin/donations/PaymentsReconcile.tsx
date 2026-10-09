import { useLiveAdminActor } from "../../../lib/admin/useLiveAdminActor";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileCheck, FileX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import {
  PAYMENT_RECONCILE_PAGE_SIZE,
  type AdminPaymentListResult,
} from "../../../lib/donations/adminPayments";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { useAdminCopy } from "../i18n/copy";
import { errorTextCopy } from "../i18n/errorTextCopy";
import { StatFigure } from "../LoadFailure";
import { StatusPill } from "../StatusBadge";
import { BankStatementDryRunPanel } from "./BankStatementDryRunPanel";
import { paymentsCopy } from "./copy";
import { DonationDeliveryWorklist } from "./DonationDeliveryWorklist";
import { donationFormatCopy } from "./formatCopy";
import { ReconcileDialog } from "./ReconcileDialog";
import {
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  canIssueReceipt,
  canReconcile,
  canVoidReceipt,
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

const STATUS_VALUES: PaymentFilters["status"][] = [
  "all",
  "pending",
  "succeeded",
  "failed",
  "refunded",
];

const PROVIDER_VALUES: PaymentFilters["provider"][] = [
  "all",
  "stripe",
  "paypal",
  "fps",
  "payme",
  "manual",
];

export function PaymentsReconcile() {
  const liveActor = useLiveAdminActor();
  const queryClient = useQueryClient();
  const { pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(paymentsCopy);
  const format = useAdminCopy(donationFormatCopy);
  const errorText = useAdminCopy(errorTextCopy);
  const [filters, setFilters] = useState<PaymentFilters>({
    status: "all",
    provider: "all",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // The caught error, written for the current language when it is shown.
  const [exportFailure, setExportFailure] = useState<{ cause: unknown } | null>(null);

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

  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", paymentSearch],
    queryFn: () => fetchAdminJson<AdminPaymentListResult>(`/api/admin/payments?${paymentSearch}`),
    placeholderData: keepPreviousData,
  });
  const { data, isLoading, isFetching } = paymentsQuery;
  // A failed load also leaves `data` undefined, so the `?? 0` defaults below
  // would report "0 awaiting reconciliation" and "HK$0.00 confirmed" for an
  // outage -- figures a treasurer would reasonably read as "nothing to do".
  const paymentsFailed = paymentsQuery.isError;

  const { data: identityData, isError: identityError } = useQuery(adminIdentityQueryOptions());

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
    setExportFailure(null);
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
        // A refusal carries the server's own reason when it sent one.
        setExportFailure({ cause: typeof body.error === "string" ? new Error(body.error) : null });
        return;
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
      setExportFailure({ cause: error });
    }
  }

  const actionFailure = issueReceipt.error ?? voidReceipt.error;
  const actionError = actionFailure ? errorText.describe(actionFailure, "") : "";

  function rowActions(payment: AdminPaymentRow) {
    const issued = findIssuedReceipt(payment.donation.id, receipts);
    return (
      <div className="flex flex-wrap gap-2">
        {canReconcile(payment, adminRole) && (
          <ReconcileDialog
            paymentId={payment.id}
            supporterName={payment.donation.supporter.name}
            amountLabel={format.money(payment.amount_cents)}
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
            {copy.issueReceipt}
          </Button>
        )}
        {canVoidReceipt(payment, receipts, adminRole) && issued && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(copy.confirmVoid(issued.receipt_no)))
                voidReceipt.mutate(issued.id);
            }}
            disabled={voidReceipt.isPending}
          >
            <FileX className="h-4 w-4" />
            {copy.voidReceipt}
          </Button>
        )}
      </div>
    );
  }

  const columns: DataTableColumn<AdminPaymentRow>[] = [
    {
      id: "supporter",
      header: copy.columns.supporter,
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
    {
      id: "provider",
      header: copy.columns.provider,
      cell: (payment) => payment.provider.toUpperCase(),
    },
    {
      id: "amount",
      header: copy.columns.amount,
      cell: (payment) => (
        <span className="font-medium">
          {format.money(payment.amount_cents)}
          {Boolean(payment.refunded_cents) && (
            <small className="block">
              {copy.refundedLine(
                format.money(payment.refunded_cents ?? 0),
                format.money(payment.amount_cents - (payment.refunded_cents ?? 0)),
              )}
            </small>
          )}
        </span>
      ),
    },
    {
      id: "purpose",
      header: copy.columns.purpose,
      cell: (payment) => paymentPurposeText(payment.donation, copy),
    },
    {
      id: "reference",
      header: copy.columns.reference,
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
      header: copy.columns.status,
      cell: (payment) => {
        const pill = paymentStatusPill(payment.status, copy);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      id: "receipt",
      header: copy.columns.receipt,
      cell: (payment) => {
        const pill = receiptPill(payment, receipts, copy);
        return pill ? <StatusPill tone={pill.tone}>{pill.label}</StatusPill> : <span>—</span>;
      },
    },
    { id: "actions", header: copy.columns.actions, cell: rowActions },
  ];

  function renderMobileCard(payment: AdminPaymentRow) {
    const statusPill = paymentStatusPill(payment.status, copy);
    const rPill = receiptPill(payment, receipts, copy);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-[var(--color-panel)]">
              {payment.donation.supporter.name}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {payment.provider.toUpperCase()} · {paymentPurposeText(payment.donation, copy)}
            </div>
          </div>
          <div className="text-right font-medium">{format.money(payment.amount_cents)}</div>
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
    [copy.summary.awaitingReconcile, String(summary.awaitingReconcile)],
    [copy.summary.awaitingReceipt, String(summary.awaitingReceipt)],
    [copy.summary.confirmedAmount, format.money(summary.confirmedAmountCents)],
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
            <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">
              <StatFigure value={value} failed={paymentsFailed} loading={isLoading} />
            </p>
          </div>
        ))}
      </section>

      {!identityError &&
        identityData?.admin.status === "active" &&
        liveActor === identityData.admin.authUserId &&
        (adminRole === "treasurer" || adminRole === "admin") && (
          <BankStatementDryRunPanel
            key={`${identityData.admin.authUserId}:${adminRole}`}
            actorUserId={identityData.admin.authUserId}
          />
        )}
      {(adminRole === "treasurer" || adminRole === "admin") && <DonationDeliveryWorklist />}

      <section className="flex flex-wrap items-center gap-2">
        <Input
          value={filters.search}
          onChange={(event) => updateFilters({ search: event.target.value })}
          placeholder={copy.searchPlaceholder}
          className="max-w-xs"
        />
        <Select
          value={filters.status}
          onValueChange={(value) => updateFilters({ status: value as PaymentFilters["status"] })}
        >
          <SelectTrigger className="w-36" aria-label={copy.statusFilterLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? copy.allStatuses : copy.paymentStatus[value]}
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
          <SelectTrigger className="w-36" aria-label={copy.providerFilterLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? copy.allMethods : copy.providerNames[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button type="button" variant="outline" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />
            {pageCopy.common.exportCsv}
          </Button>
          {exportFailure && (
            <p className="text-xs text-[var(--color-error)]">
              {errorText.describe(exportFailure.cause, copy.exportFailed)}
            </p>
          )}
        </div>
      </section>

      {actionError && <p className="text-sm text-[var(--color-error)]">{actionError}</p>}

      <DataTable
        columns={columns}
        rows={payments}
        getRowKey={(payment) => payment.id}
        loading={isLoading || isFetching}
        empty={copy.noPayments}
        error={paymentsQuery.error}
        onRetry={() => void paymentsQuery.refetch()}
        renderMobileCard={renderMobileCard}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-muted)]">
        <span>{copy.range(pageStart, pageEnd, total)}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
            aria-label={copy.previousPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>{copy.pageIndicator(page, totalPages)}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
            aria-label={copy.nextPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.activityTitle}</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {activity.length === 0 && (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">{copy.noActivity}</p>
          )}
          {activity.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm text-[var(--color-panel)]">
                {copy.financeAction(item.action)}
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                  {item.actorEmail ?? copy.system}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {format.activityTime(item.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
