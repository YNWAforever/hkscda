import { useEffect, useRef, useState } from "react";

import type { ContactFormatPreviewResponse } from "../../../lib/crm/contactFormatPreview";
import { adminErrorMessage } from "../../../lib/admin/session";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import { contactFormatCopy } from "./bulkCopy";

const endpoint = "/api/admin/supporters/format-preview";
const pageSize = 25;

export function CrmContactFormatPreviewPanel({
  selectedIds,
  query,
  roleFilter,
  selectionDisabled,
}: {
  selectedIds: string[];
  query: string;
  roleFilter: string;
  selectionDisabled: boolean;
}) {
  const copy = useAdminCopy(contactFormatCopy);
  const { language } = useAdminLanguage();
  const selectionKey = JSON.stringify([query, roleFilter, selectedIds]);
  const selectionKeyRef = useRef(selectionKey);
  const requestGeneration = useRef(0);
  if (selectionKeyRef.current !== selectionKey) {
    selectionKeyRef.current = selectionKey;
    requestGeneration.current += 1;
  }
  const [result, setResult] = useState<{
    selectionKey: string;
    value: ContactFormatPreviewResponse;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // The caught error, written for the current language when it is shown.
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setResult(null);
    setFailure(null);
    setBusy(false);
    setPage(1);
    const generation = requestGeneration;
    return () => {
      generation.current += 1;
    };
  }, [selectionKey, selectionDisabled]);

  async function preview() {
    if (busy || selectionDisabled || selectedIds.length < 1 || selectedIds.length > 1000) return;
    const scope = selectionKey;
    const generation = ++requestGeneration.current;
    const isCurrent = () =>
      requestGeneration.current === generation && selectionKeyRef.current === scope;
    setBusy(true);
    setFailure(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (!isCurrent()) return;
      const value = await fetchAdminJson<ContactFormatPreviewResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, filterHash }),
      });
      if (!isCurrent() || value.filterHash !== filterHash) return;
      setResult({ selectionKey: scope, value });
      setPage(1);
    } catch (cause) {
      if (isCurrent()) {
        setFailure({ cause });
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  const previewResult = result?.selectionKey === selectionKey ? result.value : null;
  const pageCount = previewResult ? Math.ceil(previewResult.items.length / pageSize) : 0;
  const pageItems = previewResult?.items.slice((page - 1) * pageSize, page * pageSize) ?? [];
  const label = copy.statuses;

  return (
    <section
      aria-label={copy.panelLabel}
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </div>
      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {copy.selectedCount(selectedIds.length)}
      </p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy || selectionDisabled || selectedIds.length === 0 || selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? copy.checking : copy.preview}
      </button>
      {failure && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {adminErrorMessage(failure.cause, language) ?? copy.previewFailed}
        </p>
      )}
      {previewResult && (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            {label.suggested} {previewResult.counts.suggested} · {label.manual_review}{" "}
            {previewResult.counts.manual_review} · {label.unchanged}{" "}
            {previewResult.counts.unchanged} · {label.skipped} {previewResult.counts.skipped}
          </p>
          <div className="overflow-x-auto" role="region" aria-label={copy.regionLabel} tabIndex={0}>
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-2 py-2">
                    {copy.columns.supporterId}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {copy.columns.status}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {copy.columns.current}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {copy.columns.suggestion}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr
                    key={item.entityId}
                    className="border-b border-[var(--color-border)] align-top"
                  >
                    <th scope="row" className="break-all px-2 py-2 font-normal">
                      {item.entityId}
                    </th>
                    <td className="px-2 py-2">{label[item.status]}</td>
                    <td className="px-2 py-2">
                      {item.before
                        ? [item.before.name, item.before.email, item.before.phone ?? "-"].join(
                            " / ",
                          )
                        : "-"}
                    </td>
                    <td className="px-2 py-2">
                      {item.after
                        ? [item.after.name, item.after.email, item.after.phone ?? "-"].join(" / ")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="btn-secondary min-h-11"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {copy.previous}
              </button>
              <span>{copy.pageOf(page, pageCount)}</span>
              <button
                type="button"
                className="btn-secondary min-h-11"
                disabled={page === pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                {copy.next}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
