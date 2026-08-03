import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  GroupEnquiry,
  GroupEnquiryStatus,
  GroupEnquirySummary,
} from "../../../lib/groupEnquiries/types";
import { DataTable, type DataTableColumn } from "../DataTable";

type GroupEnquiryListResponse = { enquiries: GroupEnquirySummary[]; total: number };

function buildSearch(q: string, status: string) {
  const params = new URLSearchParams({ page: "1", pageSize: "25" });
  if (q.trim()) params.set("q", q.trim());
  if (status && status !== "all") params.set("status", status);
  return params.toString();
}

export function GroupEnquiryManagement() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const search = useMemo(() => buildSearch(q, status), [q, status]);

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

  const columns: DataTableColumn<GroupEnquirySummary>[] = [
    {
      id: "organisation",
      header: "團體",
      cell: (row) => (
        <button
          type="button"
          className="font-semibold text-[var(--color-primary)]"
          onClick={() => setSelectedId(row.id)}
        >
          {row.organisationName}
        </button>
      ),
    },
    { id: "contact", header: "聯絡人", cell: (row) => row.contactPerson },
    { id: "activity", header: "活動", cell: (row) => row.activityType },
    { id: "status", header: "狀態", cell: (row) => row.status },
    { id: "notification", header: "通知", cell: (row) => row.notificationStatus },
  ];

  const detail = detailQuery.data?.enquiry;

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
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" /> 重新整理
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜尋團體或聯絡人"
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <option value="all">全部狀態</option>
          {(["new", "in_progress", "resolved", "closed"] as GroupEnquiryStatus[]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={enquiriesQuery.data?.enquiries ?? []}
        getRowKey={(row) => row.id}
        loading={enquiriesQuery.isLoading}
        empty="沒有團體查詢"
      />

      {detail && (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-lg font-bold">{detail.organisationName}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {detail.email} · {detail.phone}
          </p>
          {detail.notificationStatus === "failed" && (
            <p className="text-sm font-semibold text-[var(--color-error)]">
              failed: {detail.notificationError}
            </p>
          )}
          <textarea
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
            placeholder="adminNotes"
            className="min-h-24 w-full rounded-md border border-[var(--color-border)] px-3 py-2"
          />
          <div className="flex flex-wrap gap-2">
            {(["in_progress", "resolved", "closed"] as GroupEnquiryStatus[]).map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => patch.mutate({ id: detail.id, status: next, adminNotes })}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
              >
                {next}
              </button>
            ))}
            <button
              type="button"
              onClick={() => patch.mutate({ id: detail.id, action: "retryNotification" })}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
            >
              retryNotification
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
