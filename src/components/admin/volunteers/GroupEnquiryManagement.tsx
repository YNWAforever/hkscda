import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  GroupEnquiry,
  GroupEnquiryStatus,
  GroupEnquirySummary,
} from "../../../lib/groupEnquiries/types";
import { DataTable, type DataTableColumn } from "../DataTable";
import { TablePager } from "../TablePager";
import {
  availableEnquiryTransitions,
  buildGroupEnquirySearchParams,
  GROUP_ENQUIRY_PAGE_SIZE,
  groupEnquiryActivityLabels,
  groupEnquiryNotificationLabels,
  groupEnquiryStatusLabels,
} from "./groupEnquiryAdminLogic";

type GroupEnquiryListResponse = { enquiries: GroupEnquirySummary[]; total: number };

const inputClass =
  "min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

const buttonBase =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold " +
  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function statusClass(status: GroupEnquiryStatus) {
  if (status === "resolved") {
    return "bg-[var(--color-success-highlight)] text-[var(--color-success)]";
  }
  if (status === "new") return "bg-[var(--color-primary-highlight)] text-[var(--color-primary)]";
  return "bg-[var(--color-surface-offset)] text-[var(--color-panel)]";
}

export function GroupEnquiryManagement() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<GroupEnquiryStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const search = useMemo(
    () => buildGroupEnquirySearchParams({ q, status, page }).toString(),
    [q, status, page],
  );

  const enquiriesQuery = useQuery({
    queryKey: ["group-enquiries", search],
    queryFn: () =>
      fetchAdminJson<GroupEnquiryListResponse>(`/api/admin/volunteers/group-enquiries?${search}`),
  });
  const detailQuery = useQuery({
    queryKey: ["group-enquiry", selectedId],
    queryFn: () =>
      fetchAdminJson<{ enquiry: GroupEnquiry }>(
        `/api/admin/volunteers/group-enquiries?id=${selectedId}`,
      ),
    enabled: Boolean(selectedId),
  });

  const detail = detailQuery.data?.enquiry;

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchAdminJson("/api/admin/volunteers/group-enquiries", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-enquiries"] });
      void queryClient.invalidateQueries({ queryKey: ["group-enquiry", selectedId] });
    },
  });

  function applyFilter(change: () => void) {
    change();
    setPage(1);
  }

  const columns: DataTableColumn<GroupEnquirySummary>[] = [
    {
      id: "organisation",
      header: "團體",
      cell: (row) => (
        <div>
          <button
            type="button"
            className="cursor-pointer font-semibold text-[var(--color-primary)] hover:underline"
            onClick={() => setSelectedId(row.id)}
          >
            {row.organisationName}
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">{row.contactPerson}</p>
        </div>
      ),
    },
    {
      id: "activity",
      header: "活動類型",
      cell: (row) => (
        <div className="text-sm">
          <p className="text-[var(--color-panel)]">
            {groupEnquiryActivityLabels[row.activityType]}
          </p>
          {row.participantCount !== null ? (
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              約 {row.participantCount} 人
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: "狀態",
      cell: (row) => (
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(row.status)}`}>
          {groupEnquiryStatusLabels[row.status]}
        </span>
      ),
    },
    {
      id: "notification",
      header: "通知",
      cell: (row) => (
        <span
          className={`text-xs ${
            row.notificationStatus === "failed"
              ? "font-semibold text-[var(--color-error)]"
              : "text-[var(--color-text-muted)]"
          }`}
        >
          {groupEnquiryNotificationLabels[row.notificationStatus]}
        </span>
      ),
    },
    {
      id: "created",
      header: "查詢日期",
      cell: (row) => (
        <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
          {new Date(row.createdAt).toLocaleDateString("zh-HK", { dateStyle: "medium" })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">團體查詢</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            管理團體活動查詢、內部備註、狀態及失敗通知重試。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["group-enquiries"] })}
          className={`${buttonBase} min-h-11 border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface-offset)]`}
        >
          <RefreshCw className="h-4 w-4" />
          重新整理
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--color-panel)]">搜尋</span>
          <input
            value={q}
            onChange={(event) => applyFilter(() => setQ(event.target.value))}
            placeholder="團體名稱或聯絡人"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--color-panel)]">狀態</span>
          <select
            value={status}
            onChange={(event) =>
              applyFilter(() => setStatus(event.target.value as GroupEnquiryStatus | "all"))
            }
            className={inputClass}
          >
            <option value="all">全部狀態</option>
            {Object.entries(groupEnquiryStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <DataTable
          columns={columns}
          rows={enquiriesQuery.data?.enquiries ?? []}
          getRowKey={(row) => row.id}
          loading={enquiriesQuery.isLoading}
          empty="沒有符合條件的團體查詢。"
        />
        <TablePager
          page={page}
          pageSize={GROUP_ENQUIRY_PAGE_SIZE}
          total={enquiriesQuery.data?.total}
          onPageChange={setPage}
          busy={enquiriesQuery.isFetching}
          label="團體查詢"
        />
      </div>

      {detail ? (
        <EnquiryDetailPanel
          key={detail.id}
          detail={detail}
          pending={patch.isPending}
          failed={patch.isError}
          onPatch={(body) => patch.mutate(body)}
        />
      ) : null}
    </div>
  );
}

/**
 * Detail panel, remounted per enquiry via `key={detail.id}`.
 *
 * adminNotes used to be state on the parent that nothing reset, so text typed
 * against one enquiry was still in the box when a different one was opened —
 * and saving wrote it onto the wrong record. Keying the panel makes that
 * impossible by construction: a different enquiry is a different component
 * instance with its own freshly seeded state.
 */
function EnquiryDetailPanel({
  detail,
  pending,
  failed,
  onPatch,
}: {
  detail: GroupEnquiry;
  pending: boolean;
  failed: boolean;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [adminNotes, setAdminNotes] = useState(detail.adminNotes ?? "");

  return (
    <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-panel)]">{detail.organisationName}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {detail.contactPerson} · {detail.email} · {detail.phone}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(detail.status)}`}>
          {groupEnquiryStatusLabels[detail.status]}
        </span>
      </div>

      {/* The enquiry's own content was never shown — staff had to guess what
              the group actually asked for. */}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--color-text-muted)]">活動類型</dt>
          <dd className="text-[var(--color-panel)]">
            {groupEnquiryActivityLabels[detail.activityType]}
            {detail.otherActivityDescription ? `（${detail.otherActivityDescription}）` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-muted)]">人數</dt>
          <dd className="tabular-nums text-[var(--color-panel)]">
            {detail.participantCount ?? "未提供"}
            {detail.participantAgeProfile ? ` · ${detail.participantAgeProfile}` : ""}
          </dd>
        </div>
        {detail.preferredDateNotes ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--color-text-muted)]">期望日期</dt>
            <dd className="text-[var(--color-panel)]">{detail.preferredDateNotes}</dd>
          </div>
        ) : null}
        {detail.message ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--color-text-muted)]">查詢內容</dt>
            <dd className="whitespace-pre-wrap text-[var(--color-panel)]">{detail.message}</dd>
          </div>
        ) : null}
      </dl>

      {detail.notificationStatus === "failed" ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-error)] bg-[var(--color-primary-highlight)] p-3 text-sm font-semibold text-[var(--color-error)]"
        >
          通知發送失敗：{detail.notificationError ?? "未提供錯誤訊息"}
        </p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-[var(--color-panel)]">內部備註</span>
        <textarea
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          placeholder="只有職員看到，例如跟進安排或聯絡紀錄"
          className="min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
        <span className="text-xs text-[var(--color-text-muted)]">更新狀態並儲存備註：</span>
        {availableEnquiryTransitions(detail.status).map((next) => (
          <button
            key={next}
            type="button"
            disabled={pending}
            onClick={() => onPatch({ id: detail.id, status: next, adminNotes })}
            className={`${buttonBase} border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]`}
          >
            {groupEnquiryStatusLabels[next]}
          </button>
        ))}
        {detail.notificationStatus === "failed" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onPatch({ id: detail.id, action: "retryNotification" })}
            className={`${buttonBase} bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90`}
          >
            <Send className="h-3.5 w-3.5" />
            重新發送通知
          </button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          更新失敗，請稍後再試。
        </p>
      ) : null}
    </section>
  );
}
