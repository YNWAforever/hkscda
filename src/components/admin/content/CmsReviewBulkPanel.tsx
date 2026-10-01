import { useEffect, useRef, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { CmsReviewBulkOperation } from "../../../routes/api/admin/content/review-bulk";
import { BulkReview } from "../bulk/BulkReview";

const endpoint = "/api/admin/content/review-bulk";
const savedOperationKey = "cms-review-bulk-operation";
const label = (value: string | null) =>
  value === "needs_review"
    ? "待核實"
    : value === "approved"
      ? "已核實"
      : value === "demo"
        ? "示範資料"
        : "未分類";

export function CmsReviewBulkPanel({
  selectedIds,
  filterKey,
  selectionDisabled,
}: {
  selectedIds: string[];
  filterKey: string;
  selectionDisabled: boolean;
}) {
  const [evidence, setEvidence] = useState("");
  const [operation, setOperation] = useState<CmsReviewBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState("");
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
        if (active) setError("未能讀取已保存的操作，請重新讀取結果。");
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
    setError("");
    try {
      setOperation(
        await fetchAdminJson<CmsReviewBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(recoveryId),
        ),
      );
    } catch {
      setError("未能讀取已保存的操作，請稍後重新讀取結果。");
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
    setError("");
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
      setError(cause instanceof Error ? cause.message : "無法建立送審預覽");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!operation || busy) return;
    setBusy(true);
    setError("");
    try {
      setOperation(
        await fetchAdminJson<CmsReviewBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法套用；請重新讀取結果");
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

  return (
    <section aria-label="CMS 草稿批量送審" className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-bold">批量送交 CMS 草稿來源審核</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        只為未公開、未分類的已儲存草稿建立待核實記錄；不修改公開狀態、媒體或內容正文。
        套用時逐筆重查職員權限、草稿版本及現有分類。
      </p>
      <label className="block text-sm">
        送審來源及理由
        <textarea
          disabled={busy}
          maxLength={2000}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          className="mt-1 min-h-24 w-full rounded border p-2"
        />
      </label>
      <p className="text-sm">已選 {selectedIds.length} 筆（最多 1000）</p>
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
        {busy ? "處理中…" : "建立送審預覽"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      {recoveryId && (
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={busy}
          onClick={reloadOperation}
        >
          重新讀取結果
        </button>
      )}
      {operation && (
        <>
          <p className="break-words text-sm">本次理由：{operation.evidence}</p>
          <BulkReview
            key={operation.operationId}
            title={"CMS 草稿送審 · " + operation.items.length + " 筆"}
            operationId={operation.operationId}
            expiresAt={operation.expiresAt}
            items={operation.items.map((item) => ({
              entityId: item.entityId,
              status: item.status,
              reasonCode: item.reasonCode,
              before: label(item.beforeClassification),
              after: label(item.afterClassification),
            }))}
            busy={busy}
            onApply={apply}
          />
        </>
      )}
    </section>
  );
}
