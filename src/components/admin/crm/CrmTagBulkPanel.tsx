import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import type { CrmTagBulkOperation } from "../../../routes/api/admin/supporters/tag-bulk";
import { adminErrorMessage } from "../../../lib/admin/session";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import { tagBulkCopy } from "./bulkCopy";

const endpoint = "/api/admin/supporters/tag-bulk";
const savedOperationKey = "crm-tag-bulk-operation";

/**
 * Why the panel shows an error. It is kept as a code (the key of `copy.errors`), with the caught
 * error where the server may have given a reason, and written when the panel renders.
 */
type PanelError = {
  code: "restore_failed" | "reload_failed" | "preview_failed" | "apply_failed";
  cause?: unknown;
};

export function CrmTagBulkPanel({
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
  const copy = useAdminCopy(tagBulkCopy);
  const { language } = useAdminLanguage();
  const [tag, setTag] = useState("");
  const [operation, setOperation] = useState<CrmTagBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState<PanelError | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    setBusy(true);
    let active = true;
    fetchAdminJson<CrmTagBulkOperation>(endpoint + "?operationId=" + encodeURIComponent(saved))
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) setError({ code: "restore_failed" });
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function reloadOperation() {
    if (!recoveryId || busy) return;
    setBusy(true);
    setError(null);
    try {
      setOperation(
        await fetchAdminJson<CrmTagBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(recoveryId),
        ),
      );
    } catch {
      setError({ code: "reload_failed" });
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (busy || selectionDisabled || selectedIds.length < 1 || selectedIds.length > 1000) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new TextEncoder().encode(
        JSON.stringify({ query, roleFilter, ids: selectedIds }),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const result = await fetchAdminJson<CrmTagBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, tag, filterHash }),
      });
      sessionStorage.setItem(savedOperationKey, result.operationId);
      setRecoveryId(result.operationId);
      setOperation(result);
    } catch (cause) {
      setError({ code: "preview_failed", cause });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!operation || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchAdminJson<CrmTagBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
      });
      setOperation(result);
    } catch (cause) {
      setError({ code: "apply_failed", cause });
      try {
        setOperation(
          await fetchAdminJson<CrmTagBulkOperation>(
            endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
          ),
        );
      } catch {
        /* The displayed snapshot stays available for review. */
      }
    } finally {
      setBusy(false);
    }
  }

  // A reason the server gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? ((error.cause === undefined ? null : adminErrorMessage(error.cause, language)) ??
      copy.errors[error.code])
    : "";

  return (
    <section
      aria-label={copy.panelLabel}
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </div>
      <label className="block max-w-sm text-sm">
        {copy.tagLabel}
        <input
          aria-label={copy.tagAria}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          value={tag}
          maxLength={40}
          onChange={(event) => setTag(event.target.value)}
        />
      </label>
      <p className="text-sm">{copy.selectedCount(selectedIds.length)}</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000 ||
          !tag.trim()
        }
        onClick={preview}
      >
        {busy ? copy.processing : copy.preview}
      </button>
      {recoveryId && (
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={busy}
          onClick={reloadOperation}
        >
          {copy.reload}
        </button>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {errorMessage}
        </p>
      )}
      {operation && (
        <BulkReview
          key={operation.operationId}
          title={copy.reviewTitle(operation.tag, operation.items.length)}
          operationId={operation.operationId}
          expiresAt={operation.expiresAt}
          items={operation.items.map((item) => ({
            entityId: item.entityId,
            status: item.status,
            reasonCode: item.reasonCode,
            before: copy.joinTags(item.beforeTags),
            after: copy.joinTags(item.afterTags),
          }))}
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
