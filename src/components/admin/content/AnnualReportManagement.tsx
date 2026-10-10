import { useState } from "react";
import { FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { AnnualReport, DocumentAsset } from "../../../lib/documents/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { requiredReasonDialog } from "../confirmActionState";
import { LoadFailure, type ViewLoadFailure } from "../LoadFailure";
import { DocumentAdminError, documentErrorMessage } from "./documentErrors";
import { annualReportDeleteRequest, sendDocumentDelete } from "./documentDelete";
import { documentsCopy } from "./documentsCopy";
import { fetchAllAnnualReportAssets } from "./documentManagementLogic";

type AssetListResponse = { items: DocumentAsset[]; total: number };

export function AnnualReportManagement({ initialRows }: { initialRows?: AnnualReport[] }) {
  if (initialRows) return <AnnualReportManagementView rows={initialRows} />;
  return <AnnualReportManagementRuntime />;
}

function AnnualReportManagementRuntime() {
  const { language } = useAdminLanguage();
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
        throw new DocumentAdminError("report_fields_required");
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
      reason,
    }: {
      id: string;
      action: "publish" | "unpublish" | "delete" | "order";
      nextSortOrder?: number;
      reason?: string;
    }) => {
      if (action === "order") {
        return fetchAdminJson(`/api/admin/annual-reports/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: nextSortOrder }),
        });
      }
      if (action === "delete") {
        const request = annualReportDeleteRequest(id, reason ?? null);
        if (!request) throw new Error("A reason is required to delete an annual report");
        return sendDocumentDelete(request, language);
      }
      return fetchAdminJson(`/api/admin/annual-reports/${id}/publish`, {
        method: action === "publish" ? "POST" : "DELETE",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-annual-reports"] }),
  });

  const loadError = reportsQuery.error ?? assetsQuery.error;
  const error =
    documentErrorMessage(createMutation.error, language) ??
    (actionMutation.variables?.action === "delete"
      ? null
      : documentErrorMessage(actionMutation.error, language));

  return (
    <AnnualReportManagementView
      rows={reportsQuery.data ?? []}
      assets={assetsQuery.data ?? []}
      loading={reportsQuery.isLoading}
      loadFailure={
        loadError
          ? {
              error: loadError,
              heading: documentErrorMessage(loadError, language),
              onRetry: () => {
                void reportsQuery.refetch();
                void assetsQuery.refetch();
              },
            }
          : null
      }
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
      onAction={(id, action, nextSortOrder, reason) => {
        const run = actionMutation.mutateAsync({ id, action, nextSortOrder, reason });
        // Only a delete waits in its confirm dialog; the other actions show their error on the page.
        if (action === "delete") return run;
        run.catch(() => undefined);
      }}
    />
  );
}

type ViewProps = {
  rows: AnnualReport[];
  assets?: DocumentAsset[];
  loading?: boolean;
  /** The reports or their documents failed to load. Shown as a failure with a retry. */
  loadFailure?: ViewLoadFailure | null;
  /** A refusal or failure of a create or an action. */
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
    reason?: string,
  ) => void | Promise<unknown>;
};

export function AnnualReportManagementView({
  rows,
  assets = [],
  loading = false,
  loadFailure = null,
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
  const common = useAdminCopy(documentsCopy);
  const copy = common.annualReports;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteTitle = rows.find((report) => report.id === deleteId)?.title ?? "";
  return (
    <div className="space-y-6 p-6">
      {/* required-reason: annual_report.delete */}
      <ConfirmActionDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title={copy.table.deleteLabel(deleteTitle)}
        consequence={copy.table.confirmDelete(deleteTitle)}
        confirmLabel={copy.table.deleteLabel(deleteTitle)}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async (reason) => {
          if (deleteId !== null && reason !== null) {
            await onAction?.(deleteId, "delete", undefined, reason);
          }
        }}
      />
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{common.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
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
            {copy.form.title}
            <input
              value={title}
              onChange={(event) => onTitleChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.form.year}
            <input
              value={yearLabel}
              onChange={(event) => onYearLabelChange?.(event.target.value)}
              placeholder={copy.form.yearPlaceholder}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.form.pdf}
            <select
              value={documentAssetId}
              onChange={(event) => onDocumentAssetChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="">{copy.form.choose}</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {copy.form.assetOption(asset.title, asset.isPublished)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.form.order}
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
            {copy.form.submit}
          </button>
        </form>
      ) : null}

      {loadFailure ? (
        <LoadFailure
          error={loadFailure.error}
          onRetry={loadFailure.onRetry}
          title={loadFailure.heading ?? undefined}
        />
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
              <th className="px-3 py-3">{copy.table.report}</th>
              <th className="px-3 py-3">{copy.table.pdf}</th>
              <th className="px-3 py-3">{copy.table.order}</th>
              <th className="px-3 py-3">{copy.table.status}</th>
              <th className="px-3 py-3 text-right">{copy.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  {copy.table.loading}
                </td>
              </tr>
            ) : rows.length === 0 && !error && !loadFailure ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-muted)]">
                  {copy.table.empty}
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
                          {copy.table.publishPdfFirst}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {onAction ? (
                        <input
                          disabled={actionPending}
                          aria-label={copy.table.orderLabel(report.title)}
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
                    <td className="px-3 py-3">
                      {report.isPublished ? copy.table.published : copy.table.draft}
                    </td>
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
                          {report.isPublished ? copy.table.unpublish : copy.table.publish}
                        </button>
                        {onAction ? (
                          <button
                            type="button"
                            aria-label={copy.table.deleteLabel(report.title)}
                            disabled={actionPending}
                            onClick={() => setDeleteId(report.id)}
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
