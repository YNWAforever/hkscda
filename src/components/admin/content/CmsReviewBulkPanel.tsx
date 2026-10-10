import { useEffect, useRef, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { CmsReviewBulkOperation } from "../../../routes/api/admin/content/review-bulk";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { reviewCopy } from "./reviewCopy";
import { ReviewBulkOperation } from "./ReviewBulkOperation";

const endpoint = "/api/admin/content/review-bulk";
const savedOperationKey = "cms-review-bulk-operation";

/**
 * Why the panel shows an error. It is kept as a code (the key of `copy.errors`), with the caught
 * error where the server may have given a reason, and written when the panel renders.
 */
type PanelError = {
  code: "restore_failed" | "reload_failed" | "preview_failed" | "apply_failed";
  cause?: unknown;
};

export function CmsReviewBulkPanel({
  selectedIds,
  filterKey,
  selectionDisabled,
}: {
  selectedIds: string[];
  filterKey: string;
  selectionDisabled: boolean;
}) {
  const copy = useAdminCopy(reviewCopy).bulk;
  const { language } = useAdminLanguage();
  const [evidence, setEvidence] = useState("");
  const [operation, setOperation] = useState<CmsReviewBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    setBusy(true);
    let active = true;
    fetchAdminJson<CmsReviewBulkOperation>(endpoint + "?operationId=" + encodeURIComponent(saved))
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
        await fetchAdminJson<CmsReviewBulkOperation>(
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
    if (
      busy ||
      selectionDisabled ||
      selectedIds.length < 1 ||
      selectedIds.length > 1000 ||
      evidence.trim().length < 1 ||
      evidence.trim().length > 2000
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new TextEncoder().encode(JSON.stringify({ filterKey, ids: selectedIds }));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const result = await fetchAdminJson<CmsReviewBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, evidence, filterHash }),
      });
      if (!mounted.current) return;
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
      setOperation(
        await fetchAdminJson<CmsReviewBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setError({ code: "apply_failed", cause });
      try {
        setOperation(
          await fetchAdminJson<CmsReviewBulkOperation>(
            endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
          ),
        );
      } catch {
        /* The server snapshot remains available after retry. */
      }
    } finally {
      setBusy(false);
    }
  }

  // A reason the server gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : "";

  return (
    <section aria-label={copy.cms.panelLabel} className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-bold">{copy.cms.heading}</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.cms.intro}</p>
      <label className="block text-sm">
        {copy.evidenceLabel}
        <textarea
          disabled={busy}
          maxLength={2000}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          className="mt-1 min-h-24 w-full rounded border p-2"
        />
      </label>
      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {copy.selected(selectedIds.length)}
      </p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          selectedIds.length < 1 ||
          selectedIds.length > 1000 ||
          evidence.trim().length < 1 ||
          evidence.trim().length > 2000
        }
        onClick={preview}
      >
        {busy ? copy.processing : copy.preview}
      </button>
      {errorMessage && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {errorMessage}
        </p>
      )}
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
      {operation && (
        <ReviewBulkOperation kind="cms" operation={operation} busy={busy} onApply={apply} />
      )}
    </section>
  );
}
