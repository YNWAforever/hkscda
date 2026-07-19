import { useState } from "react";
import { FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { AnnualReport, DocumentAsset } from "../../../lib/documents/types";
import { fetchAllAnnualReportAssets } from "./documentManagementLogic";

type AssetListResponse = { items: DocumentAsset[]; total: number };

export function AnnualReportManagement({ initialRows }: { initialRows?: AnnualReport[] }) {
  if (initialRows) return <AnnualReportManagementView rows={initialRows} />;
  return <AnnualReportManagementRuntime />;
}

function AnnualReportManagementRuntime() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [documentAssetId, setDocumentAssetId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const reportsQuery = useQuery({
    queryKey: ["admin-annual-reports"],
    queryFn: () => fetchAdminJson<AnnualReport[]>("/api/admin/annual-reports"),
  });
  const assetsQuery = useQuery({
    queryKey: ["admin-documents", "annual-report-options"],
    queryFn: () =>
      fetchAllAnnualReportAssets((page, pageSize) =>
        fetchAdminJson<AssetListResponse>(
          `/api/admin/documents?kind=annual_report&page=${page}&pageSize=${pageSize}`,
        ),
      ),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!title.trim() || !yearLabel.trim() || !documentAssetId) {
        throw new Error("請填寫標題、年度並選擇 PDF");
      }
      return fetchAdminJson("/api/admin/annual-reports", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          yearLabel: yearLabel.trim(),
          documentAssetId,
          isPublished: false,
          sortOrder,
        }),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setYearLabel("");
      setDocumentAssetId("");
      setSortOrder(0);
      await queryClient.invalidateQueries({ queryKey: ["admin-annual-reports"] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({
      id,
      action,
      nextSortOrder,
    }: {
      id: string;
      action: "publish" | "unpublish" | "delete" | "order";
      nextSortOrder?: number;
    }) => {
      if (action === "order") {
        return fetchAdminJson(`/api/admin/annual-reports/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: nextSortOrder }),
        });
      }
      const endpoint =
        action === "delete"
          ? `/api/admin/annual-reports/${id}`
          : `/api/admin/annual-reports/${id}/publish`;
      return fetchAdminJson(endpoint, {
        method: action === "publish" ? "POST" : "DELETE",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-annual-reports"] }),
  });

  const error =
    (reportsQuery.error instanceof Error ? reportsQuery.error.message : null) ??
    (assetsQuery.error instanceof Error ? assetsQuery.error.message : null) ??
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (actionMutation.error instanceof Error ? actionMutation.error.message : null);

  return (
    <AnnualReportManagementView
      rows={reportsQuery.data ?? []}
      assets={assetsQuery.data ?? []}
      loading={reportsQuery.isLoading}
      error={error}
      title={title}
      yearLabel={yearLabel}
      documentAssetId={documentAssetId}
      sortOrder={sortOrder}
      creating={createMutation.isPending}
      onTitleChange={setTitle}
      onYearLabelChange={setYearLabel}
      onDocumentAssetChange={setDocumentAssetId}
      actionPending={actionMutation.isPending}
      onSortOrderChange={setSortOrder}
      onCreate={() => createMutation.mutate()}
      onAction={(id, action, nextSortOrder) => actionMutation.mutate({ id, action, nextSortOrder })}
    />
  );
}

type ViewProps = {
  rows: AnnualReport[];
  assets?: DocumentAsset[];
  loading?: boolean;
  error?: string | null;
  title?: string;
  yearLabel?: string;
  documentAssetId?: string;
  sortOrder?: number;
  creating?: boolean;
  onTitleChange?: (value: string) => void;
  onYearLabelChange?: (value: string) => void;
  onDocumentAssetChange?: (value: string) => void;
  actionPending?: boolean;
  onSortOrderChange?: (value: number) => void;
  onCreate?: () => void;
  onAction?: (
    id: string,
    action: "publish" | "unpublish" | "delete" | "order",
    nextSortOrder?: number,
  ) => void;
};

export function AnnualReportManagementView({
  rows,
  assets = [],
  loading = false,
  error,
  title = "",
  yearLabel = "",
  documentAssetId = "",
  sortOrder = 0,
  creating = false,
  onTitleChange,
  onYearLabelChange,
  onDocumentAssetChange,
  actionPending = false,
  onSortOrderChange,
  onCreate,
  onAction,
}: ViewProps) {
  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳內容</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">年度報告</h1>
        <p className="text-sm text-[var(--color-text-muted)]">安排公開報告年度、次序及發佈狀態。</p>
      </header>

      {onCreate ? (
        <form
          className="grid gap-3 border-y border-[var(--color-border)] py-4 lg:grid-cols-[1.4fr_0.8fr_1.4fr_0.6fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <label className="space-y-1 text-sm font-semibold">
            標題
            <input
              value={title}
              onChange={(event) => onTitleChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            年度
            <input
              value={yearLabel}
              onChange={(event) => onYearLabelChange?.(event.target.value)}
              placeholder="2025/26"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            PDF
            <select
              value={documentAssetId}
              onChange={(event) => onDocumentAssetChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="">選擇文件</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.title} · {asset.isPublished ? "已發佈" : "草稿"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            次序
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => onSortOrderChange?.(Number(event.target.value))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            新增
          </button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="border-l-4 border-[var(--color-error)] px-3 py-2 text-sm font-semibold text-[var(--color-error)]"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto border-y border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
              <th className="px-3 py-3">報告</th>
              <th className="px-3 py-3">PDF</th>
              <th className="px-3 py-3">次序</th>
              <th className="px-3 py-3">狀態</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  載入中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-muted)]">
                  尚未建立年度報告
                </td>
              </tr>
            ) : (
              rows.map((report) => {
                const canPublish = report.document.isPublished;
                return (
                  <tr
                    key={report.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-3 py-3">
                      <span className="font-semibold">{report.title}</span>
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {report.yearLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[var(--color-primary)]" />
                        {report.document.title}
                      </span>
                      {!canPublish ? (
                        <span className="mt-1 block text-xs font-semibold text-[var(--color-warning)]">
                          請先發佈 PDF
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {onAction ? (
                        <input
                          disabled={actionPending}
                          aria-label={`${report.title} 次序`}
                          type="number"
                          min={0}
                          defaultValue={report.sortOrder}
                          onBlur={(event) => {
                            if (!actionPending) {
                              onAction(report.id, "order", Number(event.target.value));
                            }
                          }}
                          className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
                        />
                      ) : (
                        report.sortOrder
                      )}
                    </td>
                    <td className="px-3 py-3">{report.isPublished ? "已發佈" : "草稿"}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={actionPending || (!report.isPublished && !canPublish)}
                          onClick={() =>
                            onAction?.(report.id, report.isPublished ? "unpublish" : "publish")
                          }
                          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {report.isPublished ? "取消發佈" : "發佈"}
                        </button>
                        {onAction ? (
                          <button
                            type="button"
                            aria-label={`刪除 ${report.title}`}
                            disabled={actionPending}
                            onClick={() => {
                              if (
                                globalThis.confirm?.(
                                  `確定刪除「${report.title}」？此操作無法復原。`,
                                )
                              ) {
                                onAction(report.id, "delete");
                              }
                            }}
                            className="rounded-md border border-[var(--color-border)] p-2 text-[var(--color-error)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
